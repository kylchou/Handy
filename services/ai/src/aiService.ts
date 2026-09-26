import {
  REQUIRED_REQUEST_FIELDS,
  type AIConversationContext,
  type AIResponse,
  type AIService,
  type SafetyStatus,
  type ServiceRequestDraft,
} from "@handy/contracts";
import { AIServiceError } from "./errors.js";
import { ClaudeExtractionModel, type ExtractionModel, type ModelRunResult } from "./model.js";
import { buildContextBlock, clockIn, SYSTEM_PROMPT } from "./prompt.js";
import { EMERGENCY_MESSAGES, classifySafety } from "./safety.js";
import type { ModelTurn } from "./schema.js";
import type { ChatTurn } from "./types.js";

export interface HandyAIServiceOptions {
  model?: ExtractionModel;
  /** Past turns sent to model; older dropped. */
  maxHistoryTurns?: number;
}

type RequiredField = (typeof REQUIRED_REQUEST_FIELDS)[number];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DEFAULT_DURATION_MINUTES = 60;

const REFUSAL_MESSAGE =
  "I'm sorry, that's not something our helpers can do. Is there something else I can help you with, like an errand, a ride, or help around the house?";

const QUESTION_FOR: Record<RequiredField, string> = {
  serviceCategoryId: "What can we help you with?",
  description: "Could you tell me a little more about what you need done?",
  requestedDate: "What day would you like help?",
  requestedStartTime: "What time would work best for you?",
  location: "What address should the helper come to?",
};

/**
 * Implements AIService from @handy/contracts. Stateless: backend passes history +
 * current draft each turn and saves the result.
 */
export class HandyAIService implements AIService {
  private readonly model: ExtractionModel;
  private readonly maxHistoryTurns: number;

  constructor(options: HandyAIServiceOptions = {}) {
    this.model = options.model ?? new ClaudeExtractionModel();
    this.maxHistoryTurns = options.maxHistoryTurns ?? 40;
  }

  async processMessage(_conversationId: string, message: string, ctx: AIConversationContext): Promise<AIResponse> {
    const text = message.trim();
    const current = ctx.currentDraft;

    if (!text) return respond(QUESTION_FOR.serviceCategoryId, {}, current, "NEEDS_CLARIFICATION");

    // 1. Safety check. Emergencies + unsupported requests never reach the model.
    const safety = classifySafety(text);
    if (safety.status !== "NORMAL_SERVICE") {
      return respond(safety.message ?? REFUSAL_MESSAGE, {}, current, safety.status);
    }

    // 2. Model turn: returns full updated request.
    // Failures throw on purpose: backend answers that one message with its built-in assistant.
    const input = {
      system: SYSTEM_PROMPT,
      messages: [
        ...toModelHistory(ctx.history.slice(-this.maxHistoryTurns)),
        {
          role: "user" as const,
          content: [
            { type: "text" as const, text },
            { type: "text" as const, text: buildContextBlock(ctx) },
          ],
        },
      ],
    };
    let result: ModelRunResult;
    try {
      result = await this.model.run(input);
    } catch (err) {
      // Bad JSON / bad shape → one more try. Network, auth, credits → no point, SDK already retried.
      if (!(err instanceof AIServiceError)) throw err;
      result = await this.model.run(input);
    }

    if (result.kind === "refused") return respond(REFUSAL_MESSAGE, {}, current, "UNSUPPORTED_SERVICE");

    const turn = result.output;
    if (turn.safetyStatus === "POTENTIAL_EMERGENCY") {
      // Guarantee the reply includes a number to call.
      const reply = /\b(911|988)\b/.test(turn.reply) ? turn.reply : EMERGENCY_MESSAGES.GENERAL;
      return respond(reply, {}, current, "POTENTIAL_EMERGENCY");
    }
    if (turn.safetyStatus === "UNSUPPORTED_SERVICE") {
      return respond(turn.reply.trim() || REFUSAL_MESSAGE, {}, current, "UNSUPPORTED_SERVICE");
    }

    // 3. Validate extraction, don't trust it. Only send back what changed.
    const changes = draftChanges(current, sanitizeExtraction(turn.request, ctx));
    const after = { ...current, ...changes };
    const firstMissing = missingFields(after)[0];
    const reply = turn.reply.trim() || (firstMissing ? QUESTION_FOR[firstMissing] : "Would you like me to find someone?");

    // Ready only after a summary + "yes": draft was already complete (so a summary was shown),
    // model heard a yes, and nothing changed this turn ("Actually, make it Friday" → re-summarize).
    const confirmed =
      turn.customerConfirmed && missingFields(current).length === 0 && Object.keys(changes).length === 0;

    return respond(reply, changes, after, turn.safetyStatus, confirmed);
  }
}

function respond(
  message: string,
  extractedData: ServiceRequestDraft,
  draftAfter: ServiceRequestDraft,
  safetyStatus: SafetyStatus,
  confirmed = false,
): AIResponse {
  const missingInformation = missingFields(draftAfter);
  return {
    message,
    extractedData,
    missingInformation,
    readyToSubmit: confirmed && missingInformation.length === 0 && safetyStatus === "NORMAL_SERVICE",
    safetyStatus,
  };
}

/** Claude needs a user turn first; backend history starts with the AI greeting, so leading assistant turns are dropped. */
function toModelHistory(history: AIConversationContext["history"]): ChatTurn[] {
  const turns: ChatTurn[] = history.map((h) => ({ role: h.role === "customer" ? "user" : "assistant", content: h.content }));
  const firstUser = turns.findIndex((t) => t.role === "user");
  return firstUser === -1 ? [] : turns.slice(firstUser);
}

export function missingFields(draft: ServiceRequestDraft): RequiredField[] {
  return REQUIRED_REQUEST_FIELDS.filter((f) => draft[f] == null || draft[f] === "");
}

/**
 * Contract merge rules: undefined = leave alone, null = clear.
 * `next` uses undefined for "keep" and null for "clear".
 */
export function draftChanges(current: ServiceRequestDraft, next: ServiceRequestDraft): ServiceRequestDraft {
  const changes: ServiceRequestDraft = {};
  for (const key of Object.keys(next) as Array<keyof ServiceRequestDraft>) {
    const value = next[key];
    if (value === undefined) continue;
    if (JSON.stringify(current[key] ?? null) !== JSON.stringify(value)) {
      (changes as Record<string, unknown>)[key] = value;
    }
  }
  return changes;
}

/**
 * Model output → draft. Drops bad formats, past dates/times, unknown worker ids.
 * Model left it null/empty → undefined (keep; a forgetful model never wipes data).
 * Given but invalid → null (clear, AI re-asks).
 */
export function sanitizeExtraction(raw: ModelTurn["request"], ctx: AIConversationContext): ServiceRequestDraft {
  const out: ServiceRequestDraft = {};
  const nowTime = clockIn(ctx.now, ctx.timezone);
  const set = <K extends keyof ServiceRequestDraft>(key: K, given: unknown, valid: ServiceRequestDraft[K] | undefined) => {
    if (valid !== undefined) out[key] = valid;
    else if (given != null) out[key] = null as ServiceRequestDraft[K];
  };

  // Valid ids come from the backend's category list (all contract codes if it's empty).
  const allowed = ctx.serviceCategories.map((c) => c.id);
  const category = raw.serviceCategory && (allowed.length === 0 || allowed.includes(raw.serviceCategory)) ? raw.serviceCategory : undefined;
  set("serviceCategoryId", raw.serviceCategory, category);
  set("description", raw.description, cleanText(raw.description));
  set("location", raw.location, cleanText(raw.location));

  const date = raw.date && isRealDate(raw.date) && raw.date >= ctx.today ? raw.date : undefined;
  set("requestedDate", raw.date, date);

  const effectiveDate = date ?? ctx.currentDraft.requestedDate ?? undefined;
  const startValid = raw.startTime && TIME_RE.test(raw.startTime) ? raw.startTime : undefined;
  const start = startValid && !(effectiveDate === ctx.today && startValid < nowTime) ? startValid : undefined;
  set("requestedStartTime", raw.startTime, start);
  if (start) {
    const end = raw.endTime && TIME_RE.test(raw.endTime) && raw.endTime > start ? raw.endTime : undefined;
    out.requestedEndTime = end ?? addMinutes(start, DEFAULT_DURATION_MINUTES);
  } else if (raw.startTime != null) {
    out.requestedEndTime = null;
  }

  const urgency = raw.urgency ?? (ctx.currentDraft.urgency ? undefined : "NORMAL");
  if (urgency) out.urgency = urgency;
  const requirements = raw.specialRequirements.map((r) => cleanText(r)).filter((r): r is string => !!r);
  if (requirements.length) out.specialRequirements = requirements;

  const knownWorker = (ctx.pastWorkers ?? []).some((w) => w.workerId === raw.preferredWorkerId);
  set("preferredWorkerId", raw.preferredWorkerId, knownWorker ? (raw.preferredWorkerId ?? undefined) : undefined);
  if (raw.repeat) out.repeat = raw.repeat;

  return out;
}

function cleanText(value: string | null): string | undefined {
  const trimmed = value?.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed : undefined;
}

function isRealDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number) as [number, number];
  const total = Math.min(h * 60 + m + minutes, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
