import type { MatchingService, QualificationLevel, ServiceRequestDTO, WorkerCandidate } from "@handy/contracts";
import { haversineMiles } from "./geo.js";
import { needsFor, requirementFit } from "./requirements.js";
import {
  distanceScore,
  experienceScore,
  qualificationScore,
  ratingScore,
  round1,
  totalScore,
  weightsFor,
} from "./scoring.js";
import type { FindMatchesOptions, MatchableRequest, RankedWorkerMatch, ScoreBreakdown } from "./types.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
/** Customer rated them 4–5 stars before. */
const LIKED_BEFORE_BONUS = 5;
/** Helped this customer before, any rating (1–2 star workers are already removed by backend). */
const HELPED_BEFORE_BONUS = 2;

export class MatchingInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MatchingInputError";
  }
}

/**
 * Implements MatchingService from @handy/contracts. Backend passes candidates in,
 * gets all eligible workers back best first. Read-only; backend handles offers + jobs.
 */
export class DeterministicMatchingService implements MatchingService {
  async findMatches(request: ServiceRequestDTO, candidates: WorkerCandidate[]): Promise<RankedWorkerMatch[]> {
    return rankWorkers(request, candidates);
  }
}

/** Spec flow: qualification → availability → radius → score → sort. Pure. */
export function rankWorkers(
  request: MatchableRequest,
  candidates: WorkerCandidate[],
  options: FindMatchesOptions = {},
): RankedWorkerMatch[] {
  validateRequest(request);
  const limit = options.limit ?? Number.POSITIVE_INFINITY;
  const radiusMultiplier = options.radiusMultiplier ?? 1;
  const requireVerified = options.requireVerified ?? true;
  const excluded = new Set(options.excludeWorkerIds ?? []);
  const weights = weightsFor(request.urgency);
  const needs = needsFor(request.serviceCategoryId, request.specialRequirements);

  const matches: RankedWorkerMatch[] = [];

  for (const worker of candidates) {
    if (excluded.has(worker.workerId)) continue;
    if (requireVerified && worker.verificationStatus !== "VERIFIED") continue;

    // Qualification mandatory.
    const qualification = worker.qualifications.find((q) => q.serviceCategoryId === request.serviceCategoryId);
    if (!qualification) continue;

    const availability = checkAvailability(worker, request);
    if (!availability.available) continue;

    // Missing coordinates on either side → distance unknown, radius not enforced.
    const distance = milesBetween(request, worker);
    const radius = worker.serviceRadius * radiusMultiplier;
    if (distance != null && distance > radius) continue;

    // Special requirements (lifting, mobility, ladder, memory loss) → lower qualification score if level too low.
    const fit = requirementFit(qualification.qualificationLevel, needs);
    const breakdown: ScoreBreakdown = {
      qualification: Math.max(0, qualificationScore(qualification.qualificationLevel) - fit.penalty),
      availability: availability.score,
      distance: distanceScore(distance, radius),
      rating: ratingScore(worker.rating, worker.ratingCount),
      experience: experienceScore(worker.completedJobsInCategory),
    };

    const bonus = familiarityBonus(worker);
    const score = Math.min(100, round1(totalScore(breakdown, weights) + bonus));

    matches.push({
      workerId: worker.workerId,
      score,
      distance: distance == null ? null : round1(distance),
      qualificationMatch: true,
      availabilityMatch: !availability.partial,
      rating: worker.rating,
      breakdown: roundBreakdown(breakdown),
      reasons: [
        ...buildReasons(distance, worker, qualification.qualificationLevel, availability.partial, bonus > 0),
        ...fit.met.map((label) => `Experienced with ${label}`),
      ],
    });
  }

  matches.sort(
    (a, b) => b.score - a.score || (a.distance ?? Infinity) - (b.distance ?? Infinity) || a.workerId.localeCompare(b.workerId),
  );
  return matches.slice(0, limit);
}

interface AvailabilityResult {
  available: boolean;
  score: number;
  /** Schedule only covers part of the window. */
  partial: boolean;
}

export function checkAvailability(worker: WorkerCandidate, request: MatchableRequest): AvailabilityResult {
  const unavailable = { available: false, score: 0, partial: false };
  if (worker.availabilityStatus === "OFFLINE") return unavailable;

  const { requestedDate: date, requestedStartTime: start, requestedEndTime: end } = request;

  const conflict = worker.bookedWindows.some((b) => b.date === date && b.startTime < end && start < b.endTime);
  if (conflict) return unavailable;

  let score: number;
  let partial = false;
  if (worker.weeklyAvailability.length > 0) {
    const day = new Date(`${date}T00:00:00Z`).getUTCDay();
    const overlapping = worker.weeklyAvailability.filter((w) => w.dayOfWeek === day && w.startTime < end && start < w.endTime);
    if (overlapping.length === 0) return unavailable; // Doesn't work then at all.
    partial = !overlapping.some((w) => w.startTime <= start && w.endTime >= end);
    score = partial ? 70 : 100; // Partial overlap: could still work, ranked lower.
  } else {
    score = 80; // No schedule: likely free, unconfirmed.
  }

  if (worker.availabilityStatus === "BUSY") score -= 20; // On another job now.
  return { available: true, score, partial };
}

function milesBetween(request: MatchableRequest, worker: WorkerCandidate): number | null {
  if (request.latitude == null || request.longitude == null || worker.latitude == null || worker.longitude == null) return null;
  return haversineMiles(request.latitude, request.longitude, worker.latitude, worker.longitude);
}

function familiarityBonus(worker: WorkerCandidate): number {
  const past = worker.withCustomer;
  if (!past || past.completedJobs === 0) return 0;
  return (past.lastRating ?? 0) >= 4 ? LIKED_BEFORE_BONUS : HELPED_BEFORE_BONUS;
}

function validateRequest(request: MatchableRequest): void {
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
  distance: number | null,
  worker: WorkerCandidate,
  level: QualificationLevel,
  partial: boolean,
  helpedBefore: boolean,
): string[] {
  const reasons: string[] = [];
  if (distance != null) reasons.push(`${round1(distance)} miles away`);
  reasons.push(partial ? "Partly available at the requested time" : "Available at the requested time");
  reasons.push(level === "BASIC" ? "Qualified for this kind of job" : "Experienced with this kind of job");
  if (worker.ratingCount > 0) reasons.push(`${worker.rating.toFixed(1)}-star rating`);
  const similar = worker.completedJobsInCategory;
  if (similar > 0) reasons.push(`${similar} similar job${similar === 1 ? "" : "s"} completed`);
  if (helpedBefore) reasons.push("Has helped this customer before");
  return reasons;
}
