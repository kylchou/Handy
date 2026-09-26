import type { JobStatus, ServiceRequestStatus } from "./enums";
import type { JobMessageDTO, JobOfferDTO, NotificationDTO } from "./dto";

/**
 * Realtime events pushed to clients over SSE (`GET /api/v1/events?token=`) or
 * WebSocket (`GET /api/v1/ws?token=`). Each client receives the events addressed
 * to its user; admins additionally receive every event.
 */
export const RealtimeEventType = {
  REQUEST_CREATED: "REQUEST_CREATED",
  REQUEST_CANCELLED: "REQUEST_CANCELLED",
  /** Sent to the customer: nobody accepted before the requested time passed. */
  REQUEST_EXPIRED: "REQUEST_EXPIRED",
  /** Sent to a worker: a new job is available to them. */
  JOB_OFFERED: "JOB_OFFERED",
  /** Sent to the customer: matching found workers and notified them. */
  WORKER_MATCHED: "WORKER_MATCHED",
  JOB_ACCEPTED: "JOB_ACCEPTED",
  /** Sent to other offered workers once someone accepted (or the request was cancelled). */
  JOB_NO_LONGER_AVAILABLE: "JOB_NO_LONGER_AVAILABLE",
  WORKER_EN_ROUTE: "WORKER_EN_ROUTE",
  WORKER_ARRIVED: "WORKER_ARRIVED",
  JOB_STARTED: "JOB_STARTED",
  JOB_COMPLETED: "JOB_COMPLETED",
  JOB_CANCELLED: "JOB_CANCELLED",
  MESSAGE_RECEIVED: "MESSAGE_RECEIVED",
  RATING_SUBMITTED: "RATING_SUBMITTED",
  NOTIFICATION: "NOTIFICATION",
} as const;
export type RealtimeEventType = (typeof RealtimeEventType)[keyof typeof RealtimeEventType];

interface EventBase<T extends RealtimeEventType, D> {
  type: T;
  /** ISO timestamp. */
  at: string;
  data: D;
}

type RequestRef = { requestId: string; status: ServiceRequestStatus };
type JobRef = { jobId: string; requestId: string; status: JobStatus };

export type RealtimeEvent =
  | EventBase<"REQUEST_CREATED", RequestRef>
  | EventBase<"REQUEST_CANCELLED", RequestRef>
  | EventBase<"REQUEST_EXPIRED", RequestRef>
  | EventBase<"JOB_OFFERED", { offer: JobOfferDTO }>
  | EventBase<"WORKER_MATCHED", RequestRef & { notifiedWorkerCount: number }>
  | EventBase<"JOB_ACCEPTED", JobRef & { workerId: string }>
  | EventBase<"JOB_NO_LONGER_AVAILABLE", { requestId: string; offerId: string }>
  | EventBase<"WORKER_EN_ROUTE", JobRef>
  | EventBase<"WORKER_ARRIVED", JobRef>
  | EventBase<"JOB_STARTED", JobRef>
  | EventBase<"JOB_COMPLETED", JobRef>
  | EventBase<"JOB_CANCELLED", JobRef & { cancelledBy: "CUSTOMER" | "WORKER" | "ADMIN" }>
  | EventBase<"MESSAGE_RECEIVED", { jobId: string; message: JobMessageDTO }>
  | EventBase<"RATING_SUBMITTED", { jobId: string; workerId: string; score: number }>
  | EventBase<"NOTIFICATION", { notification: NotificationDTO }>;

/** Sent once when a realtime connection opens. */
export interface RealtimeHello {
  type: "CONNECTED";
  userId: string;
}
