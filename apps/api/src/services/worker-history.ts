import type { ServiceCategoryCode } from "@handy/contracts";
import { jobsRepo, ratingsRepo } from "../repositories/jobs";
import type { ServiceContext } from "./context";

export interface WorkerHistory {
  completedJobs: number;
  lastJobDate: Date;
  lastServiceCategoryId: ServiceCategoryCode;
  /** The customer's most recent rating of this worker, if any. */
  lastRating: number | null;
}

/** Ratings at or below this mean "don't send them to me again". */
export const LOW_RATING = 2;

/** Every worker who has completed a job for this customer, keyed by worker id. */
export async function workerHistoryFor(ctx: ServiceContext, customerId: string): Promise<Map<string, WorkerHistory>> {
  const jobs = await jobsRepo.completedForCustomer(ctx.db, customerId);
  const ratings = await ratingsRepo.byJobs(ctx.db, jobs.map((j) => j.jobId));
  const ratingByJob = new Map(ratings.map((r) => [r.jobId, r.score]));

  const history = new Map<string, WorkerHistory>();
  for (const j of jobs) {
    // Jobs are newest first, so the first one seen per worker is their latest.
    const existing = history.get(j.workerId);
    const rating = ratingByJob.get(j.jobId) ?? null;
    if (!existing) {
      history.set(j.workerId, {
        completedJobs: 1,
        lastJobDate: j.completedAt ?? new Date(0),
        lastServiceCategoryId: j.serviceCategoryId,
        lastRating: rating,
      });
    } else {
      existing.completedJobs++;
      if (existing.lastRating === null) existing.lastRating = rating;
    }
  }
  return history;
}
