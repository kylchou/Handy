import {
  REQUIRED_REQUEST_FIELDS,
  SAFETY_STATUSES,
  URGENCIES,
  type AIConversationContext,
  type AIResponse,
  type AIService,
  type MatchingService,
  type SafetyStatus,
  type ServiceRequestDTO,
  type ServiceRequestDraft,
  type Urgency,
  type WorkerCandidate,
  type WorkerMatch,
} from "@handy/contracts";

type Logger = { warn: (msg: string) => void };

const DEFAULT_AI_TIMEOUT_MS = 30_000;
const MATCHING_TIMEOUT_MS = 5_000;

/**
 * Sits in front of the real AI service. If it throws, hangs, or sends back
 * something the backend can't use, we answer with the built-in one instead
 * so the customer never gets stuck mid-conversation. Answers that come back
 * are cleaned up field by field, so one bad value (like "tomorrow" as a date)
 * doesn't get saved into the request.
 */
export class GuardedAIService implements AIService {
  constructor(
    private primary: AIService,
    private backup: AIService,
    private log: Logger,
    private timeoutMs = DEFAULT_AI_TIMEOUT_MS,
  ) {}

  async processMessage(conversationId: string, message: string, context: AIConversationContext): Promise<AIResponse> {
    try {
      const raw = await withTimeout(this.primary.processMessage(conversationId, message, context), this.timeoutMs);
      return cleanAIResponse(raw, context);
    } catch (err) {
      this.log.warn(`AI service failed, using the built-in one for this message: ${(err as Error).message}`);
      return this.backup.processMessage(conversationId, message, context);
    }
  }
}

/** Same idea for matching: if it breaks, requests still go out to workers. */
export class GuardedMatchingService implements MatchingService {
  constructor(
    private primary: MatchingService,
    private backup: MatchingService,
    private log: Logger,
  ) {}

  async findMatches(request: ServiceRequestDTO, candidates: WorkerCandidate[]): Promise<WorkerMatch[]> {
    try {
      const raw = await withTimeout(this.primary.findMatches(request, candidates), MATCHING_TIMEOUT_MS);
      return cleanMatches(raw, candidates);
    } catch (err) {
      this.log.warn(`Matching service failed, using the built-in one for request ${request.id}: ${(err as Error).message}`);
      return this.backup.findMatches(request, candidates);
    }
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`no answer after ${ms / 1000}s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^(\d{1,2}):(\d{2})$/;

export function cleanAIResponse(raw: unknown, context: AIConversationContext): AIResponse {
  if (!raw || typeof raw !== "object") throw new Error("response wasn't an object");
  const r = raw as Record<string, unknown>;
  if (typeof r.message !== "string" || !r.message.trim()) throw new Error("response had no message");

  const safety = typeof r.safetyStatus === "string" ? r.safetyStatus.toUpperCase() : "";
  const known = new Set<string>(REQUIRED_REQUEST_FIELDS);
  return {
    message: r.message.trim(),
    extractedData: cleanDraft(r.extractedData, context),
    missingInformation: Array.isArray(r.missingInformation) ? r.missingInformation.filter((f): f is string => typeof f === "string" && known.has(f)) : [],
    readyToSubmit: r.readyToSubmit === true,
    safetyStatus: (SAFETY_STATUSES as readonly string[]).includes(safety) ? (safety as SafetyStatus) : "NEEDS_CLARIFICATION",
  };
}

/** Keeps the fields that look right and quietly drops the rest. null still means "clear it". */
function cleanDraft(raw: unknown, context: AIConversationContext): ServiceRequestDraft {
  if (!raw || typeof raw !== "object") return {};
  const d = raw as Record<string, unknown>;
  const out: ServiceRequestDraft = {};
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

  if (d.serviceCategoryId === null) out.serviceCategoryId = null;
  else if (context.serviceCategories.some((c) => c.id === d.serviceCategoryId)) out.serviceCategoryId = d.serviceCategoryId as ServiceRequestDraft["serviceCategoryId"];

  for (const key of ["description", "location"] as const) {
    if (d[key] === null) out[key] = null;
    else if (text(d[key])) out[key] = text(d[key]);
  }

  if (d.requestedDate === null) out.requestedDate = null;
  else if (typeof d.requestedDate === "string" && DATE.test(d.requestedDate)) out.requestedDate = d.requestedDate;

  for (const key of ["requestedStartTime", "requestedEndTime"] as const) {
    if (d[key] === null) out[key] = null;
    else if (typeof d[key] === "string") {
      const m = TIME.exec(d[key]);
      if (m && Number(m[1]) < 24 && Number(m[2]) < 60) out[key] = `${m[1]!.padStart(2, "0")}:${m[2]}`;
    }
  }

  if (d.urgency === null) out.urgency = null;
  else if (typeof d.urgency === "string" && (URGENCIES as readonly string[]).includes(d.urgency.toUpperCase())) out.urgency = d.urgency.toUpperCase() as Urgency;

  if (d.specialRequirements === null) out.specialRequirements = null;
  else if (Array.isArray(d.specialRequirements)) out.specialRequirements = d.specialRequirements.filter((s): s is string => typeof s === "string" && !!s.trim());

  // Only people who've actually helped this customer can be asked for by name.
  if (d.preferredWorkerId === null) out.preferredWorkerId = null;
  else if (context.pastWorkers?.some((w) => w.workerId === d.preferredWorkerId)) out.preferredWorkerId = d.preferredWorkerId as string;

  if (d.repeat === null) out.repeat = null;
  else if (d.repeat === "WEEKLY" || d.repeat === "BIWEEKLY") out.repeat = d.repeat;

  return out;
}

/** Drops anyone we didn't send, repeats, and scores outside 0-100. Best first. */
export function cleanMatches(raw: unknown, candidates: WorkerCandidate[]): WorkerMatch[] {
  if (!Array.isArray(raw)) throw new Error("matches weren't a list");
  const byId = new Map(candidates.map((c) => [c.workerId, c]));
  const seen = new Set<string>();
  const out: WorkerMatch[] = [];
  for (const m of raw as Array<Partial<WorkerMatch> | null>) {
    const candidate = m?.workerId ? byId.get(m.workerId) : undefined;
    if (!m || !candidate || seen.has(candidate.workerId)) continue;
    seen.add(candidate.workerId);
    const score = Number(m.score);
    out.push({
      workerId: candidate.workerId,
      score: Number.isFinite(score) ? Math.min(100, Math.max(0, score)) : 0,
      distance: typeof m.distance === "number" && Number.isFinite(m.distance) ? m.distance : null,
      qualificationMatch: m.qualificationMatch !== false,
      availabilityMatch: m.availabilityMatch !== false,
      rating: typeof m.rating === "number" ? m.rating : candidate.rating,
      ...(Array.isArray(m.reasons) ? { reasons: m.reasons.filter((s): s is string => typeof s === "string") } : {}),
    });
  }
  return out.sort((a, b) => b.score - a.score);
}
