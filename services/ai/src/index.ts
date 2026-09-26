import { HandyAIService, type HandyAIServiceOptions } from "./aiService.js";
import { ClaudeDraftModel, JobMessageDrafter } from "./draft.js";
import { ClaudeExtractionModel, type ClaudeModelOptions, type Effort } from "./model.js";

export { HandyAIService, missingFields, sanitizeExtraction } from "./aiService.js";
export type { HandyAIServiceOptions } from "./aiService.js";
export { CATEGORY_INFO, SERVICE_CATEGORIES } from "./categories.js";
export type { ServiceCategoryCode } from "./categories.js";
export { ClaudeDraftModel, JobMessageDrafter } from "./draft.js";
export type { DraftModel, DraftResult, DraftRunResult, DraftTurn, JobContext } from "./draft.js";
export { AIServiceError } from "./errors.js";
export { ClaudeExtractionModel, ClaudeJsonClient, DEFAULT_EFFORT, DEFAULT_MODEL } from "./model.js";
export type { ClaudeModelOptions, Effort, ExtractionModel, ModelInput, ModelRunResult } from "./model.js";
export { classifySafety, EMERGENCY_MESSAGES, UNSUPPORTED_MESSAGES } from "./safety.js";
export type { SafetyCheck, UnsupportedKind } from "./safety.js";
export type { ModelTurn } from "./schema.js";
export { InMemoryConversationStore } from "./store.js";
export type { ConversationStore } from "./store.js";
export type * from "./types.js";

function claudeOptionsFromEnv(): ClaudeModelOptions {
  return {
    model: process.env.AI_MODEL || undefined,
    effort: (process.env.AI_EFFORT as Effort | undefined) || undefined,
  };
}

/**
 * Service from env vars:
 *   AI_MODEL     default claude-opus-5
 *   AI_EFFORT    low | medium | high | xhigh | max, default medium
 *   AI_TIMEZONE  default America/New_York
 * Key from ANTHROPIC_API_KEY or `ant auth login` profile.
 */
export function createAIServiceFromEnv(overrides: HandyAIServiceOptions = {}): HandyAIService {
  const model = new ClaudeExtractionModel(claudeOptionsFromEnv());
  return new HandyAIService({ model, timeZone: process.env.AI_TIMEZONE || undefined, ...overrides });
}

/** Drafter from env vars (AI_MODEL, AI_EFFORT). */
export function createJobMessageDrafterFromEnv(): JobMessageDrafter {
  return new JobMessageDrafter({ model: new ClaudeDraftModel(claudeOptionsFromEnv()) });
}
