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

import logging
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

log = logging.getLogger(__name__)

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
    # "litchai": data read here (the VM's Postgres). "app": data lives in the web
    # app's database; the admin-guarded relay resolves it (see answer_chat).
    source: Literal["litchai", "app"] = "litchai"


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
            "how do i edit a cell in the workbench",
            "how do i zoom or freeze rows in the workbench",
            "how do i undo my edit in the sheet",
            "how do i message a client on their request",
            "why did the client's analysis fail",
            "how do i confirm a bank transfer payment",
            "how does erasing a client work",
            "how do i export a client's data",
            "how do i send a draft to the client for review",
            "how do i ask a client for a document",
            "how do i assign a request to a staff member",
            "how do i run the backup restore test",
            "how do i accept a proposal in the workbench",
            "how does the workbench keep client data private",
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
        name="workbench_status",
        kind="read",
        description="Workbench conversations: which files are open, pending proposals waiting "
        "to be accepted, last activity.",
        examples=(
            "what is pending in the workbench",
            "list the workbench conversations",
            "how many workbench proposals are waiting",
            "which workbench changes have not been accepted",
        ),
    ),
    Tool(
        name="ai_engine_status",
        kind="read",
        description="The AI model chain behind Sage and the workbench: which providers are "
        "healthy, which one answers, and how much daily free quota is used.",
        examples=(
            "which ai model is sage using",
            "are the ai providers healthy",
            "is the groq quota used up",
            "show the ai engine status",
        ),
    ),
    Tool(
        name="billing_status",
        kind="read",
        source="app",
        description="Billing now: bank transfer proofs waiting for confirmation, overdue and "
        "part-paid invoices, money received recently.",
        examples=(
            "which bank transfers are waiting for confirmation",
            "how many payment proofs need confirming",
            "which invoices are overdue",
            "how much have we been paid this month",
            "who still owes us money",
        ),
    ),
    Tool(
        name="client_privacy",
        kind="read",
        source="app",
        description="Client privacy: AI mode (cloud masked or local only) with who set it and "
        "why, and scheduled erasures with their dates.",
        examples=(
            "what is this client's ai mode",
            "which clients have erasure pending",
            "is this client local only",
            "when will the client's data be erased",
        ),
    ),
    Tool(
        name="request_work",
        kind="read",
        source="app",
        description="Where a service request stands: status, open asks, the current draft "
        "review round and decision, and who is assigned.",
        examples=(
            "what asks are open on REQ-2026-014",
            "which review round is REQ-2026-003 on",
            "who is assigned to REQ-2026-010",
            "which requests have no one assigned",
            "which requests are waiting on the client",
        ),
        slots=("request_number",),
    ),
    Tool(
        name="backup_status",
        kind="read",
        source="app",
        description="Database backups: when the last backup ran and the result of the last "
        "restore test.",
        examples=(
            "when was the last backup",
            "did the last restore test pass",
            "are the backups working",
        ),
    ),
    Tool(
        name="create_quote",
        kind="write",
        description="Propose a draft quote for a client (client name, amount, what it is for). "
        "The admin reviews the draft in Billing before it is sent.",
        examples=(
            "create a quote for acme ltd for 500,000 naira",
            "make a quote for okonkwo farms",
            "draft a quote of 250000 for bookkeeping",
            "quote acme 1.2m for the audit",
            "prepare a quotation for this client",
        ),
        slots=("client_name", "amount", "description"),
    ),
    Tool(
        name="create_invoice",
        kind="write",
        description="Propose a draft invoice for a client (client name, amount, what it is for). "
        "The admin reviews the draft in Billing before it is sent.",
        examples=(
            "create an invoice for acme ltd for 500,000 naira",
            "invoice okonkwo farms 250000 for the tax filing",
            "raise an invoice for this client",
            "bill acme ltd 300k for the payroll work",
            "make an invoice for 1.5 million",
        ),
        slots=("client_name", "amount", "description"),
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


_SCALE = {"k": 1e3, "thousand": 1e3, "m": 1e6, "mn": 1e6, "million": 1e6, "b": 1e9, "bn": 1e9,
          "billion": 1e9}


def _amount_in(message: str) -> float | None:
    """The money amount in a request: '500,000 naira', '₦1.2m', '300k'."""
    best: float | None = None
    for m in re.finditer(r"(?:₦|NGN\s*|N(?=\d))?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*"
                         r"(k|thousand|m|mn|million|b|bn|billion)?\b", message, re.IGNORECASE):
        raw = m.group(1).replace(",", "")
        if re.fullmatch(r"(19|20)\d\d", raw) and not m.group(2):
            continue  # a year, not money
        v = float(raw) * _SCALE.get((m.group(2) or "").lower(), 1.0)
        if best is None or v > best:
            best = v
    return round(best, 2) if best else None


def _client_in(message: str) -> str | None:
    """'… for Acme Ltd for 500,000' → 'Acme Ltd'. Skips amounts and descriptions."""
    for m in re.finditer(r"\b(?:for|to|bill|invoice|quote)\s+([A-Z][\w&.'-]*(?:\s+[A-Z&][\w&.'-]*){0,5})",
                         message):
        name = m.group(1).strip(" .,")
        if not re.match(r"(?:₦|NGN|\d)", name) and name.lower() not in ("this client", "the client"):
            return name
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
    if "request_number" in tool.slots:
        m = re.search(r"\bREQ-\d{4}-\d+\b", message, re.IGNORECASE)
        slots["request_number"] = m.group(0).upper() if m else None
    if "amount" in tool.slots:
        slots["amount"] = _amount_in(message)
    if "client_name" in tool.slots:
        slots["client_name"] = _client_in(message)
    if "description" in tool.slots:
        m = re.search(r"\b(?:for|covering)\s+(?:the\s+|our\s+)?((?:[a-z][\w&'-]*\s?){1,6})\s*[.?!]?\s*$",
                      message, re.IGNORECASE)
        desc = m.group(1).strip() if m else None
        slots["description"] = desc if desc and desc.lower() != (slots.get("client_name") or "").lower() else None
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
    # Slots the route schema has no field for come from the message itself.
    extra = {"request_number", "client_name", "amount", "description"} & set(tool.slots)
    if extra:
        found = extract_slots(message, tool)
        slots.update({k: found.get(k) for k in extra})
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


_POLITE = re.compile(
    r"^\s*(?:(?:please|kindly|sage|ok(?:ay)?|now|also|then)[\s,]+)*"
    r"(?:(?:can|could|would|will) you(?: please)?|i (?:want|need|would like|'d like) you to|"
    r"help me(?: to)?|let'?s|go ahead and)?\s*(?:please\s+)?", re.IGNORECASE)
_QUESTION_START = re.compile(
    r"^(?:how|what|why|when|where|who|whom|which|whose|is|are|was|were|do|does|did|can|could|"
    r"should|would|will|may|might|must|shall|has|have|explain|tell me|describe|i wonder)\b",
    re.IGNORECASE)
# The imperative verbs that may open a write, per write tool.
_WRITE_VERBS: dict[str, tuple[str, ...]] = {
    "create_quote": ("create", "make", "draft", "prepare", "raise", "generate", "issue", "quote",
                     "send", "set up", "write"),
    "create_invoice": ("create", "make", "draft", "prepare", "raise", "generate", "issue",
                       "invoice", "bill", "send", "set up", "write"),
    "recategorize_line": ("reclassify", "recategorize", "recategorise", "move", "change", "set",
                          "categorise", "categorize", "put"),
    "transition_engagement": _ENGAGEMENT_ACTIONS + ("move", "send", "mark"),
}


def write_intent(message: str, tool: Tool, slots: dict[str, Any]) -> bool:
    """A write needs an instruction, not a question: an imperative verb first
    (after any polite lead such as "please" or "can you"), and an object
    (a client or amount; a line; an engagement). "How does a client pay an
    invoice?" is a question about invoices, never a request to make one."""
    text = _POLITE.sub("", message.strip(), count=1).strip()
    if not text or _QUESTION_START.match(text):
        return False
    first = text.lower()
    if not any(re.match(rf"{re.escape(v)}\b", first) for v in _WRITE_VERBS.get(tool.name, ())):
        return False
    if tool.name in ("create_quote", "create_invoice"):
        return bool(slots.get("client_name") or slots.get("amount")
                    or re.search(r"\b(?:this|the|a|our) client\b|\b(?:for|to)\s+\w", first))
    if tool.name == "recategorize_line":
        return slots.get("line_item_id") is not None
    if tool.name == "transition_engagement":
        return slots.get("engagement_id") is not None
    return True


def _read_instead(message: str, router: SemanticRouter | None) -> tuple[Tool, float | None]:
    """The best READ tool for a message that looked like a write but is not one."""
    if router is not None:
        for tool, score in _prefer_knowledge_on_tie(router.score(message), router.tie_epsilon):
            if tool.kind == "read":
                return (tool, score) if score >= router.threshold else (DEFAULT_TOOL, None)
    return DEFAULT_TOOL, None


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
        decision = RouteDecision(tool=tool, slots=extract_slots(message, tool), method="semantic",
                                 score=score)
    else:
        tool, slots = llm_route(message, provider=provider, cache=cache, telemetry=telemetry)
        decision = RouteDecision(tool=tool, slots=slots, method="llm")
    if decision.tool.kind == "write" and not write_intent(message, decision.tool, decision.slots):
        read, score = _read_instead(message, router)
        return RouteDecision(tool=read, slots=extract_slots(message, read),
                             method=decision.method, score=score)
    return decision


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
    engine_status: Any = None,
    workbench_ids: list[str] | None = None,
) -> ToolResult:
    if tool.name == "workbench_status":
        return ToolResult(tool.name, "read", workbench_status(repo, client_id, workbench_ids))

    if tool.name == "ai_engine_status":
        if engine_status is None:
            return ToolResult(tool.name, "read",
                              {"error": "The AI engine status isn't available here."})
        keep = ("name", "kind", "model", "configured", "ok", "detail", "used_requests",
                "used_tokens", "daily_requests", "daily_tokens", "exhausted_until")
        return ToolResult(tool.name, "read", {
            "providers": [{k: p.get(k) for k in keep} for p in engine_status()]})

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


def workbench_status(repo: Repository, client_id: str | None,
                     only_ids: list[str] | None = None) -> dict[str, Any]:
    """Recent workbench conversations with their pending proposals (VM Postgres).
    ``only_ids``: staff see only the conversations of requests assigned to them."""
    conn = getattr(repo, "conn", None)
    if conn is None:
        return {"error": "Workbench history is only kept on the analysis server."}
    from litchai.workbench.session import PgConversationStore

    rows = []
    allowed = set(only_ids) if only_ids is not None else None
    for c in PgConversationStore(conn).list(client_id, 20 if allowed is None else 500):
        if allowed is not None and c.id not in allowed:
            continue
        if len(rows) >= 20:
            break
        pending = [b for b in c.batches if b.status == "pending"]
        rows.append({
            "conversation_id": c.id, "title": c.title, "client_id": c.client_id,
            "ai_mode": c.ai_mode, "files": [w.name for w in c.workbooks],
            "pending_proposals": [{"title": b.title, "summary": b.summary} for b in pending][:10],
            "pending_count": len(pending), "updated_at": c.updated_at,
        })
    return {"conversations": rows, "count": len(rows),
            "pending_total": sum(r["pending_count"] for r in rows)}


def build_proposal(tool: Tool, slots: dict[str, Any]) -> Proposal:
    if tool.name in ("create_quote", "create_invoice"):
        kind = "quote" if tool.name == "create_quote" else "invoice"
        params = {
            "kind": kind,
            "client_name": slots.get("client_name"),
            "amount": slots.get("amount"),
            "description": slots.get("description"),
        }
        missing = [k for k, label in (("client_name", "the client"), ("amount", "the amount"))
                   if not params[k]]
        ready = not missing
        what = f" for {params['description']}" if params["description"] else ""
        summary = (
            f"Create a draft {kind} for {params['client_name']}: "
            f"₦{float(params['amount']):,.2f}{what}. You review it in Billing before it is sent."
            if ready else
            f"Create a draft {kind}: tell me "
            + " and ".join("the client" if k == "client_name" else "the amount" for k in missing)
            + "."
        )
        return Proposal(tool.name, "create_billing_draft", params, summary, ready)

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
    # App-resolved read (billing, privacy, requests, backups): the relay runs the
    # read for {tool, slots} and calls again with app_data. Nothing to show yet.
    needs_app_data: dict[str, Any] | None = None
    # Set when no model could answer: "quota" | "timeout" | "unavailable". The
    # answer then holds a plain-word message with a next step (never an HTTP 500).
    error: str | None = None
    # Which engine wrote the words: {"provider", "model", "kind", "masked"} or None.
    engine: dict[str, Any] | None = None
    # The caller's role was applied (staff: assigned requests only, no money, no writes).
    scope_applied: bool = False


# Staff use Sage for their own work only (CLAUDE.md: assigned requests, never money).
# request_work data comes from the website already filtered to their requests, without
# money fields; workbench_status is filtered to their conversations here.
STAFF_TOOLS = frozenset({"search_knowledge", "general_chat", "request_work", "workbench_status"})
STAFF_REFUSAL = ("Only an admin can see that. I can tell you where your assigned requests "
                 "stand, what is waiting on you in the workbench, and answer questions about "
                 "Litch's services and Nigerian tax rules.")
STAFF_NO_WRITES = ("Only an admin can do that. I can tell you where your assigned requests "
                   "stand, or draft the wording for you to send yourself.")


# Plain words for a failed model call, each with a next step (U6).
BUSY_MESSAGES = {
    "quota": "The free AI allowance for today is used up, and the private model did not "
             "answer in time. Try again in a few minutes, or ask a shorter question.",
    "timeout": "Sage took too long to answer. The AI service is busy. Try again in a "
               "minute, or ask a shorter question.",
    "unavailable": "Sage cannot reach its AI service right now. Try again in a minute. "
                   "Your question was not lost: send it again.",
}


def busy_result(reason: str, *, tool: str = "none", routed_by: str = "none") -> ChatResult:
    return ChatResult(answer=BUSY_MESSAGES.get(reason, BUSY_MESSAGES["unavailable"]), citations=[],
                      tool=tool, routed_by=routed_by, can_answer=False, error=reason)


def _names_in(data: Any, out: set[str] | None = None) -> set[str]:
    """Client / payer / person names inside app data, so they are masked for the cloud."""
    out = out if out is not None else set()
    if isinstance(data, dict):
        for k, v in data.items():
            if isinstance(v, str) and re.search(r"client|payer|name|customer|bill_to|company|by$",
                                                k, re.IGNORECASE):
                out.add(v)
            else:
                _names_in(v, out)
    elif isinstance(data, list):
        for v in data:
            _names_in(v, out)
    return out


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
    app_tools: bool = False,
    app_data: dict[str, Any] | None = None,
    engine_status: Any = None,
    model_router: Any = None,
    local_only: bool = False,
    conversation_id: str | None = None,
    timeout: float | None = None,
    role: str = "admin",
    workbench_ids: list[str] | None = None,
) -> ChatResult:
    """``role``: "admin" sees the firm; "staff" gets STAFF_TOOLS only, no writes, and
    no client-scoped context (``workbench_ids`` limits the workbench read).

    ``app_tools``: the caller can resolve app-side reads (two-pass contract).
    ``app_data``: ``{"tool": name, "data": {...}}`` from that read (the second pass).

    ``model_router`` (a :class:`~litchai.ai.router.ProviderRouter`): when set, the
    routing fallback, the answer and general chat all go through the provider chain
    (cloud first, masked; ``local_only`` keeps it on the VM). Without it the local
    ``provider`` is used as before. A model failure never raises: the result holds a
    plain-word message and ``error``."""
    try:
        out = _answer_chat(
            message, repo=repo, embedder=embedder, provider=provider, router=router,
            history=history, scope=scope, client_id=client_id, chat_provider=chat_provider,
            cache=cache, telemetry=telemetry, app_tools=app_tools, app_data=app_data,
            engine_status=engine_status, model_router=model_router, local_only=local_only,
            conversation_id=conversation_id, timeout=timeout, role=role,
            workbench_ids=workbench_ids,
        )
    except Exception as exc:  # noqa: BLE001 — Sage answers in words, never with a 500
        from litchai.ai.router import failure_reason

        log.warning("sage turn failed: %s: %s", type(exc).__name__, str(exc)[:200])
        out = busy_result(failure_reason(exc))
    from dataclasses import replace

    return replace(out, scope_applied=True)


def _answer_chat(
    message: str,
    *,
    repo: Repository,
    embedder: Embedder,
    provider: Provider,
    router: SemanticRouter | None,
    history: list[dict[str, str]] | None,
    scope: str,
    client_id: str | None,
    chat_provider: Provider | None,
    cache: AiCache | None,
    telemetry: AiTelemetry | None,
    app_tools: bool,
    app_data: dict[str, Any] | None,
    engine_status: Any,
    model_router: Any,
    local_only: bool,
    conversation_id: str | None,
    timeout: float | None,
    role: str = "admin",
    workbench_ids: list[str] | None = None,
) -> ChatResult:
    staff = role == "staff"
    if staff:
        # Never a client-wide view for staff, whatever the caller asked for.
        scope, client_id = "firm", None
    bound = None
    if model_router is not None:
        from litchai.ai.privacy import Masker
        from litchai.ai.router import BoundRouter

        masker = Masker()
        masker.register_names(_names_in((app_data or {}).get("data")))
        bound = BoundRouter(model_router, task="sage", conversation_id=conversation_id,
                            local_only=local_only, masker=masker, timeout=timeout)
        provider = bound
        chat_provider = bound

    def engine() -> dict[str, Any] | None:
        last = getattr(bound, "last", None)
        if last is None:
            return None
        return {"provider": last.provider, "model": last.model, "kind": last.kind,
                "masked": last.masked}

    router = router or SemanticRouter(embedder)
    decision = route_message(
        message, router, provider=provider, history=history, cache=cache, telemetry=telemetry
    )
    if staff and (decision.tool.kind == "write" or decision.tool.name not in STAFF_TOOLS):
        return ChatResult(
            answer=STAFF_NO_WRITES if decision.tool.kind == "write" else STAFF_REFUSAL,
            citations=[], tool=decision.tool.name, routed_by=decision.method,
            can_answer=False,
        )

    # general_chat: off-corpus small talk / reasoning. Skip retrieval and the
    # READ/proposal paths entirely and answer via the chat provider. If none is
    # configured, degrade to a friendly grounded refusal — no model call, no
    # hallucination.
    if decision.tool.name == "general_chat":
        answer = (
            generate_general_chat(message, history, provider=chat_provider)
            if chat_provider is not None
            else GENERAL_CHAT_UNAVAILABLE
        )
        return ChatResult(
            answer=answer, citations=[], tool="general_chat", routed_by=decision.method,
            can_answer=True, engine=engine(),
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

    tool_result: ToolResult | None
    if decision.tool.source == "app":
        supplied = app_data if app_data and app_data.get("tool") == decision.tool.name else None
        if supplied is None and app_tools:
            return ChatResult(
                answer="", citations=[], tool=decision.tool.name, routed_by=decision.method,
                can_answer=True,
                needs_app_data={"tool": decision.tool.name, "slots": decision.slots,
                                "client_id": read_client},
            )
        # Second pass grounds on the app's data; an older relay gets the how-to answer.
        tool_result = (ToolResult(decision.tool.name, "read", dict(supplied.get("data") or {}))
                       if supplied is not None else None)
    else:
        tool_result = execute_read(
            decision.tool, decision.slots, message,
            repo=repo, embedder=embedder, context=context, client_id=read_client,
            engine_status=engine_status, workbench_ids=workbench_ids if staff else None,
        )
    out = generate_answer(
        message, context, tool_result, history, provider=provider,
        tool_name=decision.tool.name, cache=cache, telemetry=telemetry,
    )
    citations = _dedupe([c.citation for c in context]) if out.can_answer and context else []
    return ChatResult(
        answer=out.answer, citations=citations, tool=decision.tool.name, routed_by=decision.method,
        can_answer=out.can_answer, tool_result=tool_result.data if tool_result else None,
        engine=engine(),
    )
