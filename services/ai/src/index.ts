import { HandyAIService, type HandyAIServiceOptions } from "./aiService.js";
import { JobMessageDrafter, MuseDraftModel } from "./draft.js";
import { MuseExtractionModel } from "./muse.js";

export { draftChanges, HandyAIService, missingFields, sanitizeExtraction } from "./aiService.js";
export type { HandyAIServiceOptions } from "./aiService.js";
export { CATEGORY_INFO, SERVICE_CATEGORIES } from "./categories.js";
export { JobMessageDrafter, JsonDraftModel, MuseDraftModel } from "./draft.js";
export type { DraftModel, DraftResult, DraftRunResult, DraftTurn, JobContext } from "./draft.js";
export { AIServiceError } from "./errors.js";
export { JsonExtractionModel } from "./model.js";
export type { ExtractionModel, JsonClient, JsonResult, ModelInput, ModelMessage, ModelRunResult, TextBlock } from "./model.js";
export { DEFAULT_MUSE_MODEL, MUSE_BASE_URL, MuseExtractionModel, MuseJsonClient } from "./muse.js";
export type { MuseModelOptions } from "./muse.js";
export { classifySafety, EMERGENCY_MESSAGES, UNSUPPORTED_MESSAGES } from "./safety.js";
export type { SafetyCheck, UnsupportedKind } from "./safety.js";
export { screenJobMessage } from "./scam.js";
export type { ChatSender, ScamFlag, ScreenResult } from "./scam.js";
export type { ModelTurn } from "./schema.js";
export { areaOf, formatWhen, toWorkerJobCard } from "./workerCard.js";
export type { WorkerCardInput, WorkerJobCard } from "./workerCard.js";
export type * from "./types.js";

/** Throws when there's no Muse key, so the backend starts with its built-in assistant instead. */
export function requireApiKey(env: NodeJS.ProcessEnv = process.env): void {
  if (!env.MODEL_API_KEY?.trim()) throw new Error("MODEL_API_KEY is not set");
}

function modelOverride(): string | undefined {
  return process.env.AI_MODEL?.trim() || undefined;
}

/**
 * Factory the backend loads (apps/api/src/integrations). Env (root .env):
 *   MODEL_API_KEY  required, Meta Model API key for Muse Spark
 *   AI_MODEL       optional, default muse-spark-1.2
 * Passing your own `model` (tests, stubs) skips the key check.
 */
export function createAIService(overrides: HandyAIServiceOptions = {}): HandyAIService {
  if (overrides.model) return new HandyAIService(overrides);
  requireApiKey();
  return new HandyAIService({ model: new MuseExtractionModel({ model: modelOverride() }), ...overrides });
}

/** Drafter, same key rules. Not wired into the backend yet. */
export function createJobMessageDrafter(): JobMessageDrafter {
  requireApiKey();
  return new JobMessageDrafter({ model: new MuseDraftModel({ model: modelOverride() }) });
}
