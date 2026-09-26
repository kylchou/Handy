import { HandyAIService, type HandyAIServiceOptions } from "./aiService.js";
import { ClaudeDraftModel, JobMessageDrafter } from "./draft.js";
import { ClaudeExtractionModel, type ClaudeModelOptions, type Effort } from "./model.js";

export { draftChanges, HandyAIService, missingFields, sanitizeExtraction } from "./aiService.js";
export type { HandyAIServiceOptions } from "./aiService.js";
export { CATEGORY_INFO, SERVICE_CATEGORIES } from "./categories.js";
export { ClaudeDraftModel, JobMessageDrafter } from "./draft.js";
export type { DraftModel, DraftResult, DraftRunResult, DraftTurn, JobContext } from "./draft.js";
export { AIServiceError } from "./errors.js";
export { ClaudeExtractionModel, ClaudeJsonClient, DEFAULT_EFFORT, DEFAULT_MODEL } from "./model.js";
export type { ClaudeModelOptions, Effort, ExtractionModel, ModelInput, ModelRunResult } from "./model.js";
export { classifySafety, EMERGENCY_MESSAGES, UNSUPPORTED_MESSAGES } from "./safety.js";
export type { SafetyCheck, UnsupportedKind } from "./safety.js";
export { screenJobMessage } from "./scam.js";
export type { ChatSender, ScamFlag, ScreenResult } from "./scam.js";
export type { ModelTurn } from "./schema.js";
export { areaOf, formatWhen, toWorkerJobCard } from "./workerCard.js";
export type { WorkerCardInput, WorkerJobCard } from "./workerCard.js";
export type * from "./types.js";

function claudeOptionsFromEnv(): ClaudeModelOptions {
  return {
    model: process.env.AI_MODEL || undefined,
    effort: (process.env.AI_EFFORT as Effort | undefined) || undefined,
  };
}

/**
 * Factory the backend loads (apps/api/src/integrations). Reads:
 *   ANTHROPIC_API_KEY  required (or ANTHROPIC_AUTH_TOKEN), root .env
 *   AI_MODEL           default claude-opus-5
 *   AI_EFFORT          low | medium | high | xhigh | max, default medium
 * No key → throws, so backend starts with its built-in assistant instead of a chat that can't work.
 * Passing your own `model` (tests, stubs) skips the key check.
 */
export function createAIService(overrides: HandyAIServiceOptions = {}): HandyAIService {
  if (!overrides.model && !process.env.ANTHROPIC_API_KEY?.trim() && !process.env.ANTHROPIC_AUTH_TOKEN?.trim()) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  return new HandyAIService({ model: new ClaudeExtractionModel(claudeOptionsFromEnv()), ...overrides });
}

/** Drafter from env vars (AI_MODEL, AI_EFFORT). Not wired into the backend yet. */
export function createJobMessageDrafter(): JobMessageDrafter {
  return new JobMessageDrafter({ model: new ClaudeDraftModel(claudeOptionsFromEnv()) });
}
