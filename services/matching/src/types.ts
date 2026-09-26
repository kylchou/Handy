/**
 * Matcher input/output.
 *
 * MatchableRequest: subset of ServiceRequestDTO, so the real DTO passes straight
 * in once @handy/contracts exists. Needs latitude/longitude.
 *
 * WorkerCandidate: loaded by backend from WorkerProfile + WorkerQualification,
 * plus schedules/bookings if available.
 */

export interface MatchableRequest {
  id?: string;
  serviceCategoryId: string;
  latitude: number;
  longitude: number;
  /** YYYY-MM-DD */
  requestedDate: string;
  /** HH:MM, 24-hour */
  requestedStartTime: string;
  /** HH:MM, 24-hour */
  requestedEndTime: string;
}

export type QualificationLevel = "BASIC" | "INTERMEDIATE" | "EXPERT";
export type WorkerAvailabilityStatus = "AVAILABLE" | "BUSY" | "OFFLINE";
export type VerificationStatus = "VERIFIED" | "PENDING" | "REJECTED";

export interface WorkerQualificationInput {
  serviceCategoryId: string;
  qualificationLevel: QualificationLevel;
}

/** Recurring weekly work window. */
export interface WeeklyWindow {
  /** 0 = Sunday … 6 = Saturday */
  dayOfWeek: number;
  start: string;
  end: string;
}

/** Already-accepted job. */
export interface BookedSlot {
  date: string;
  start: string;
  end: string;
}

export interface WorkerCandidate {
  workerId: string;
  latitude: number;
  longitude: number;
  serviceRadiusMiles: number;
  /** 0–5 average; 0 = unrated. */
  rating: number;
  completedJobs: number;
  availabilityStatus: WorkerAvailabilityStatus;
  verificationStatus: VerificationStatus;
  qualifications: WorkerQualificationInput[];
  /** Completed jobs per category, for experience score. Missing → completedJobs. */
  completedJobsByCategory?: Record<string, number>;
  /** Missing → free whenever not booked. */
  weeklyAvailability?: WeeklyWindow[];
  bookedSlots?: BookedSlot[];
}

export interface ScoreBreakdown {
  qualification: number;
  availability: number;
  distance: number;
  rating: number;
  experience: number;
}

export interface WorkerMatch {
  workerId: string;
  /** 0–100 */
  score: number;
  /** Miles, rounded to 0.1. */
  distance: number;
  qualificationMatch: boolean;
  availabilityMatch: boolean;
  rating: number;
  breakdown: ScoreBreakdown;
  /** Display reasons, e.g. "2.4 miles away". */
  reasons: string[];
}

export interface FindMatchesOptions {
  /** Max results. Default 10. */
  limit?: number;
  /** Scales every service radius, for widening search. Default 1. */
  radiusMultiplier?: number;
  /** Already declined or already notified. */
  excludeWorkerIds?: Iterable<string>;
  /** Previously used by customer → small boost. */
  preferredWorkerIds?: Iterable<string>;
  /** Verified workers only. Default true. */
  requireVerified?: boolean;
}

export interface MatchingService {
  findMatches(request: MatchableRequest, options?: FindMatchesOptions): Promise<WorkerMatch[]>;
}

/** Implemented by backend, e.g. Prisma query on WorkerProfile + WorkerQualification. */
export interface WorkerSource {
  findCandidates(serviceCategoryId: string): Promise<WorkerCandidate[]>;
}
