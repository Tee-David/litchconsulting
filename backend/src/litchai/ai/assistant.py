"""Admin Copilot orchestration (Milestone 8).

A two-stage router over a small tool registry, then a grounded answer:

1. **Semantic tool selection** — the message is embedded and matched against each
   tool's example utterances (embedded once). If the best match clears the
   confidence threshold, that tool is chosen with **no LLM call**; slots (ids,
   codes, actions) are pulled from the message with regexes.
2. **LLM fallback** — only when routing is low-confidence do we spend a
   constrained :func:`~litchai.ai.harness.run_task` call that extracts the intent
   *and* its slots in one enum-constrained JSON step.

READ tools run server-side and return grounded data; WRITE tools return a
**proposal only** — they never execute (the frontend confirms, then calls the
existing admin server action). The final answer is generated ONLY from retrieved
knowledge (:func:`~litchai.categorize.retrieval.hybrid_knowledge`) plus any tool
result, with citations and an "I don't know" fallback. Cache + ``ai_calls``
telemetry are reused via the harness.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Literal

from pydantic import BaseModel

from litchai.ai.cache import AiCache, AiTelemetry
from litchai.ai.harness import run_task
from litchai.ai.provider import Provider
from litchai.ai.tasks import PROMPTS_DIR, TaskPolicy, TaskSpec
from litchai.categorize.retrieval import RetrievedChunk, hybrid_knowledge
from litchai.db.repo import Repository
from litchai.embeddings import Embedder, cosine

ToolKind = Literal["read", "write"]

IDK = "I don't have anything in the knowledge base to answer that. Try rephrasing, or check the source records directly."

# Shown when a general_chat turn is routed but no external chat provider is
# configured (LITCHAI_CHAT_* unset). A friendly grounded refusal — never a hard
# error and never a hallucinated answer.
GENERAL_CHAT_UNAVAILABLE = (
    "I'm set up to answer from Litch's knowledge base — ask me about our services, "
    "tax rules, a client's documents, or the pipeline."
)


@dataclass(frozen=True)
class Tool:
    name: str
    kind: ToolKind
    description: str
    examples: tuple[str, ...]
    slots: tuple[str, ...] = ()


# The tool registry. Example utterances are embedded once (see SemanticRouter);
# keep them short and distinctive so cosine routing stays confident.
TOOLS: tuple[Tool, ...] = (
    Tool(
        name="search_knowledge",
        kind="read",
        description="Answer questions about Litch's services, pricing, tax rules, FAQs and internal SOPs.",
        examples=(
            "what services does litch consulting offer",
            "what is the vat rate in nigeria",
            "how do i request a financial statement",
            "what are the paye tax bands",
            "what is the withholding tax rate on consultancy",
            "how much does forensic accounting cost",
            "explain the companies income tax rate",
            "how does the engagement lifecycle work",
            "how do i ask a client to re-upload a document",
            "how do i return a document to the client for correction",
            "why is a document showing extraction failed",
            "how do i message a client on their request",
            "why did the client's analysis fail",
        ),
    ),
    Tool(
        name="general_chat",
        kind="read",
        description=(
            "Small talk and general reasoning NOT specific to Litch, tax or a client — "
            "greetings, thanks, brainstorming, phrasing help, generic explanations, 'who are you'."
        ),
        examples=(
            "hello, how are you",
            "thanks for your help",
            "can you help me brainstorm some ideas",
            "explain what a balance sheet is in general terms",
            "what's a good way to phrase this",
            "who are you and what can you do",
            "good morning",
            "tell me a fun fact",
        ),
    ),
    Tool(
        name="list_analyses",
        kind="read",
        description="List the documents / analyses that have been processed by LitchAI.",
        examples=(
            "list the documents we have analysed",
            "show me recent analyses",
            "what documents have been processed",
            "how many documents are in the pipeline",
        ),
    ),
    Tool(
        name="document_status",
        kind="read",
        description="Report the processing status of a specific document by id.",
        examples=(
            "what is the status of document 12",
            "is document 5 finished processing",
            "show me the status of doc 3",
        ),
        slots=("document_id",),
    ),
    Tool(
        name="engagement_status",
        kind="read",
        description="Report an engagement's compile status: template, workflow status, latest generated file.",
        examples=(
            "has engagement 3 been compiled",
            "what's the status of engagement 6",
            "is the workbook for engagement 2 ready",
            "show me engagement 4's compile status",
        ),
        slots=("engagement_id",),
    ),
    Tool(
        name="pipeline_health",
        kind="read",
        description="Summarise pipeline health: totals, statuses, how many need review, LLM fallback rate.",
        examples=(
            "how healthy is the pipeline",
            "how many documents need review",
            "show me observability metrics",
            "what is the review queue like",
        ),
    ),
    Tool(
        name="recategorize_line",
        kind="write",
        description="Propose reclassifying a transaction line to a different category.",
        examples=(
            "reclassify line 5 to bank charges",
            "recategorize line item 8 in document 3",
            "move line 2 to revenue services",
            "change the category of line 4",
        ),
        slots=("document_id", "line_item_id", "category_code"),
    ),
    Tool(
        name="transition_engagement",
        kind="write",
        description="Propose advancing an engagement (submit, approve, reject, lock, reopen).",
        examples=(
            "approve engagement 4",
            "submit engagement 2 for review",
            "reject engagement 7",
            "lock engagement 1",
        ),
        slots=("engagement_id", "engagement_action"),
    ),
)

TOOLS_BY_NAME = {t.name: t for t in TOOLS}
DEFAULT_TOOL = TOOLS_BY_NAME["search_knowledge"]
_ENGAGEMENT_ACTIONS = ("submit", "approve", "reject", "lock", "reopen")

# Safety epsilon (D4). This is a tax-advisory product: a finance/tax question
# that lands in a near-tie between general_chat and search_knowledge must fall to
# the *grounded* tool, never to ungrounded general chat. Within this cosine
# margin, search_knowledge wins.
KNOWLEDGE_TIE_EPSILON = 0.05


def _prefer_knowledge_on_tie(
    ranked: list[tuple[Tool, float]], epsilon: float
) -> list[tuple[Tool, float]]:
    """If general_chat is top but search_knowledge is within ``epsilon`` of it,
    promote search_knowledge. Keeps a borderline tax/finance question grounded
    instead of letting it drift into ungrounded chat (see KNOWLEDGE_TIE_EPSILON)."""
    if not ranked or ranked[0][0].name != "general_chat":
        return ranked
    top_score = ranked[0][1]
    for i, (tool, score) in enumerate(ranked):
        if tool.name == "search_knowledge" and (top_score - score) <= epsilon:
            return [ranked[i], *ranked[:i], *ranked[i + 1 :]]
    return ranked


# --- stage 1: semantic router ----------------------------------------------
@dataclass
class SemanticRouter:
    """Embeds each tool's example utterances once, then routes a message to the
    tool whose best example is closest by cosine (when it clears ``threshold``)."""

    embedder: Embedder
    tools: tuple[Tool, ...] = TOOLS
    threshold: float = 0.55
    tie_epsilon: float = KNOWLEDGE_TIE_EPSILON
    _index: list[tuple[Tool, list[float]]] = field(default_factory=list, init=False)

    def __post_init__(self) -> None:
        flat = [ex for t in self.tools for ex in t.examples]
        vecs = self.embedder.embed_documents(flat) if flat else []
        i = 0
        for t in self.tools:
            for _ in t.examples:
                self._index.append((t, vecs[i]))
                i += 1

    def score(self, message: str) -> list[tuple[Tool, float]]:
        qv = self.embedder.embed_query(message)
        best: dict[str, tuple[Tool, float]] = {}
        for tool, vec in self._index:
            c = cosine(qv, vec)
            if tool.name not in best or c > best[tool.name][1]:
                best[tool.name] = (tool, c)
        return sorted(best.values(), key=lambda ts: ts[1], reverse=True)

    def route(self, message: str) -> tuple[Tool, float] | None:
        ranked = _prefer_knowledge_on_tie(self.score(message), self.tie_epsilon)
        if ranked and ranked[0][1] >= self.threshold:
            return ranked[0]
        return None


# --- slot extraction (confident path — no LLM) -----------------------------
def _first_int(patterns: list[str], message: str) -> int | None:
    for pat in patterns:
        m = re.search(pat, message, re.IGNORECASE)
        if m:
            return int(m.group(1))
    return None


def extract_slots(message: str, tool: Tool) -> dict[str, Any]:
    slots: dict[str, Any] = {}
    if "document_id" in tool.slots:
        slots["document_id"] = _first_int([r"docu?m?e?n?t?\s*#?\s*(\d+)", r"\bdoc\s*#?\s*(\d+)"], message)
    if "line_item_id" in tool.slots:
        slots["line_item_id"] = _first_int([r"line(?:\s*item)?\s*#?\s*(\d+)"], message)
    if "engagement_id" in tool.slots:
        slots["engagement_id"] = _first_int([r"engagement\s*#?\s*(\d+)"], message)
    if "category_code" in tool.slots:
        m = re.search(r"\b([a-z][a-z_]*\.[a-z_.]+)\b", message)
        slots["category_code"] = m.group(1) if m else None
    if "engagement_action" in tool.slots:
        slots["engagement_action"] = next(
            (a for a in _ENGAGEMENT_ACTIONS if re.search(rf"\b{a}\b", message, re.IGNORECASE)), None
        )
    return slots


# --- stage 2: LLM fallback router ------------------------------------------
class RouteOut(BaseModel):
    tool: str
    document_id: int | None = None
    line_item_id: int | None = None
    engagement_id: int | None = None
    category_code: str | None = None
    engagement_action: str | None = None


def _route_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "tool": {"type": "string", "enum": [t.name for t in TOOLS]},
            "document_id": {"type": ["integer", "null"]},
            "line_item_id": {"type": ["integer", "null"]},
            "engagement_id": {"type": ["integer", "null"]},
            "category_code": {"type": ["string", "null"]},
            "engagement_action": {"type": ["string", "null"], "enum": [*_ENGAGEMENT_ACTIONS, None]},
        },
        "required": ["tool"],
    }


def _route_spec() -> TaskSpec:
    return TaskSpec(
        name="assistant_route",
        prompt_version="v1",
        prompt_file="assistant_route.md",
        output_model=RouteOut,
        output_schema=_route_schema(),
        business_rules=lambda m, _: ([] if m.tool in TOOLS_BY_NAME else [f"{m.tool} unknown tool"]),
        policy=TaskPolicy(),
    )


def _tool_menu() -> str:
    return "\n".join(f"- {t.name} ({t.kind}): {t.description}" for t in TOOLS)


def llm_route(
    message: str,
    *,
    provider: Provider,
    cache: AiCache | None = None,
    telemetry: AiTelemetry | None = None,
) -> tuple[Tool, dict[str, Any]]:
    result = run_task(
        _route_spec(), {"message": message[:500], "tools": _tool_menu()},
        provider=provider, cache=cache, telemetry=telemetry,
    )
    if not (result.ok and isinstance(result.model, RouteOut)):
        return DEFAULT_TOOL, {}
    out = result.model
    tool = TOOLS_BY_NAME.get(out.tool, DEFAULT_TOOL)
    slots = {
        k: v for k, v in {
            "document_id": out.document_id, "line_item_id": out.line_item_id,
            "engagement_id": out.engagement_id, "category_code": out.category_code,
            "engagement_action": out.engagement_action,
        }.items() if k in tool.slots
    }
    return tool, slots


# --- routing decision ------------------------------------------------------
@dataclass(frozen=True)
class RouteDecision:
    tool: Tool
    slots: dict[str, Any]
    method: str          # 'semantic' | 'llm' | 'default'
    score: float | None = None


def _routing_text(message: str, history: list[dict[str, str]] | None) -> str:
    """Cheap history-into-routing (D5). A very short follow-up ("yes", "and you?",
    "thanks") carries little routing signal on its own, so we prepend the most
    recent user turn to keep chat/firm threads coherent. Longer messages route on
    their own. Slot extraction still runs on the raw message, never this."""
    if history and len(message.split()) <= 4:
        prev = next(
            (t.get("content", "") for t in reversed(history) if t.get("role") == "user"), ""
        )
        if prev:
            return f"{prev} {message}"
    return message


def route_message(
    message: str,
    router: SemanticRouter,
    *,
    provider: Provider,
    history: list[dict[str, str]] | None = None,
    cache: AiCache | None = None,
    telemetry: AiTelemetry | None = None,
) -> RouteDecision:
    hit = router.route(_routing_text(message, history))
    if hit is not None:
        tool, score = hit
        return RouteDecision(tool=tool, slots=extract_slots(message, tool), method="semantic", score=score)
    tool, slots = llm_route(message, provider=provider, cache=cache, telemetry=telemetry)
    return RouteDecision(tool=tool, slots=slots, method="llm")


# --- tool execution (READ = data, WRITE = proposal) ------------------------
@dataclass(frozen=True)
class ToolResult:
    tool: str
    kind: str            # 'read'
    data: dict[str, Any]


@dataclass(frozen=True)
class Proposal:
    """A proposed WRITE the frontend must confirm, then dispatch to the matching
    existing admin server action. Never executed on the backend."""

    tool: str
    action: str          # stable action key the frontend dispatches on
    params: dict[str, Any]
    summary: str
    ready: bool          # all required slots present


def _read_snippet(text: str, limit: int = 240) -> str:
    text = " ".join(text.split())
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def execute_read(
    tool: Tool,
    slots: dict[str, Any],
    message: str,
    *,
    repo: Repository,
    embedder: Embedder | None,
    context: list[RetrievedChunk],
    client_id: str | None,
) -> ToolResult:
    if tool.name == "list_analyses":
        docs = repo.list_documents(client_id, limit=20)
        return ToolResult(tool.name, "read", {
            "documents": [
                {"document_id": d.id, "filename": d.filename, "status": d.status,
                 "client_id": d.client_id, "created_at": d.created_at.isoformat()}
                for d in docs
            ],
            "count": len(docs),
        })

    if tool.name == "document_status":
        doc_id = slots.get("document_id")
        if doc_id is None:
            return ToolResult(tool.name, "read", {"error": "Which document? Give me a document id."})
        doc = repo.get_document(int(doc_id))
        if doc is None or (client_id is not None and doc.client_id != client_id):
            return ToolResult(tool.name, "read", {"error": f"No document {doc_id} found."})
        return ToolResult(tool.name, "read", {
            "document_id": doc.id, "filename": doc.filename, "status": doc.status,
            "engagement_id": doc.engagement_id, "progress": doc.progress,
        })

    if tool.name == "engagement_status":
        eng_id = slots.get("engagement_id")
        if eng_id is None:
            return ToolResult(tool.name, "read", {"error": "Which engagement? Give me an engagement id."})
        eng = repo.get_engagement(int(eng_id))
        if eng is None or (client_id is not None and eng.client_id != client_id):
            return ToolResult(tool.name, "read", {"error": f"No engagement {eng_id} found."})
        gen = repo.latest_generated_file(eng.id)
        return ToolResult(tool.name, "read", {
            "engagement_id": eng.id, "template": eng.template, "status": eng.status,
            "latest_generated_file_id": gen.id if gen else None,
            "validation_status": gen.validation_status if gen else None,
        })

    if tool.name == "pipeline_health":
        from litchai.ops.observability import summarize

        docs = repo.list_documents(client_id, limit=5000)
        return ToolResult(tool.name, "read", summarize(docs, repo.all_categorization_events()))

    # search_knowledge → surface the retrieved sources as a card
    return ToolResult(tool.name, "read", {
        "matches": [
            {"citation": c.citation, "snippet": _read_snippet(c.chunk.text), "similarity": round(c.similarity, 3)}
            for c in context
        ],
    })


def build_proposal(tool: Tool, slots: dict[str, Any]) -> Proposal:
    if tool.name == "recategorize_line":
        params = {
            "document_id": slots.get("document_id"),
            "line_item_id": slots.get("line_item_id"),
            "category_code": slots.get("category_code"),
        }
        ready = all(params.values())
        target = f"line {params['line_item_id']} in document {params['document_id']}" if ready else "a line"
        summary = (
            f"Reclassify {target} to '{params['category_code']}'."
            if ready else "Reclassify a line — I need the document id, line id and target category."
        )
        return Proposal(tool.name, "recategorize", params, summary, ready)

    # transition_engagement
    params = {
        "engagement_id": slots.get("engagement_id"),
        "action": slots.get("engagement_action"),
    }
    ready = all(params.values())
    summary = (
        f"{str(params['action']).capitalize()} engagement {params['engagement_id']}."
        if ready else "Transition an engagement — I need the engagement id and the action."
    )
    return Proposal(tool.name, "engagement_transition", params, summary, ready)


# --- grounded generation ---------------------------------------------------
class AnswerOut(BaseModel):
    answer: str
    can_answer: bool = True


def _answer_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {"answer": {"type": "string"}, "can_answer": {"type": "boolean"}},
        "required": ["answer", "can_answer"],
    }


def _answer_spec() -> TaskSpec:
    return TaskSpec(
        name="assistant_answer",
        prompt_version="v1",
        prompt_file="assistant_answer.md",
        output_model=AnswerOut,
        output_schema=_answer_schema(),
        policy=TaskPolicy(num_ctx=4096),
    )


def _format_context(context: list[RetrievedChunk]) -> str:
    if not context:
        return "(no knowledge base matches)"
    blocks = []
    for i, c in enumerate(context, 1):
        blocks.append(f"[{i}] Source: {c.citation}\n{c.section_text}")
    return "\n\n".join(blocks)


def _format_history(history: list[dict[str, str]] | None) -> str:
    if not history:
        return "(no prior turns)"
    turns = history[-4:]
    return "\n".join(f"{t.get('role', 'user')}: {t.get('content', '')}" for t in turns)


def _format_tool_result(result: ToolResult | None) -> str:
    if result is None:
        return "(none)"
    import json

    return json.dumps(result.data, default=str)[:1500]


def _has_groundable_data(tool_result: ToolResult | None) -> bool:
    """Whether a READ tool produced something worth spending the generation model
    on. An error, an empty payload, or a ``search_knowledge`` result with no
    matches all mean "nothing to ground on" — so we can answer IDK without a call."""
    if tool_result is None:
        return False
    data = tool_result.data
    if not data or data.get("error"):
        return False
    # search_knowledge just mirrors retrieval; empty matches = nothing to ground on.
    if "matches" in data and not data["matches"]:
        return False
    return True


def generate_answer(
    message: str,
    context: list[RetrievedChunk],
    tool_result: ToolResult | None,
    history: list[dict[str, str]] | None,
    *,
    provider: Provider,
    tool_name: str = "search_knowledge",
    cache: AiCache | None = None,
    telemetry: AiTelemetry | None = None,
) -> AnswerOut:
    # Defensive (D3): general_chat is served entirely on the chat-provider path in
    # answer_chat and must never reach grounded generation. If a stray call gets
    # here, degrade to the grounded refusal — the no-context short-circuit below
    # would otherwise swallow it into an IDK about the knowledge base.
    if tool_name == "general_chat":
        return AnswerOut(answer=GENERAL_CHAT_UNAVAILABLE, can_answer=True)
    # Nothing to ground on → don't call the model, just say so.
    if not context and not _has_groundable_data(tool_result):
        detail = tool_result.data.get("error") if tool_result and tool_result.data.get("error") else IDK
        return AnswerOut(answer=detail, can_answer=False)

    result = run_task(
        _answer_spec(),
        {
            "message": message[:1000],
            "context": _format_context(context),
            "tool_result": _format_tool_result(tool_result),
            "history": _format_history(history),
        },
        provider=provider, cache=cache, telemetry=telemetry,
    )
    if result.ok and isinstance(result.model, AnswerOut):
        return result.model
    return AnswerOut(answer=IDK, can_answer=False)


# --- general chat (off-corpus, external provider) --------------------------
# Non-zero temperature: general chat wants a little warmth/variety, unlike the
# deterministic grounded path. num_ctx is a no-op for OpenAI-compatible providers
# (they size their own context) but keeps the policy shape consistent.
_GENERAL_CHAT_POLICY = TaskPolicy(temperature=0.7, num_ctx=8192)


def _general_chat_params() -> dict[str, Any]:
    return {**_GENERAL_CHAT_POLICY.params(), "max_tokens": 800}


def _render_general_prompt(message: str, history: list[dict[str, str]] | None) -> str:
    template = (PROMPTS_DIR / "assistant_general.md").read_text(encoding="utf-8")
    return template.format(history=_format_history(history), message=message[:1000])


def generate_general_chat(
    message: str,
    history: list[dict[str, str]] | None,
    *,
    provider: Provider,
) -> str:
    """Free-form general-chat answer via the external chat provider. Plain text,
    no schema, non-zero temperature. Falls back to the grounded refusal if the
    provider returns nothing."""
    resp = provider.generate(_render_general_prompt(message, history), params=_general_chat_params())
    return resp.text.strip() or GENERAL_CHAT_UNAVAILABLE


# --- top-level entry point -------------------------------------------------
@dataclass(frozen=True)
class ChatResult:
    answer: str
    citations: list[str]
    tool: str
    routed_by: str
    can_answer: bool
    tool_result: dict[str, Any] | None = None
    proposal: dict[str, Any] | None = None


def _dedupe(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for it in items:
        if it not in seen:
            seen.add(it)
            out.append(it)
    return out


def answer_chat(
    message: str,
    *,
    repo: Repository,
    embedder: Embedder,
    provider: Provider,
    router: SemanticRouter | None = None,
    history: list[dict[str, str]] | None = None,
    scope: str = "firm",
    client_id: str | None = None,
    chat_provider: Provider | None = None,
    cache: AiCache | None = None,
    telemetry: AiTelemetry | None = None,
) -> ChatResult:
    router = router or SemanticRouter(embedder)
    decision = route_message(
        message, router, provider=provider, history=history, cache=cache, telemetry=telemetry
    )

    # general_chat: off-corpus small talk / reasoning. Skip retrieval and the
    # READ/proposal paths entirely and answer via the external chat provider. If
    # none is configured, degrade to a friendly grounded refusal — no model call,
    # no hallucination.
    if decision.tool.name == "general_chat":
        answer = (
            generate_general_chat(message, history, provider=chat_provider)
            if chat_provider is not None
            else GENERAL_CHAT_UNAVAILABLE
        )
        return ChatResult(
            answer=answer, citations=[], tool="general_chat", routed_by=decision.method,
            can_answer=True,
        )

    # scope='client' is the only mode that includes a client's operational context.
    retrieval_client = client_id if scope == "client" else None
    read_client = client_id if scope == "client" else None
    context = hybrid_knowledge(message, repo, embedder, client_id=retrieval_client)

    if decision.tool.kind == "write":
        proposal = build_proposal(decision.tool, decision.slots)
        answer = (
            f"{proposal.summary} This is a proposal — confirm to apply it."
            if proposal.ready else proposal.summary
        )
        return ChatResult(
            answer=answer, citations=[], tool=decision.tool.name, routed_by=decision.method,
            can_answer=True, proposal=proposal.__dict__,
        )

    tool_result = execute_read(
        decision.tool, decision.slots, message,
        repo=repo, embedder=embedder, context=context, client_id=read_client,
    )
    out = generate_answer(
        message, context, tool_result, history, provider=provider,
        tool_name=decision.tool.name, cache=cache, telemetry=telemetry,
    )
    citations = _dedupe([c.citation for c in context]) if out.can_answer and context else []
    return ChatResult(
        answer=out.answer, citations=citations, tool=decision.tool.name, routed_by=decision.method,
        can_answer=out.can_answer, tool_result=tool_result.data,
    )
