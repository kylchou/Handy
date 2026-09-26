import type { JobStatus, UserRole } from "./enums";

/**
 * Legal job status transitions, and which roles may perform each. The backend
 * enforces this; UIs can use it to decide which buttons to show.
 */
export const JOB_STATUS_TRANSITIONS: Record<JobStatus, Partial<Record<JobStatus, UserRole[]>>> = {
  SEARCHING: {},
  MATCHED: {},
  ACCEPTED: {
    EN_ROUTE: ["WORKER", "ADMIN"],
    CANCELLED: ["WORKER", "CUSTOMER", "ADMIN"],
  },
  EN_ROUTE: {
    ARRIVED: ["WORKER", "ADMIN"],
    CANCELLED: ["WORKER", "CUSTOMER", "ADMIN"],
  },
  ARRIVED: {
    IN_PROGRESS: ["WORKER", "ADMIN"],
    CANCELLED: ["WORKER", "ADMIN"],
  },
  IN_PROGRESS: {
    COMPLETED: ["WORKER", "ADMIN"],
  },
  COMPLETED: {},
  CANCELLED: {},
};

export function canTransitionJob(from: JobStatus, to: JobStatus, role: UserRole): boolean {
  return JOB_STATUS_TRANSITIONS[from][to]?.includes(role) ?? false;
}

/** The next forward step for the worker, e.g. ACCEPTED → EN_ROUTE ("I'm On My Way"). */
export function nextWorkerJobStatus(current: JobStatus): JobStatus | null {
  const next: Partial<Record<JobStatus, JobStatus>> = {
    ACCEPTED: "EN_ROUTE",
    EN_ROUTE: "ARRIVED",
    ARRIVED: "IN_PROGRESS",
    IN_PROGRESS: "COMPLETED",
  };
  return next[current] ?? null;
}

export const ACTIVE_JOB_STATUSES: JobStatus[] = ["ACCEPTED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS"];

/** Plain-language status labels for customer-facing screens. */
export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  SEARCHING: "Looking for someone",
  MATCHED: "Worker matched",
  ACCEPTED: "Worker accepted",
  EN_ROUTE: "On the way",
  ARRIVED: "Arrived",
  IN_PROGRESS: "Working on it",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};
