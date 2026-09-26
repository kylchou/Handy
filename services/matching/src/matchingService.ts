import { haversineMiles } from "./geo.js";
import {
  distanceScore,
  experienceScore,
  qualificationScore,
  ratingScore,
  round1,
  totalScore,
} from "./scoring.js";
import type {
  FindMatchesOptions,
  MatchableRequest,
  MatchingService,
  ScoreBreakdown,
  WorkerCandidate,
  WorkerMatch,
  WorkerSource,
} from "./types.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DEFAULT_LIMIT = 10;
/** Boost for previously used worker. */
const PREFERRED_WORKER_BONUS = 5;

export class MatchingInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MatchingInputError";
  }
}

/** Loads + ranks candidates from backend. Read-only; backend handles notifying + job creation. */
export class DeterministicMatchingService implements MatchingService {
  constructor(private readonly workers: WorkerSource) {}

  async findMatches(request: MatchableRequest, options: FindMatchesOptions = {}): Promise<WorkerMatch[]> {
    validateRequest(request);
    const candidates = await this.workers.findCandidates(request.serviceCategoryId);
    return rankWorkers(request, candidates, options);
  }
}

/** Spec flow: qualification → availability → radius → score → sort. Pure, no WorkerSource needed. */
export function rankWorkers(
  request: MatchableRequest,
  candidates: WorkerCandidate[],
  options: FindMatchesOptions = {},
): WorkerMatch[] {
  validateRequest(request);
  const limit = options.limit ?? DEFAULT_LIMIT;
  const radiusMultiplier = options.radiusMultiplier ?? 1;
  const requireVerified = options.requireVerified ?? true;
  const excluded = new Set(options.excludeWorkerIds ?? []);
  const preferred = new Set(options.preferredWorkerIds ?? []);

  const matches: WorkerMatch[] = [];

  for (const worker of candidates) {
    if (excluded.has(worker.workerId)) continue;
    if (requireVerified && worker.verificationStatus !== "VERIFIED") continue;

    // Qualification mandatory.
    const qualification = worker.qualifications.find((q) => q.serviceCategoryId === request.serviceCategoryId);
    if (!qualification) continue;

    const availability = checkAvailability(worker, request);
    if (!availability.available) continue;

    const distance = haversineMiles(request.latitude, request.longitude, worker.latitude, worker.longitude);
    const radius = worker.serviceRadiusMiles * radiusMultiplier;
    if (distance > radius) continue;

    const similarJobs = worker.completedJobsByCategory?.[request.serviceCategoryId] ?? worker.completedJobs;
    const breakdown: ScoreBreakdown = {
      qualification: qualificationScore(qualification.qualificationLevel),
      availability: availability.score,
      distance: distanceScore(distance, radius),
      rating: ratingScore(worker.rating, worker.completedJobs),
      experience: experienceScore(similarJobs),
    };

    let score = totalScore(breakdown);
    if (preferred.has(worker.workerId)) score = Math.min(100, score + PREFERRED_WORKER_BONUS);

    matches.push({
      workerId: worker.workerId,
      score,
      distance: round1(distance),
      qualificationMatch: true,
      availabilityMatch: true,
      rating: worker.rating,
      breakdown: roundBreakdown(breakdown),
      reasons: buildReasons(distance, worker, similarJobs, qualification.qualificationLevel, preferred.has(worker.workerId)),
    });
  }

  matches.sort((a, b) => b.score - a.score || a.distance - b.distance || a.workerId.localeCompare(b.workerId));
  return matches.slice(0, limit);
}

interface AvailabilityResult {
  available: boolean;
  score: number;
}

export function checkAvailability(worker: WorkerCandidate, request: MatchableRequest): AvailabilityResult {
  if (worker.availabilityStatus === "OFFLINE") return { available: false, score: 0 };

  const { requestedDate: date, requestedStartTime: start, requestedEndTime: end } = request;

  const conflict = worker.bookedSlots?.some((slot) => slot.date === date && slot.start < end && start < slot.end);
  if (conflict) return { available: false, score: 0 };

  let score: number;
  if (worker.weeklyAvailability && worker.weeklyAvailability.length > 0) {
    const day = new Date(`${date}T00:00:00Z`).getUTCDay();
    const covered = worker.weeklyAvailability.some(
      (w) => w.dayOfWeek === day && w.start <= start && w.end >= end,
    );
    if (!covered) return { available: false, score: 0 };
    score = 100; // Schedule confirms window.
  } else {
    score = 80; // No schedule: likely free, unconfirmed.
  }

  if (worker.availabilityStatus === "BUSY") score -= 20; // On another job now.
  return { available: true, score };
}

function validateRequest(request: MatchableRequest): void {
  if (!Number.isFinite(request.latitude) || !Number.isFinite(request.longitude)) {
    throw new MatchingInputError("Request needs latitude and longitude before matching");
  }
  if (!DATE_RE.test(request.requestedDate)) {
    throw new MatchingInputError(`Invalid requestedDate: ${request.requestedDate}`);
  }
  if (!TIME_RE.test(request.requestedStartTime) || !TIME_RE.test(request.requestedEndTime)) {
    throw new MatchingInputError("requestedStartTime and requestedEndTime must be HH:MM");
  }
  if (request.requestedEndTime <= request.requestedStartTime) {
    throw new MatchingInputError("requestedEndTime must be after requestedStartTime");
  }
}

function roundBreakdown(b: ScoreBreakdown): ScoreBreakdown {
  return {
    qualification: round1(b.qualification),
    availability: round1(b.availability),
    distance: round1(b.distance),
    rating: round1(b.rating),
    experience: round1(b.experience),
  };
}

function buildReasons(
  distance: number,
  worker: WorkerCandidate,
  similarJobs: number,
  level: WorkerCandidate["qualifications"][number]["qualificationLevel"],
  preferred: boolean,
): string[] {
  const reasons = [`${round1(distance)} miles away`, "Available at the requested time"];
  reasons.push(level === "EXPERT" ? "Highly experienced with this kind of job" : "Qualified for this kind of job");
  if (worker.completedJobs > 0 && worker.rating > 0) reasons.push(`${worker.rating.toFixed(1)}-star rating`);
  if (similarJobs > 0) reasons.push(`${similarJobs} similar job${similarJobs === 1 ? "" : "s"} completed`);
  if (preferred) reasons.push("You've worked with them before");
  return reasons;
}
