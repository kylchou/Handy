import type {
  AIResponse,
  JobDTO,
  JobMessageDTO,
  JobStatus,
  HistoryEntryDTO,
  ServerEvent,
  ServiceCategory,
  ServiceRequestDTO,
} from "./types";

/**
 * Stands in for: AI service (services/ai), matching engine
 * (services/matching), and the backend job state machine (apps/api).
 * Only used when USE_MOCK_API is true. Nothing here should leak into
 * lib/api.ts's exported shape - it must look identical to a real
 * backend caller.
 */

let requestCounter = 0;
let jobCounter = 0;

const conversations = new Map<
  string,
  { turns: number; draft: Partial<ServiceRequestDTO> }
>();

const requests = new Map<string, ServiceRequestDTO>();
const jobs = new Map<string, JobDTO>();
const jobMessages = new Map<string, JobMessageDTO[]>();
const eventSubscribers = new Map<string, Set<(e: ServerEvent) => void>>();

function emit(jobId: string, event: ServerEvent) {
  eventSubscribers.get(jobId)?.forEach((cb) => cb(event));
}

const EMERGENCY_WORDS = [
  "collapsed",
  "not breathing",
  "unresponsive",
  "chest pain",
  "911",
  "emergency",
  "bleeding badly",
  "can't breathe",
];

function guessCategory(text: string): ServiceCategory {
  const t = text.toLowerCase();
  if (/(lawn|mow|grass)/.test(t)) return "LAWN_CARE";
  if (/(grocer|errand|pharmacy|pick up|package)/.test(t)) return "ERRANDS";
  if (/(drive|ride|airport|transport|appointment)/.test(t))
    return "TRANSPORTATION";
  if (/(sink|leak|pipe|plumb)/.test(t)) return "PLUMBING";
  if (/(clean|tidy|vacuum)/.test(t)) return "CLEANING";
  if (/(move|couch|furniture|lift)/.test(t)) return "MOVING_ASSISTANCE";
  if (/(dog|cat|pet|vet)/.test(t)) return "PET_ASSISTANCE";
  if (/(wifi|computer|phone|tv|tech)/.test(t)) return "TECH_SUPPORT";
  if (/(check on|companion|visit|talk|lonely)/.test(t))
    return "COMPANIONSHIP";
  if (/(light|ladder|fix|repair|maintenance|handyman)/.test(t))
    return "HOME_MAINTENANCE";
  return "OTHER";
}

export async function mockSendChatMessage(
  conversationId: string,
  message: string
): Promise<AIResponse> {
  await delay(500);

  if (EMERGENCY_WORDS.some((w) => message.toLowerCase().includes(w))) {
    return {
      conversationId,
      message:
        "This sounds like it could be a medical emergency. Please call 911 (or your local emergency number) right now, or I can connect you to emergency services. This isn't something our workers can help with.",
      extractedData: {},
      missingInformation: [],
      readyToSubmit: false,
      safetyStatus: "POTENTIAL_EMERGENCY",
    };
  }

  const state = conversations.get(conversationId) ?? {
    turns: 0,
    draft: {},
  };

  if (state.turns === 0) {
    state.draft.serviceCategoryId = guessCategory(message);
    state.draft.description = message.trim();
  }
  state.turns += 1;
  conversations.set(conversationId, state);

  const missing: string[] = [];
  if (!state.draft.requestedDate) missing.push("date");
  if (!state.draft.requestedStartTime) missing.push("time");
  if (!state.draft.location) missing.push("location");

  // Very small heuristic "extraction" so the demo conversation feels
  // responsive - a real LLM call replaces all of this.
  const lower = message.toLowerCase();
  if (missing.includes("time")) {
    const timeMatch = lower.match(/(\d{1,2})\s?(am|pm)?/);
    if (
      /tomorrow|today|around|at|pm|am|morning|afternoon|evening/.test(lower)
    ) {
      state.draft.requestedStartTime = timeMatch
        ? normalizeTime(timeMatch[1], timeMatch[2])
        : "15:00";
      state.draft.requestedEndTime = addHour(state.draft.requestedStartTime);
    }
  }
  if (missing.includes("date")) {
    if (/tomorrow/.test(lower)) state.draft.requestedDate = tomorrowISO();
    else if (/today/.test(lower)) state.draft.requestedDate = todayISO();
  }
  if (missing.includes("location") && state.turns > 1 && lower.length > 3) {
    // Once we've already asked once, treat the next substantive reply
    // as the location if nothing more specific was said.
    if (!/^(yes|yeah|yep|no|nope|correct)\b/.test(lower)) {
      state.draft.location = message.trim();
    }
  }

  const stillMissing: string[] = [];
  if (!state.draft.requestedDate) stillMissing.push("date");
  if (!state.draft.requestedStartTime) stillMissing.push("time");
  if (!state.draft.location) stillMissing.push("location");

  if (stillMissing.length === 0) {
    return {
      conversationId,
      message: summarize(state.draft),
      extractedData: state.draft,
      missingInformation: [],
      readyToSubmit: true,
      safetyStatus: "NORMAL_SERVICE",
    };
  }

  const nextQuestion =
    stillMissing[0] === "date"
      ? "What day would you like this done?"
      : stillMissing[0] === "time"
      ? "What time works best for you?"
      : "What's the address for this?";

  return {
    conversationId,
    message:
      state.turns === 1
        ? `I can help with that. ${nextQuestion}`
        : nextQuestion,
    extractedData: state.draft,
    missingInformation: stillMissing,
    readyToSubmit: false,
    safetyStatus: "NORMAL_SERVICE",
  };
}

function normalizeTime(hourStr?: string, meridiem?: string): string {
  if (!hourStr) return "15:00";
  let hour = parseInt(hourStr, 10);
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (!meridiem && hour < 8) hour += 12;
  return `${String(hour).padStart(2, "0")}:00`;
}
function addHour(time: string): string {
  const [h] = time.split(":").map(Number);
  return `${String((h + 1) % 24).padStart(2, "0")}:00`;
}
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function tomorrowISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}
function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function summarize(draft: Partial<ServiceRequestDTO>): string {
  return "Here's what I have. Take a look and confirm it's right, or tell me what to change.";
}

export async function mockConfirmRequest(
  customerId: string,
  conversationId: string,
  draft: Partial<ServiceRequestDTO>
): Promise<ServiceRequestDTO> {
  await delay(300);
  requestCounter += 1;
  const request: ServiceRequestDTO = {
    id: `req_${requestCounter}`,
    customerId,
    conversationId,
    serviceCategoryId: draft.serviceCategoryId ?? "OTHER",
    description: draft.description ?? "",
    location: draft.location ?? "",
    requestedDate: draft.requestedDate ?? todayISO(),
    requestedStartTime: draft.requestedStartTime ?? "15:00",
    requestedEndTime: draft.requestedEndTime ?? "16:00",
    urgency: "NORMAL",
    status: "SEARCHING",
    estimatedPrice: 35,
  };
  requests.set(request.id, request);

  jobCounter += 1;
  const job: JobDTO = {
    id: `job_${jobCounter}`,
    requestId: request.id,
    status: "SEARCHING",
    createdAt: new Date().toISOString(),
  };
  jobs.set(job.id, job);
  jobMessages.set(job.id, []);

  // Simulate: matching engine finds someone, worker accepts, then
  // walks through the job lifecycle, the way the real worker app +
  // backend would drive it via the SSE/WebSocket channel.
  runJobSimulation(job.id);

  return request;
}

function runJobSimulation(jobId: string) {
  const steps: { status: JobStatus; delayMs: number }[] = [
    { status: "MATCHED", delayMs: 1800 },
    { status: "ACCEPTED", delayMs: 1500 },
    { status: "EN_ROUTE", delayMs: 4000 },
    { status: "ARRIVED", delayMs: 4000 },
    { status: "IN_PROGRESS", delayMs: 3000 },
    { status: "COMPLETED", delayMs: 3500 },
  ];
  let cumulative = 0;
  for (const step of steps) {
    cumulative += step.delayMs;
    setTimeout(() => {
      const job = jobs.get(jobId);
      if (!job) return;
      job.status = step.status;
      if (step.status === "MATCHED") {
        job.worker = {
          id: "worker_demo_1",
          firstName: "James",
          lastName: "R.",
          rating: 4.9,
          completedJobs: 87,
          distanceMiles: 2.4,
        };
      }
      if (step.status === "ACCEPTED") job.acceptedAt = new Date().toISOString();
      if (step.status === "IN_PROGRESS")
        job.startedAt = new Date().toISOString();
      if (step.status === "COMPLETED") {
        job.completedAt = new Date().toISOString();
        job.finalPrice = 35;
      }
      jobs.set(jobId, job);
      const eventType =
        step.status === "MATCHED"
          ? "WORKER_MATCHED"
          : step.status === "ACCEPTED"
          ? "JOB_ACCEPTED"
          : step.status === "EN_ROUTE"
          ? "WORKER_EN_ROUTE"
          : step.status === "ARRIVED"
          ? "WORKER_ARRIVED"
          : step.status === "COMPLETED"
          ? "JOB_COMPLETED"
          : "REQUEST_CREATED";
      emit(jobId, { type: eventType, jobId, payload: job });
    }, cumulative);
  }
}

export function mockSubscribeJob(
  jobId: string,
  cb: (e: ServerEvent) => void
): () => void {
  if (!eventSubscribers.has(jobId)) eventSubscribers.set(jobId, new Set());
  eventSubscribers.get(jobId)!.add(cb);
  return () => eventSubscribers.get(jobId)?.delete(cb);
}

export async function mockGetJob(jobId: string): Promise<JobDTO | undefined> {
  await delay(150);
  return jobs.get(jobId);
}

export async function mockGetRequest(
  requestId: string
): Promise<ServiceRequestDTO | undefined> {
  await delay(150);
  return requests.get(requestId);
}

export async function mockGetJobForRequest(
  requestId: string
): Promise<JobDTO | undefined> {
  await delay(150);
  return [...jobs.values()].find((j) => j.requestId === requestId);
}

export async function mockSendJobMessage(
  jobId: string,
  senderId: string,
  content: string
): Promise<JobMessageDTO> {
  await delay(200);
  const msg: JobMessageDTO = {
    id: `msg_${Date.now()}`,
    jobId,
    senderId,
    senderType: "CUSTOMER",
    content,
    createdAt: new Date().toISOString(),
  };
  const list = jobMessages.get(jobId) ?? [];
  list.push(msg);
  jobMessages.set(jobId, list);
  // Simulate a short worker acknowledgment for the demo.
  setTimeout(() => {
    const reply: JobMessageDTO = {
      id: `msg_${Date.now()}_r`,
      jobId,
      senderId: "worker_demo_1",
      senderType: "WORKER",
      content: "Sounds good, thank you for letting me know.",
      createdAt: new Date().toISOString(),
    };
    const l = jobMessages.get(jobId) ?? [];
    l.push(reply);
    jobMessages.set(jobId, l);
    emit(jobId, { type: "MESSAGE_RECEIVED", jobId, payload: reply });
  }, 1200);
  return msg;
}

export async function mockGetJobMessages(
  jobId: string
): Promise<JobMessageDTO[]> {
  await delay(150);
  return jobMessages.get(jobId) ?? [];
}

export async function mockGetHistory(): Promise<HistoryEntryDTO[]> {
  await delay(200);
  return [...jobs.values()]
    .filter((j) => j.status === "COMPLETED")
    .map((j) => {
      const req = requests.get(j.requestId);
      return {
        jobId: j.id,
        serviceCategoryId: req?.serviceCategoryId ?? "OTHER",
        workerName: j.worker
          ? `${j.worker.firstName} ${j.worker.lastName}`
          : "—",
        date: req?.requestedDate ?? "",
        status: j.status,
        price: j.finalPrice ?? 0,
      };
    });
}
