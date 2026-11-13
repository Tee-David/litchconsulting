/**
 * Shared Sage parts: one place for the Sage page, the chat widget and (later)
 * the workbench Sage panel. Presentation logic lives in lib/sage/present.ts.
 */
export { CitationTick, TickMark, sourceId } from "./citation-tick";
export { SourcesList } from "./sources";
export { ProposalPlan } from "./proposal-plan";
export { ProvenanceLine } from "./provenance";
export { PlanCheck } from "./check";
export { SageMarkdown, RevealMarkdown } from "./markdown";
export { SageAnswer, SageMark, UserBubble, FailureNotice, HeldNotice, Working } from "./answer";
export { SageComposer } from "./composer";
export { HistoryRail } from "./history-rail";
export { useSageChat, type SageChat } from "./use-sage-chat";
