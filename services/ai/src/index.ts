import { HandyAIService, type HandyAIServiceOptions } from "./aiService.js";
import { ClaudeDraftModel, JobMessageDrafter } from "./draft.js";
import { ClaudeExtractionModel, type Effort } from "./model.js";
import { MuseDraftModel, MuseExtractionModel } from "./muse.js";

export { draftChanges, HandyAIService, missingFields, sanitizeExtraction } from "./aiService.js";
export type { HandyAIServiceOptions } from "./aiService.js";
export { CATEGORY_INFO, SERVICE_CATEGORIES } from "./categories.js";
export { ClaudeDraftModel, JobMessageDrafter, JsonDraftModel } from "./draft.js";
export type { DraftModel, DraftResult, DraftRunResult, DraftTurn, JobContext } from "./draft.js";
export { AIServiceError } from "./errors.js";
export { ClaudeExtractionModel, ClaudeJsonClient, DEFAULT_EFFORT, DEFAULT_MODEL, JsonExtractionModel } from "./model.js";
export type { ClaudeModelOptions, Effort, ExtractionModel, JsonClient, JsonResult, ModelInput, ModelRunResult } from "./model.js";
export { DEFAULT_MUSE_MODEL, MUSE_BASE_URL, MuseDraftModel, MuseExtractionModel, MuseJsonClient } from "./muse.js";
export type { MuseModelOptions } from "./muse.js";
export { classifySafety, EMERGENCY_MESSAGES, UNSUPPORTED_MESSAGES } from "./safety.js";
export type { SafetyCheck, UnsupportedKind } from "./safety.js";
export { screenJobMessage } from "./scam.js";
export type { ChatSender, ScamFlag, ScreenResult } from "./scam.js";
export type { ModelTurn } from "./schema.js";
export { areaOf, formatWhen, toWorkerJobCard } from "./workerCard.js";
export type { WorkerCardInput, WorkerJobCard } from "./workerCard.js";
export type * from "./types.js";

export type AIProvider = "muse" | "anthropic";

const has = (value: string | undefined) => Boolean(value?.trim());

/**
 * Which model to use:
 *   AI_PROVIDER=muse | anthropic → forced (its key must be set)
 *   else MODEL_API_KEY → Muse, else ANTHROPIC_API_KEY → Claude
 *   no key → throws, backend starts with its built-in assistant
 */
export function selectProvider(env: NodeJS.ProcessEnv = process.env): AIProvider {
  const forced = env.AI_PROVIDER?.trim().toLowerCase();
  const museKey = has(env.MODEL_API_KEY);
  const anthropicKey = has(env.ANTHROPIC_API_KEY) || has(env.ANTHROPIC_AUTH_TOKEN);

  if (forced === "muse") {
    if (!museKey) throw new Error("AI_PROVIDER=muse but MODEL_API_KEY is not set");
    return "muse";
  }
  if (forced === "anthropic") {
    if (!anthropicKey) throw new Error("AI_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set");
    return "anthropic";
  }
  if (forced) throw new Error(`Unknown AI_PROVIDER "${forced}" (use muse or anthropic)`);

  if (museKey) return "muse";
  if (anthropicKey) return "anthropic";
  throw new Error("No AI key set (MODEL_API_KEY or ANTHROPIC_API_KEY)");
}

function modelOverride(): string | undefined {
  return process.env.AI_MODEL?.trim() || undefined;
}

/**
 * Factory the backend loads (apps/api/src/integrations). Env (root .env):
 *   MODEL_API_KEY / ANTHROPIC_API_KEY  one required, see selectProvider
 *   AI_PROVIDER                        optional, muse | anthropic
 *   AI_MODEL                           default muse-spark-1.3 (Muse) or claude-opus-5 (Claude)
 *   AI_EFFORT                          Claude only, default medium
 * Passing your own `model` (tests, stubs) skips provider selection.
 */
export function createAIService(overrides: HandyAIServiceOptions = {}): HandyAIService {
  if (overrides.model) return new HandyAIService(overrides);
  const model =
    selectProvider() === "muse"
      ? new MuseExtractionModel({ model: modelOverride() })
      : new ClaudeExtractionModel({ model: modelOverride(), effort: (process.env.AI_EFFORT as Effort | undefined) || undefined });
  return new HandyAIService({ model, ...overrides });
}

/** Drafter, same provider rules. Not wired into the backend yet. */
export function createJobMessageDrafter(): JobMessageDrafter {
  const model =
    selectProvider() === "muse"
      ? new MuseDraftModel({ model: modelOverride() })
      : new ClaudeDraftModel({ model: modelOverride(), effort: (process.env.AI_EFFORT as Effort | undefined) || undefined });
  return new JobMessageDrafter({ model });
}
