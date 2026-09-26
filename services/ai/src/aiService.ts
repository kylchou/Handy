import { AIServiceError } from "./errors.js";
import { ClaudeExtractionModel, type ExtractionModel } from "./model.js";
import { buildContextBlock, localNow, SYSTEM_PROMPT } from "./prompt.js";
import { EMERGENCY_MESSAGES, classifySafety } from "./safety.js";
import type { ModelTurn } from "./schema.js";
import { InMemoryConversationStore, type ConversationStore } from "./store.js";
import type {
  AIResponse,
  AIService,
  ConversationState,
  CustomerContext,
  EmergencyGuidance,
  ExtractedRequestData,
  RequiredField,
  SafetyStatus,
} from "./types.js";

export interface HandyAIServiceOptions {
  model?: ExtractionModel;
  store?: ConversationStore;
  /** For resolving "tomorrow", "Friday", etc. */
  timeZone?: string;
  now?: () => Date;
  /** Past turns sent to model; older dropped. */
  maxHistoryTurns?: number;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DEFAULT_DURATION_MINUTES = 60;

const REFUSAL_MESSAGE =
  "I'm sorry, that's not something our helpers can do. Is there something else I can help you with, like an errand, a ride, or help around the house?";

const QUESTION_FOR: Record<RequiredField, string> = {
  serviceCategory: "What can we help you with?",
  description: "Could you tell me a little more about what you need done?",
  date: "What day would you like help?",
  startTime: "What time would work best for you?",
  location: "What address should the helper come to?",
};

export class HandyAIService implements AIService {
  private readonly model: ExtractionModel;
  private readonly store: ConversationStore;
  private readonly timeZone: string;
  private readonly now: () => Date;
  private readonly maxHistoryTurns: number;

  constructor(options: HandyAIServiceOptions = {}) {
    this.model = options.model ?? new ClaudeExtractionModel();
    this.store = options.store ?? new InMemoryConversationStore();
    this.timeZone = options.timeZone ?? "America/New_York";
    this.now = options.now ?? (() => new Date());
    this.maxHistoryTurns = options.maxHistoryTurns ?? 40;
  }

  async getState(conversationId: string): Promise<ConversationState | undefined> {
    return this.store.get(conversationId);
  }

  async resetConversation(conversationId: string): Promise<void> {
    await this.store.delete(conversationId);
  }

  async processMessage(conversationId: string, message: string, customer: CustomerContext = {}): Promise<AIResponse> {
    const text = message.trim();
    const state = (await this.store.get(conversationId)) ?? newState(conversationId);

    if (!text) {
      return buildResponse(QUESTION_FOR.serviceCategory, state.extracted, "NEEDS_CLARIFICATION", false);
    }

    // 1. Safety check. Emergencies + unsupported requests never reach the model.
    const safety = classifySafety(text);
    if (safety.status !== "NORMAL_SERVICE") {
      return this.finish(state, text, safety.message ?? REFUSAL_MESSAGE, safety.status, state.extracted, false, safety.emergency);
    }

    // 2. Model turn: returns full updated request.
    const today = localNow(this.now(), this.timeZone);
    const history = state.history.slice(-this.maxHistoryTurns);
    let result;
    try {
      result = await this.model.run({
        system: SYSTEM_PROMPT,
        messages: [
          ...history,
          {
            role: "user",
            content: [
              { type: "text", text },
              { type: "text", text: buildContextBlock(today, this.timeZone, customer, state.extracted) },
            ],
          },
        ],
      });
    } catch (cause) {
      if (cause instanceof AIServiceError) throw cause;
      throw new AIServiceError("The AI model could not be reached", { cause });
    }

    if (result.kind === "refused") {
      return this.finish(state, text, REFUSAL_MESSAGE, "UNSUPPORTED_SERVICE", state.extracted, false);
    }

    const turn = result.output;
    const safetyStatus: SafetyStatus = turn.safetyStatus;

    if (safetyStatus === "POTENTIAL_EMERGENCY") {
      // Guarantee the reply includes a number to call.
      const reply = /\b(911|988)\b/.test(turn.reply) ? turn.reply : EMERGENCY_MESSAGES.GENERAL;
      return this.finish(state, text, reply, safetyStatus, state.extracted, false, { kind: "GENERAL", callNumber: "911" });
    }
    if (safetyStatus === "UNSUPPORTED_SERVICE") {
      return this.finish(state, text, turn.reply.trim() || REFUSAL_MESSAGE, safetyStatus, state.extracted, false);
    }

    // 3. Validate extraction, don't trust it.
    const extracted = sanitizeExtraction(turn.request, today.date, today.time);
    const missing = missingFields(extracted);
    const readyToSubmit = missing.length === 0 && safetyStatus === "NORMAL_SERVICE";
    const firstMissing = missing[0];
    const reply = turn.reply.trim() || (firstMissing ? QUESTION_FOR[firstMissing] : "Would you like me to find someone?");

    return this.finish(state, text, reply, safetyStatus, extracted, readyToSubmit && turn.userConfirmed);
  }

  private async finish(
    state: ConversationState,
    userText: string,
    reply: string,
    safetyStatus: SafetyStatus,
    extracted: ExtractedRequestData,
    userConfirmed: boolean,
    emergency?: EmergencyGuidance,
  ): Promise<AIResponse> {
    state.history.push({ role: "user", content: userText }, { role: "assistant", content: reply });
    state.history = state.history.slice(-this.maxHistoryTurns);
    state.extracted = extracted;
    state.safetyStatus = safetyStatus;
    state.updatedAt = this.now().toISOString();
    await this.store.save(state);

    return buildResponse(reply, extracted, safetyStatus, userConfirmed, emergency);
  }
}

function newState(conversationId: string): ConversationState {
  return {
    conversationId,
    history: [],
    extracted: {},
    safetyStatus: "NEEDS_CLARIFICATION",
    updatedAt: new Date(0).toISOString(),
  };
}

function buildResponse(
  message: string,
  extracted: ExtractedRequestData,
  safetyStatus: SafetyStatus,
  userConfirmed: boolean,
  emergency?: EmergencyGuidance,
): AIResponse {
  const missingInformation = missingFields(extracted);
  const readyToSubmit = missingInformation.length === 0 && safetyStatus === "NORMAL_SERVICE";
  return {
    message,
    extractedData: extracted,
    missingInformation,
    readyToSubmit,
    userConfirmed: readyToSubmit && userConfirmed,
    safetyStatus,
    ...(emergency ? { emergency } : {}),
  };
}

export function missingFields(data: ExtractedRequestData): RequiredField[] {
  const missing: RequiredField[] = [];
  if (!data.serviceCategoryId) missing.push("serviceCategory");
  if (!data.description) missing.push("description");
  if (!data.requestedDate) missing.push("date");
  if (!data.requestedStartTime) missing.push("startTime");
  if (!data.location) missing.push("location");
  return missing;
}

/** Drops bad formats + past dates/times. AI re-asks; backend never gets bad data. */
export function sanitizeExtraction(
  raw: ModelTurn["request"],
  todayDate: string,
  nowTime: string,
): ExtractedRequestData {
  const out: ExtractedRequestData = {};

  if (raw.serviceCategory) out.serviceCategoryId = raw.serviceCategory;

  const description = cleanText(raw.description);
  if (description) out.description = description;

  const location = cleanText(raw.location);
  if (location) out.location = location;

  if (raw.date && isRealDate(raw.date) && raw.date >= todayDate) out.requestedDate = raw.date;

  const start = raw.startTime && TIME_RE.test(raw.startTime) ? raw.startTime : undefined;
  const startIsPast = start !== undefined && out.requestedDate === todayDate && start < nowTime;
  if (start && !startIsPast) {
    out.requestedStartTime = start;
    const end = raw.endTime && TIME_RE.test(raw.endTime) && raw.endTime > start ? raw.endTime : undefined;
    out.requestedEndTime = end ?? addMinutes(start, DEFAULT_DURATION_MINUTES);
  }

  out.urgency = raw.urgency ?? "normal";
  out.specialRequirements = raw.specialRequirements.map((r) => cleanText(r)).filter((r): r is string => !!r);

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
