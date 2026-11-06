"""Model router (Phase 3.1) — one provider chain behind the ``Provider`` protocol.

Default chain (override with ``LITCHAI_PROVIDER_CHAIN=groq,cloudflare,sambanova,local``):

1. **Groq** ``openai/gpt-oss-120b`` (``reasoning_effort=medium``: on ``low`` gpt-oss
   often writes its JSON into the reasoning channel and leaves ``content`` empty) — ``GROQ_API_KEY``
2. **Cloudflare Workers AI** ``@cf/openai/gpt-oss-120b`` — ``CLOUDFLARE_ACCOUNT_ID`` +
   ``CLOUDFLARE_API_TOKEN`` (or ``LITCHAI_CF_AI_TOKEN``)
3. **SambaNova** ``Meta-Llama-3.3-70B-Instruct`` — ``SAMBANOVA_API_KEY``
4. **OpenRouter** ``openai/gpt-oss-120b:free`` — only when ``OPENROUTER_API_KEY`` is set
   (``LITCHAI_OPENROUTER_MODEL`` changes the model)
5. **Local** — llama-server when ``LITCHAI_LLAMA_SERVER_URL`` is set (OpenAI-compatible
   ``/v1``), else Ollama at ``LITCHAI_OLLAMA_HOST`` (``LITCHAI_LOCAL_MODEL``, default
   ``gemma3:4b``).

The legacy single-provider ``LITCHAI_CHAT_BASE_URL/API_KEY/MODEL`` still works: it
fills the matching named slot (by host) when that slot has no key of its own.
**Cerebras** (``CEREBRAS_API_KEY``) is not in the default order (its free tier answers
402); name it in ``LITCHAI_PROVIDER_CHAIN`` to use it.

Behaviour (ported in spirit from the realtors-practice LiteLLM router, without
the LiteLLM dependency — every provider here speaks the OpenAI shape):

* **Pick once per conversation.** :meth:`ProviderRouter.pick` pins the first
  usable provider for a conversation id; later turns reuse it. Only a failure
  moves the pin down the chain.
* **Fallback with a recorded reason** on error / timeout / rate limit / daily
  quota / invalid output: ``timeout | quota | rate_limit | http_5xx | auth |
  error | invalid_output``.
* **Daily quota tracking** — per-provider request/token counters for the UTC day,
  plus "exhausted until" when a provider says its *daily* allowance is gone
  (narrow markers only — a per-minute 429 must not park a provider for hours).
* **Health probes are real completions** (1 token), cached for 10 minutes — a
  model-list call can return 200 while every completion 402s.
* **Privacy** — ``local_only`` restricts the chain to local providers; every
  cloud call is masked through :class:`~litchai.ai.privacy.Masker` and unmasked on
  return. Every call (incl. failures) is appended to the call log.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import threading
import time
from collections.abc import Callable
from dataclasses import asdict, dataclass, field, replace
from datetime import UTC, datetime, timedelta
from typing import Any, Protocol

from litchai.ai.privacy import Masker
from litchai.ai.provider import ProviderResponse

Message = dict[str, str]  # {"role": "system"|"user"|"assistant", "content": str}

FALLBACK_REASONS = (
    "timeout", "quota", "rate_limit", "http_5xx", "auth", "error", "invalid_output",
    "local_only", "unhealthy",
)


# --- provider specs ---------------------------------------------------------
@dataclass(frozen=True)
class ProviderSpec:
    name: str                       # 'groq' | 'cerebras' | 'sambanova' | 'local' | custom
    kind: str                       # 'cloud' | 'local'
    model: str
    base_url: str
    api_key: str | None = None
    api: str = "openai"             # 'openai' (chat/completions) | 'ollama' (/api/chat)
    params: dict[str, Any] = field(default_factory=dict)
    daily_requests: int | None = None
    daily_tokens: int | None = None
    timeout: float = 60.0
    zero_retention: bool = False

    @property
    def configured(self) -> bool:
        return self.kind == "local" or bool(self.api_key)

    def public(self) -> dict[str, Any]:
        """Safe to return over the API — never the key."""
        return {
            "name": self.name, "kind": self.kind, "model": self.model,
            "configured": self.configured, "zero_retention": self.zero_retention,
            "daily_requests": self.daily_requests, "daily_tokens": self.daily_tokens,
        }


def _int_env(name: str) -> int | None:
    raw = os.environ.get(name, "").strip()
    return int(raw) if raw.isdigit() else None


_KNOWN_HOSTS = {"groq": "groq.com", "cerebras": "cerebras.ai", "sambanova": "sambanova.ai"}


def default_specs(env: dict[str, str] | None = None) -> list[ProviderSpec]:
    """Build the chain from env. Unconfigured cloud slots are kept (so status can
    say "no key") but are skipped when routing."""
    e = env if env is not None else os.environ
    legacy_url = e.get("LITCHAI_CHAT_BASE_URL", "")
    legacy_key = e.get("LITCHAI_CHAT_API_KEY", "")
    legacy_model = e.get("LITCHAI_CHAT_MODEL", "")

    def key_for(name: str, env_name: str) -> tuple[str | None, str | None]:
        own = e.get(env_name) or None
        if own:
            return own, None
        if legacy_key and _KNOWN_HOSTS[name] in legacy_url:
            return legacy_key, legacy_model or None
        return None, None

    groq_key, groq_legacy_model = key_for("groq", "GROQ_API_KEY")
    cer_key, cer_legacy_model = key_for("cerebras", "CEREBRAS_API_KEY")
    sn_key, sn_legacy_model = key_for("sambanova", "SAMBANOVA_API_KEY")

    specs: dict[str, ProviderSpec] = {
        "groq": ProviderSpec(
            name="groq", kind="cloud",
            model=e.get("LITCHAI_GROQ_MODEL") or groq_legacy_model or "openai/gpt-oss-120b",
            base_url="https://api.groq.com/openai/v1", api_key=groq_key,
            # Groq's JSON mode rejects gpt-oss replies at random (json_validate_failed
            # with an empty failed_generation); the prompt asks for JSON and the
            # harness parses and checks it, so JSON mode is off here.
            # The agent loop's strict json_schema (all fields required, args as a JSON
            # string) is checked by Groq server-side; tested with gpt-oss-120b.
            # LITCHAI_GROQ_STRICT=0 turns it off.
            params={"reasoning_effort": "medium", "_prompt_json": True,
                    "_strict_schema": e.get("LITCHAI_GROQ_STRICT", "1") != "0"},
            daily_requests=_int_env("LITCHAI_GROQ_DAILY_REQUESTS") or 1000,
            daily_tokens=_int_env("LITCHAI_GROQ_DAILY_TOKENS") or 200_000,
            zero_retention=True,
        ),
        "cerebras": ProviderSpec(
            name="cerebras", kind="cloud",
            model=e.get("LITCHAI_CEREBRAS_MODEL") or cer_legacy_model or "gpt-oss-120b",
            base_url="https://api.cerebras.ai/v1", api_key=cer_key,
            params={"reasoning_effort": "medium"},
            daily_requests=_int_env("LITCHAI_CEREBRAS_DAILY_REQUESTS") or 14_400,
            daily_tokens=_int_env("LITCHAI_CEREBRAS_DAILY_TOKENS") or 1_000_000,
        ),
        "sambanova": ProviderSpec(
            name="sambanova", kind="cloud",
            model=e.get("LITCHAI_SAMBANOVA_MODEL") or sn_legacy_model
            or "Meta-Llama-3.3-70B-Instruct",
            base_url="https://api.sambanova.ai/v1", api_key=sn_key,
            daily_requests=_int_env("LITCHAI_SAMBANOVA_DAILY_REQUESTS"),
            daily_tokens=_int_env("LITCHAI_SAMBANOVA_DAILY_TOKENS"),
        ),
    }
    # Cloudflare Workers AI (OpenAI-compatible), on Litch's own Cloudflare account.
    cf_acct = e.get("CLOUDFLARE_ACCOUNT_ID") or ""
    cf_key = e.get("LITCHAI_CF_AI_TOKEN") or e.get("CLOUDFLARE_API_TOKEN") or None
    specs["cloudflare"] = ProviderSpec(
        name="cloudflare", kind="cloud",
        model=e.get("LITCHAI_CF_AI_MODEL") or "@cf/openai/gpt-oss-120b",
        base_url=f"https://api.cloudflare.com/client/v4/accounts/{cf_acct}/ai/v1",
        api_key=cf_key if cf_acct else None,
        params={"reasoning_effort": "medium"},
        daily_requests=_int_env("LITCHAI_CF_AI_DAILY_REQUESTS"),
        daily_tokens=_int_env("LITCHAI_CF_AI_DAILY_TOKENS"),
    )
    # OpenRouter: an extra cloud slot, used only when OPENROUTER_API_KEY is set.
    or_key = e.get("OPENROUTER_API_KEY") or None
    specs["openrouter"] = ProviderSpec(
        name="openrouter", kind="cloud",
        model=e.get("LITCHAI_OPENROUTER_MODEL") or "openai/gpt-oss-120b:free",
        base_url="https://openrouter.ai/api/v1", api_key=or_key,
        params={"reasoning_effort": "medium"},
        daily_requests=_int_env("LITCHAI_OPENROUTER_DAILY_REQUESTS") or 50,
        daily_tokens=_int_env("LITCHAI_OPENROUTER_DAILY_TOKENS"),
    )
    llama_url = e.get("LITCHAI_LLAMA_SERVER_URL", "").rstrip("/")
    if llama_url:
        specs["local"] = ProviderSpec(
            name="local", kind="local", api="openai",
            model=e.get("LITCHAI_LOCAL_MODEL") or "qwen3.5-4b-q4_0",
            base_url=llama_url if llama_url.endswith("/v1") else f"{llama_url}/v1",
            timeout=float(e.get("LITCHAI_LOCAL_TIMEOUT") or 180),
        )
    else:
        specs["local"] = ProviderSpec(
            name="local", kind="local", api="ollama",
            model=e.get("LITCHAI_LOCAL_MODEL") or "gemma3:4b",
            base_url=e.get("LITCHAI_OLLAMA_HOST") or "http://127.0.0.1:11434",
            timeout=float(e.get("LITCHAI_LOCAL_TIMEOUT") or 180),
        )

    # A legacy LITCHAI_CHAT_* pointing at a host we don't know becomes its own slot.
    if legacy_url and legacy_key and legacy_model and not any(
        h in legacy_url for h in _KNOWN_HOSTS.values()
    ):
        specs["chat"] = ProviderSpec(
            name="chat", kind="cloud", model=legacy_model, base_url=legacy_url.rstrip("/"),
            api_key=legacy_key,
        )

    order = [s.strip() for s in (e.get("LITCHAI_PROVIDER_CHAIN") or "").split(",") if s.strip()]
    if not order:
        # Cerebras is out of the default order (its free tier now answers 402); it
        # stays available through LITCHAI_PROVIDER_CHAIN, e.g. "groq,cerebras,local".
        order = ["groq", "cloudflare", "sambanova", *(["openrouter"] if or_key else []),
                 *(["chat"] if "chat" in specs else []), "local"]
    return [specs[n] for n in order if n in specs]


# --- errors -----------------------------------------------------------------
class ProviderError(RuntimeError):
    def __init__(self, reason: str, detail: str, retry_after: float | None = None) -> None:
        super().__init__(f"{reason}: {detail}")
        self.reason = reason
        self.detail = detail
        self.retry_after = retry_after


class AllProvidersFailed(RuntimeError):
    def __init__(self, attempts: list[FallbackEvent]) -> None:
        super().__init__("; ".join(f"{a.provider}: {a.reason}" for a in attempts) or "no provider")
        self.attempts = attempts


# Narrow on purpose: a per-minute limit must never read as a daily one.
_DAILY_MARKERS = (
    "daily free allocation", "exceeded your current quota", "requests per day",
    "tokens per day", "per day", "daily limit", "(rpd)", "(tpd)",
)
_RETRY_HINT = re.compile(r"try again in\s+(?:(\d+)h)?(?:(\d+)m)?([\d.]+)s", re.IGNORECASE)


def classify_http_error(status: int, body: str) -> ProviderError:
    low = body.lower()
    hint = _RETRY_HINT.search(body)
    retry_after = None
    if hint:
        retry_after = (
            int(hint.group(1) or 0) * 3600 + int(hint.group(2) or 0) * 60 + float(hint.group(3))
        )
    if status in (401, 403):
        return ProviderError("auth", f"HTTP {status}")
    if status == 402 or any(m in low for m in _DAILY_MARKERS):
        return ProviderError("quota", f"HTTP {status}: {body[:160]}", retry_after)
    if status == 429:
        return ProviderError("rate_limit", f"HTTP 429: {body[:160]}", retry_after)
    if status >= 500:
        return ProviderError("http_5xx", f"HTTP {status}")
    return ProviderError("error", f"HTTP {status}: {body[:160]}")


# --- transport ----------------------------------------------------------------
def _json_tail(text: str) -> str | None:
    """The last complete top-level JSON object in ``text`` (or None)."""
    dec = json.JSONDecoder()
    found: str | None = None
    i = text.find("{")
    while i != -1:
        try:
            obj, end = dec.raw_decode(text, i)
        except ValueError:
            i = text.find("{", i + 1)
            continue
        if isinstance(obj, dict):
            found = text[i:end]
        i = text.find("{", end)
    return found


def _failed_generation(resp: Any) -> str | None:
    """The model output an OpenAI-compatible JSON-mode check rejected, if any."""
    try:
        err = (resp.json() or {}).get("error") or {}
    except ValueError:
        return None
    text = err.get("failed_generation")
    return text if isinstance(text, str) and text.strip() else None



# Providers whose strict json_schema request was refused once in this process:
# later calls use the prompt + tolerant parser instead.
_STRICT_OFF: set[str] = set()


Transport = Callable[[ProviderSpec, list[Message], dict[str, Any] | None, dict[str, Any]],
                     ProviderResponse]


def http_transport(
    spec: ProviderSpec, messages: list[Message], schema: dict[str, Any] | None,
    params: dict[str, Any],
) -> ProviderResponse:
    """One chat completion over httpx. Raises :class:`ProviderError`."""
    import httpx

    started = time.monotonic()
    timeout = float(params.pop("timeout", spec.timeout))
    try:
        if spec.api == "ollama":
            options = {"temperature": params.get("temperature", 0.0), "num_ctx": 8192}
            if params.get("max_tokens"):
                options["num_predict"] = params["max_tokens"]
            body: dict[str, Any] = {
                "model": spec.model, "messages": messages, "stream": False, "options": options,
            }
            if schema is not None:
                body["format"] = schema
            resp = httpx.post(f"{spec.base_url}/api/chat", json=body, timeout=timeout)
            if resp.status_code >= 400:
                raise classify_http_error(resp.status_code, resp.text)
            data = resp.json()
            return ProviderResponse(
                text=(data.get("message") or {}).get("content", ""),
                finish_reason=data.get("done_reason"),
                input_tokens=data.get("prompt_eval_count"),
                output_tokens=data.get("eval_count"),
                latency_ms=int((time.monotonic() - started) * 1000),
            )

        body = {"model": spec.model, "messages": messages,
                "temperature": params.get("temperature", 0.0)}
        if params.get("max_tokens"):
            body["max_tokens"] = params["max_tokens"]
        for k, v in spec.params.items():
            if not k.startswith("_"):  # "_"-prefixed keys are local switches, never sent
                body.setdefault(k, v)
        strict = params.get("strict_schema")
        use_strict = (schema is not None and isinstance(strict, dict)
                      and bool(spec.params.get("_strict_schema"))
                      and spec.name not in _STRICT_OFF)
        if use_strict:
            body["response_format"] = {"type": "json_schema", "json_schema": {
                "name": "turn", "schema": strict, "strict": True}}
        elif schema is not None and not spec.params.get("_prompt_json"):
            body["response_format"] = {"type": "json_object"}
        headers = {"Content-Type": "application/json"}
        if spec.api_key:
            headers["Authorization"] = f"Bearer {spec.api_key}"
        resp = httpx.post(f"{spec.base_url}/chat/completions", json=body, headers=headers,
                          timeout=timeout)
        if resp.status_code == 400 and schema is not None:
            # Groq's JSON mode rejects a reply that isn't bare JSON (e.g. prose or a
            # fence around it) and returns it as `failed_generation`. Hand that to
            # our own validator instead of failing the provider: the harness
            # extracts the JSON or retries once with the parse error.
            failed = _failed_generation(resp)
            if failed is not None:
                return ProviderResponse(
                    text=failed, finish_reason="json_validate_failed",
                    latency_ms=int((time.monotonic() - started) * 1000),
                )
            if use_strict:
                # The provider refused the strict schema itself: turn strict off for
                # this process and send the same request once without it.
                _STRICT_OFF.add(spec.name)
                return http_transport(spec, messages, schema,
                                      {**params, "strict_schema": None, "timeout": timeout})
        if resp.status_code >= 400:
            raise classify_http_error(resp.status_code, resp.text)
        data = resp.json()
        choice = (data.get("choices") or [{}])[0]
        usage = data.get("usage") or {}
        msg = choice.get("message") or {}
        text = msg.get("content") or ""
        if not text.strip() and schema is not None:
            # gpt-oss sometimes puts the whole answer in the reasoning channel.
            text = _json_tail(msg.get("reasoning") or "") or ""
        return ProviderResponse(
            text=text,
            finish_reason=choice.get("finish_reason"),
            input_tokens=usage.get("prompt_tokens"),
            output_tokens=usage.get("completion_tokens"),
            latency_ms=int((time.monotonic() - started) * 1000),
        )
    except ProviderError:
        raise
    except httpx.TimeoutException as exc:
        raise ProviderError("timeout", type(exc).__name__) from exc
    except httpx.HTTPError as exc:
        raise ProviderError("error", f"{type(exc).__name__}: {exc}") from exc


# --- quota ------------------------------------------------------------------
def _utc_day() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%d")


def _next_utc_midnight() -> float:
    now = datetime.now(UTC)
    return (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0).timestamp()


class QuotaTracker(Protocol):
    def usage(self, provider: str) -> tuple[int, int]: ...
    def record(self, provider: str, tokens: int) -> None: ...
    def exhausted_until(self, provider: str) -> float | None: ...
    def mark_exhausted(self, provider: str, until: float) -> None: ...


class InMemoryQuota:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._day = _utc_day()
        self._usage: dict[str, list[int]] = {}
        self._exhausted: dict[str, float] = {}

    def _roll(self) -> None:
        day = _utc_day()
        if day != self._day:
            self._day, self._usage = day, {}

    def usage(self, provider: str) -> tuple[int, int]:
        with self._lock:
            self._roll()
            req, tok = self._usage.get(provider, [0, 0])
            return req, tok

    def record(self, provider: str, tokens: int) -> None:
        with self._lock:
            self._roll()
            u = self._usage.setdefault(provider, [0, 0])
            u[0] += 1
            u[1] += max(0, tokens)

    def exhausted_until(self, provider: str) -> float | None:
        until = self._exhausted.get(provider)
        if until is not None and time.time() >= until:
            self._exhausted.pop(provider, None)
            return None
        return until

    def mark_exhausted(self, provider: str, until: float) -> None:
        self._exhausted[provider] = until


# --- call log -----------------------------------------------------------------
@dataclass(frozen=True)
class CallRecord:
    conversation_id: str | None
    task: str
    provider: str
    model: str
    kind: str                     # cloud | local
    payload_hash: str
    masked: bool
    local_only: bool
    input_tokens: int | None
    output_tokens: int | None
    latency_ms: int | None
    status: str                   # ok | <fallback reason>
    fallback_from: str | None = None
    fallback_reason: str | None = None
    error: str | None = None


class CallLog(Protocol):
    def record(self, rec: CallRecord) -> None: ...


class InMemoryCallLog:
    def __init__(self) -> None:
        self.records: list[CallRecord] = []

    def record(self, rec: CallRecord) -> None:
        self.records.append(rec)


@dataclass(frozen=True)
class FallbackEvent:
    provider: str
    reason: str
    detail: str
    next_provider: str | None = None


@dataclass(frozen=True)
class RoutedResponse:
    text: str
    provider: str
    model: str
    kind: str
    masked: bool
    response: ProviderResponse
    fallbacks: list[FallbackEvent]

    def attribution(self) -> dict[str, Any]:
        return {
            "provider": self.provider, "model": self.model, "kind": self.kind,
            "masked": self.masked, "fallbacks": [asdict(f) for f in self.fallbacks],
        }


def payload_hash(messages: list[Message], schema: dict[str, Any] | None) -> str:
    blob = json.dumps({"m": messages, "s": schema}, sort_keys=True, default=str)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


# --- the router ---------------------------------------------------------------
class ProviderRouter:
    """Chain router. Also satisfies the plain :class:`~litchai.ai.provider.Provider`
    protocol (``generate``) so it drops into ``run_task`` call sites."""

    name = "router"
    model_digest: str | None = None

    def __init__(
        self,
        specs: list[ProviderSpec] | None = None,
        *,
        transport: Transport | None = None,
        quota: QuotaTracker | None = None,
        call_log: CallLog | None = None,
        health_ttl: float = 600.0,
    ) -> None:
        self.specs = specs if specs is not None else default_specs()
        self.transport = transport or http_transport
        self.quota = quota or InMemoryQuota()
        self.call_log = call_log or InMemoryCallLog()
        self.health_ttl = health_ttl
        self._pins: dict[str, str] = {}
        self._health: dict[str, tuple[float, bool, str]] = {}
        self._lock = threading.Lock()

    # -- Provider protocol shim -------------------------------------------------
    @property
    def request_model(self) -> str:
        chain = self.chain()
        return chain[0].model if chain else "none"

    def generate(
        self, prompt: str, *, schema: dict[str, Any] | None = None,
        params: dict[str, Any] | None = None,
    ) -> ProviderResponse:
        routed = self.complete([{"role": "user", "content": prompt}], schema=schema,
                               params=params, task="generate")
        # routed.text is unmasked; routed.response.text still holds the tokens.
        return replace(routed.response, text=routed.text)

    # -- chain / pin ----------------------------------------------------------
    def chain(self, *, local_only: bool = False) -> list[ProviderSpec]:
        return [
            s for s in self.specs
            if s.configured and (not local_only or s.kind == "local")
        ]

    def _available(self, spec: ProviderSpec) -> tuple[bool, str]:
        until = self.quota.exhausted_until(spec.name)
        if until is not None:
            return False, "quota"
        req, tok = self.quota.usage(spec.name)
        if spec.daily_requests is not None and req >= spec.daily_requests:
            return False, "quota"
        if spec.daily_tokens is not None and tok >= spec.daily_tokens:
            return False, "quota"
        cached = self._health.get(spec.name)
        if cached and time.monotonic() - cached[0] < self.health_ttl and not cached[1]:
            return False, "unhealthy"
        return True, ""

    def pick(self, conversation_id: str | None, *, local_only: bool = False) -> ProviderSpec | None:
        """The pinned provider for this conversation (pinning the first usable one)."""
        chain = self.chain(local_only=local_only)
        if not chain:
            return None
        with self._lock:
            pinned = self._pins.get(conversation_id or "") if conversation_id else None
            if pinned:
                spec = next((s for s in chain if s.name == pinned), None)
                if spec is not None and self._available(spec)[0]:
                    return spec
            for spec in chain:
                if self._available(spec)[0]:
                    if conversation_id:
                        self._pins[conversation_id] = spec.name
                    return spec
        return chain[-1]  # everything looks down — still try the last resort

    def pin(self, conversation_id: str, provider: str) -> None:
        with self._lock:
            self._pins[conversation_id] = provider

    def pinned(self, conversation_id: str) -> str | None:
        return self._pins.get(conversation_id)

    # -- completion ---------------------------------------------------------------
    def complete(
        self,
        messages: list[Message],
        *,
        schema: dict[str, Any] | None = None,
        params: dict[str, Any] | None = None,
        conversation_id: str | None = None,
        local_only: bool = False,
        masker: Masker | None = None,
        task: str = "chat",
        validate: Callable[[str], str | None] | None = None,
        start_after: str | None = None,
        deadline: float | None = None,
    ) -> RoutedResponse:
        """Try the pinned provider, then the rest of the chain in order.

        ``validate(text) -> error | None`` lets the caller reject an answer
        (e.g. bad JSON) so it counts as ``invalid_output`` and falls through.
        ``start_after`` skips providers up to and including that name (the harness
        uses it to move to the *next* provider after a failed retry).
        ``deadline`` (a ``time.monotonic()`` value) bounds the whole call: each
        provider gets at most the time left, and none is tried once it has passed,
        so a slow chain fails fast with reason ``timeout``.
        """
        chain = self.chain(local_only=local_only)
        if not chain:
            raise AllProvidersFailed([FallbackEvent("none", "local_only" if local_only else
                                                    "error", "no provider configured")])
        first = self.pick(conversation_id, local_only=local_only)
        order = list(chain)
        if first is not None:
            order.remove(first)
            order.insert(0, first)
        if start_after:
            names = [s.name for s in chain]
            if start_after in names:
                order = chain[names.index(start_after) + 1:]
        fallbacks: list[FallbackEvent] = []
        prev: FallbackEvent | None = None

        for i, spec in enumerate(order):
            left = None if deadline is None else deadline - time.monotonic()
            if left is not None and left < 2.0:
                fallbacks.append(FallbackEvent(spec.name, "timeout", "turn time limit reached"))
                break
            ok, why = self._available(spec)
            if not ok and i < len(order) - 1:
                ev = FallbackEvent(spec.name, why, "skipped", None)
                fallbacks.append(ev)
                prev = ev
                continue
            cloud = spec.kind == "cloud"
            m = masker if masker is not None else (Masker() if cloud else None)
            sent = (
                [{"role": x["role"], "content": m.mask(x["content"])} for x in messages]
                if cloud and m is not None else messages
            )
            p_hash = payload_hash(sent, schema)
            try:
                call_params = dict(params or {})
                if left is not None:
                    call_params["timeout"] = min(float(call_params.get("timeout", spec.timeout)),
                                                 left)
                resp = self.transport(spec, sent, schema, call_params)
                text = m.unmask(resp.text) if (cloud and m is not None) else resp.text
                err = validate(text) if validate else None
                if err:
                    raise ProviderError("invalid_output", err)
            except ProviderError as exc:
                self._on_failure(spec, exc)
                self._log(conversation_id, task, spec, p_hash, cloud, local_only, None,
                          exc.reason, prev, error=exc.detail)
                ev = FallbackEvent(spec.name, exc.reason, exc.detail[:200])
                fallbacks.append(ev)
                prev = ev
                continue
            except Exception as exc:  # noqa: BLE001 — any transport crash is a fallback
                self._log(conversation_id, task, spec, p_hash, cloud, local_only, None,
                          "error", prev, error=f"{type(exc).__name__}: {exc}"[:200])
                ev = FallbackEvent(spec.name, "error", type(exc).__name__)
                fallbacks.append(ev)
                prev = ev
                continue

            tokens = (resp.input_tokens or 0) + (resp.output_tokens or 0)
            self.quota.record(spec.name, tokens)
            self._health[spec.name] = (time.monotonic(), True, "")
            self._log(conversation_id, task, spec, p_hash, cloud, local_only, resp, "ok", prev)
            if conversation_id:
                self.pin(conversation_id, spec.name)
            fallbacks = [
                FallbackEvent(f.provider, f.reason, f.detail, spec.name) for f in fallbacks
            ]
            return RoutedResponse(
                text=text, provider=spec.name, model=spec.model, kind=spec.kind,
                masked=cloud, response=resp, fallbacks=fallbacks,
            )
        raise AllProvidersFailed(fallbacks)

    def _on_failure(self, spec: ProviderSpec, exc: ProviderError) -> None:
        if exc.reason == "quota":
            until = (time.time() + exc.retry_after) if exc.retry_after else _next_utc_midnight()
            self.quota.mark_exhausted(spec.name, until)
        elif exc.reason in ("auth", "http_5xx", "timeout"):
            self._health[spec.name] = (time.monotonic(), False, exc.reason)

    def _log(
        self, conversation_id: str | None, task: str, spec: ProviderSpec, p_hash: str,
        masked: bool, local_only: bool, resp: ProviderResponse | None, status: str,
        prev: FallbackEvent | None, *, error: str | None = None,
    ) -> None:
        try:
            self.call_log.record(CallRecord(
                conversation_id=conversation_id, task=task, provider=spec.name, model=spec.model,
                kind=spec.kind, payload_hash=p_hash, masked=masked, local_only=local_only,
                input_tokens=resp.input_tokens if resp else None,
                output_tokens=resp.output_tokens if resp else None,
                latency_ms=resp.latency_ms if resp else None, status=status,
                fallback_from=prev.provider if prev else None,
                fallback_reason=prev.reason if prev else None, error=error,
            ))
        except Exception:  # noqa: BLE001, S110 — logging must never break a call
            pass

    # -- health -------------------------------------------------------------------
    def probe(self, spec: ProviderSpec, *, force: bool = False) -> tuple[bool, str]:
        """A real 1-token completion, cached for ``health_ttl``."""
        cached = self._health.get(spec.name)
        if not force and cached and time.monotonic() - cached[0] < self.health_ttl:
            return cached[1], cached[2]
        if not spec.configured:
            return False, "no key"
        try:
            self.transport(spec, [{"role": "user", "content": "ok"}], None,
                           {"max_tokens": 1, "timeout": 15.0})
            result = (True, "")
        except ProviderError as exc:
            if exc.reason == "quota":
                self._on_failure(spec, exc)
            result = (False, exc.reason)
        except Exception as exc:  # noqa: BLE001 — a probe never raises
            result = (False, type(exc).__name__)
        self._health[spec.name] = (time.monotonic(), result[0], result[1])
        return result

    def status(self, *, probe: bool = False) -> list[dict[str, Any]]:
        """Chain + per-provider health/quota for the UI's engine sheet."""
        out = []
        now = time.monotonic()
        for spec in self.specs:
            if probe and spec.configured:
                ok, detail = self.probe(spec, force=True)
                age: int | None = 0
            else:
                cached = self._health.get(spec.name)
                if cached and now - cached[0] < self.health_ttl:
                    ok, detail, age = cached[1], cached[2], round(now - cached[0])
                else:
                    ok, detail, age = (None if spec.configured else False), (
                        "not probed yet" if spec.configured else "no key"), None
            req, tok = self.quota.usage(spec.name)
            until = self.quota.exhausted_until(spec.name)
            out.append({
                **spec.public(), "ok": ok, "detail": detail, "age_sec": age,
                "used_requests": req, "used_tokens": tok,
                "exhausted_until": datetime.fromtimestamp(until, UTC).isoformat()
                if until else None,
            })
        return out


def build_router(**kw: Any) -> ProviderRouter:
    return ProviderRouter(default_specs(), **kw)


@dataclass
class BoundRouter:
    """The chain as a plain :class:`~litchai.ai.provider.Provider` for one caller.

    Existing ``run_task`` call sites (Sage's routing and answer steps) use it
    unchanged, while every call still goes through the chain with masking,
    ``local_only``, a per-call time limit and a task name in the call log.
    ``last`` keeps the last routed response, so the caller can attribute it.
    """

    router: ProviderRouter
    task: str = "sage"
    conversation_id: str | None = None
    local_only: bool = False
    masker: Masker | None = None
    timeout: float | None = None
    name: str = "router"
    model_digest: str | None = None
    last: RoutedResponse | None = None

    @property
    def request_model(self) -> str:
        chain = self.router.chain(local_only=self.local_only)
        return chain[0].model if chain else "none"

    def generate(
        self, prompt: str, *, schema: dict[str, Any] | None = None,
        params: dict[str, Any] | None = None,
    ) -> ProviderResponse:
        p = dict(params or {})
        if self.timeout is not None:
            p["timeout"] = self.timeout
        routed = self.router.complete(
            [{"role": "user", "content": prompt}], schema=schema, params=p,
            conversation_id=self.conversation_id, local_only=self.local_only,
            masker=self.masker, task=self.task,
        )
        self.last = routed
        return replace(routed.response, text=routed.text)


def failure_reason(exc: BaseException) -> str:
    """One plain reason for a failed model call: quota | timeout | unavailable."""
    if isinstance(exc, AllProvidersFailed):
        reasons = {a.reason for a in exc.attempts}
        if reasons and reasons <= {"quota", "rate_limit", "skipped"}:
            return "quota"
        if "timeout" in reasons:
            return "timeout"
        return "unavailable"
    if isinstance(exc, ProviderError):
        return "quota" if exc.reason in ("quota", "rate_limit") else (
            "timeout" if exc.reason == "timeout" else "unavailable")
    name = type(exc).__name__.lower()
    return "timeout" if "timeout" in name else "unavailable"
