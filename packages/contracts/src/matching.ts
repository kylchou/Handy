import type { AvailabilityStatus, QualificationLevel, ServiceCategoryCode, VerificationStatus } from "./enums";
import type { AvailabilitySlotDTO, ServiceRequestDTO } from "./dto";

/**
 * Boundary between the backend (Kyler, Engineer 2) and the matching engine (Aditya, Engineer 3).
 *
 * The backend loads candidate workers (with their qualifications, schedule,
 * existing bookings and history) and passes them in; the engine filters and
 * ranks them and returns matches. It never changes job state itself. Workers
 * who already declined the request are excluded before the call.
 *
 * Package `@handy/matching` should export `createMatchingService(): MatchingService`.
 */
export interface MatchingService {
  findMatches(request: ServiceRequestDTO, candidates: WorkerCandidate[]): Promise<WorkerMatch[]>;
}

export interface WorkerCandidate {
  workerId: string;
  displayName: string;
  latitude: number | null;
  longitude: number | null;
  serviceRadius: number;
  rating: number;
  ratingCount: number;
  completedJobs: number;
  /** Completed jobs in the request's category. */
  completedJobsInCategory: number;
  availabilityStatus: AvailabilityStatus;
  verificationStatus: VerificationStatus;
  qualifications: Array<{ serviceCategoryId: ServiceCategoryCode; qualificationLevel: QualificationLevel }>;
  weeklyAvailability: AvailabilitySlotDTO[];
  /** Existing active jobs, so double-booking can be avoided. */
  bookedWindows: Array<{ date: string; startTime: string; endTime: string }>;
}

export interface WorkerMatch {
  workerId: string;
  /** 0–100. */
  score: number;
  /** Miles; null when either side has no coordinates. */
  distance: number | null;
  qualificationMatch: boolean;
  availabilityMatch: boolean;
  rating: number;
  /** Optional human-readable reasons, e.g. "2.4 miles away". */
  reasons?: string[];
}

/** WorkerMatch enriched for display on the admin dashboard. */
export interface WorkerMatchDTO extends WorkerMatch {
  displayName: string;
  offered: boolean;
}

/** Default scoring weights from the spec. */
export const MATCH_WEIGHTS = {
  qualification: 0.3,
  availability: 0.25,
  distance: 0.2,
  rating: 0.15,
  experience: 0.1,
} as const;
