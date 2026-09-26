/**
 * These types mirror the shared contract that will live in
 * `/packages/contracts` (owned by Engineer 2 / backend).
 *
 * IMPORTANT: this file is a local stand-in so the customer app can be
 * built and typed independently. Once `/packages/contracts` exists in
 * the monorepo, delete this file and import from there instead, e.g.
 *   import type { ServiceRequestDTO } from "@senior-services/contracts";
 * Do not fork these shapes — if a field is missing, ask Engineer 2 to
 * add it to the real contract rather than inventing it here.
 */

export type UserRole = "CUSTOMER" | "WORKER" | "ADMIN";

export interface UserDTO {
  id: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

export interface CustomerProfileDTO {
  userId: string;
  address: string;
  latitude?: number;
  longitude?: number;
  accessibilityPreferences?: string;
  emergencyContact?: string;
  communicationPreferences?: string;
}

export type ServiceCategory =
  | "HOME_MAINTENANCE"
  | "CLEANING"
  | "LAWN_CARE"
  | "ERRANDS"
  | "TRANSPORTATION"
  | "PET_ASSISTANCE"
  | "TECH_SUPPORT"
  | "COMPANIONSHIP"
  | "MOVING_ASSISTANCE"
  | "PLUMBING"
  | "OTHER";

export type Urgency = "LOW" | "NORMAL" | "HIGH";

export type SafetyStatus =
  | "NORMAL_SERVICE"
  | "NEEDS_CLARIFICATION"
  | "UNSUPPORTED_SERVICE"
  | "POTENTIAL_EMERGENCY";

export type ServiceRequestStatus =
  | "DRAFT"
  | "SEARCHING"
  | "MATCHED"
  | "ACCEPTED"
  | "CANCELLED";

export type JobStatus =
  | "SEARCHING"
  | "MATCHED"
  | "ACCEPTED"
  | "EN_ROUTE"
  | "ARRIVED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

export interface ServiceRequestDTO {
  id: string;
  customerId: string;
  conversationId: string;
  serviceCategoryId: ServiceCategory;
  description: string;
  location: string;
  latitude?: number;
  longitude?: number;
  requestedDate: string; // ISO date, e.g. "2026-09-27"
  requestedStartTime: string; // "15:00"
  requestedEndTime: string; // "16:00"
  urgency: Urgency;
  status: ServiceRequestStatus;
  estimatedPrice?: number;
  specialRequirements?: string;
}

export interface WorkerSummaryDTO {
  id: string;
  firstName: string;
  lastName: string;
  rating: number;
  completedJobs: number;
  distanceMiles: number;
}

export interface JobDTO {
  id: string;
  requestId: string;
  worker?: WorkerSummaryDTO;
  status: JobStatus;
  finalPrice?: number;
  createdAt: string;
  acceptedAt?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface JobMessageDTO {
  id: string;
  jobId: string;
  senderId: string;
  senderType: "CUSTOMER" | "WORKER";
  content: string;
  createdAt: string;
}

export interface RatingDTO {
  jobId: string;
  score: number; // 1-5
  comment?: string;
}

export type ChatSenderType = "CUSTOMER" | "AI";

export interface ConversationMessageDTO {
  id: string;
  conversationId: string;
  senderType: ChatSenderType;
  content: string;
  createdAt: string;
}

/** Response from POST /api/v1/ai/conversations/:conversationId/messages */
export interface AIResponse {
  conversationId: string;
  message: string;
  extractedData: Partial<ServiceRequestDTO>;
  missingInformation: string[];
  readyToSubmit: boolean;
  safetyStatus: SafetyStatus;
}

export interface HistoryEntryDTO {
  jobId: string;
  serviceCategoryId: ServiceCategory;
  workerName: string;
  date: string;
  status: JobStatus;
  price: number;
  rating?: number;
}

/** Realtime events the backend publishes; the frontend subscribes to these. */
export type ServerEventType =
  | "REQUEST_CREATED"
  | "WORKER_MATCHED"
  | "JOB_ACCEPTED"
  | "WORKER_EN_ROUTE"
  | "WORKER_ARRIVED"
  | "JOB_COMPLETED"
  | "MESSAGE_RECEIVED";

export interface ServerEvent<T = unknown> {
  type: ServerEventType;
  jobId?: string;
  requestId?: string;
  payload: T;
}
