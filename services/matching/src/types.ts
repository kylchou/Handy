import type { ServiceRequestDTO, WorkerMatch } from "@handy/contracts";

/**
 * Local types only. Shared ones (MatchingService, WorkerCandidate, WorkerMatch,
 * ServiceRequestDTO) come from @handy/contracts.
 */

/** Part of ServiceRequestDTO the matcher reads, so helpers work without a full DTO. */
export type MatchableRequest = Pick<
  ServiceRequestDTO,
  "serviceCategoryId" | "latitude" | "longitude" | "requestedDate" | "requestedStartTime" | "requestedEndTime"
>;

export interface ScoreBreakdown {
  qualification: number;
  availability: number;
  distance: number;
  rating: number;
  experience: number;
}

/** Contract WorkerMatch + score breakdown, always-present reasons. */
export interface RankedWorkerMatch extends WorkerMatch {
  breakdown: ScoreBreakdown;
  reasons: string[];
}

export interface FindMatchesOptions {
  /** Max results. Default: all eligible (backend offers top N, then the rest). */
  limit?: number;
  /** Scales every service radius, for widening search. Default 1. */
  radiusMultiplier?: number;
  /** Already declined or already notified. */
  excludeWorkerIds?: Iterable<string>;
  /** Verified workers only. Default true. */
  requireVerified?: boolean;
}
