import type {
  AvailabilityStatus,
  ConversationStatus,
  JobOfferStatus,
  JobStatus,
  QualificationLevel,
  SafetyStatus,
  SenderType,
  ServiceCategoryCode,
  ServiceRequestStatus,
  Urgency,
  UserRole,
  VerificationStatus,
} from "./enums";

/**
 * Wire formats returned by the API.
 *
 * Conventions:
 * - Timestamps are ISO-8601 strings (`2026-09-26T19:00:00.000Z`).
 * - Calendar dates are `YYYY-MM-DD`; times of day are 24h `HH:mm`, both in APP_TIMEZONE.
 * - Money is integer cents (`3500` = $35.00).
 * - Distances are miles.
 */

export interface UserDTO {
  id: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmergencyContact {
  name: string;
  phone: string;
  relationship?: string;
}

export interface AccessibilityPreferences {
  largeText?: boolean;
  highContrast?: boolean;
  voiceInput?: boolean;
  voiceResponses?: boolean;
  mobilityNotes?: string;
  hearingNotes?: string;
  visionNotes?: string;
}

export interface CommunicationPreferences {
  preferredChannel?: "IN_APP" | "PHONE" | "SMS";
  preferredLanguage?: string;
  notes?: string;
}

export interface CustomerProfileDTO {
  userId: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  accessibilityPreferences: AccessibilityPreferences;
  emergencyContact: EmergencyContact | null;
  communicationPreferences: CommunicationPreferences;
}

/** One weekly availability window, e.g. Mon 15:00–21:00. dayOfWeek: 0 = Sunday. */
export interface AvailabilitySlotDTO {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

export interface WorkerQualificationDTO {
  serviceCategoryId: ServiceCategoryCode;
  qualificationLevel: QualificationLevel;
}

/** Full worker profile — only returned to the worker themself and admins. */
export interface WorkerProfileDTO {
  userId: string;
  bio: string | null;
  rating: number;
  ratingCount: number;
  completedJobs: number;
  serviceRadius: number;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  availabilityStatus: AvailabilityStatus;
  verificationStatus: VerificationStatus;
  qualifications: WorkerQualificationDTO[];
  availability: AvailabilitySlotDTO[];
}

/** What a customer is allowed to see about a worker. */
export interface WorkerPublicDTO {
  id: string;
  firstName: string;
  /** Last initial only, e.g. "R." */
  lastInitial: string;
  displayName: string;
  bio: string | null;
  rating: number;
  ratingCount: number;
  completedJobs: number;
  verificationStatus: VerificationStatus;
  services: ServiceCategoryCode[];
}

/** What a worker is allowed to see about a customer. */
export interface CustomerPublicDTO {
  id: string;
  firstName: string;
  lastInitial: string;
  displayName: string;
}

export interface ServiceCategoryDTO {
  id: ServiceCategoryCode;
  name: string;
  description: string;
  requiresQualification: boolean;
  basePriceCents: number;
}

export interface ConversationMessageDTO {
  id: string;
  conversationId: string;
  senderType: SenderType;
  senderId: string | null;
  content: string;
  createdAt: string;
}

/** The request being assembled by the AI. Every field is optional until confirmed. */
export interface ServiceRequestDraft {
  serviceCategoryId?: ServiceCategoryCode | null;
  description?: string | null;
  location?: string | null;
  requestedDate?: string | null;
  requestedStartTime?: string | null;
  requestedEndTime?: string | null;
  urgency?: Urgency | null;
  specialRequirements?: string[] | null;
}

export interface ConversationDTO {
  id: string;
  customerId: string;
  status: ConversationStatus;
  draft: ServiceRequestDraft;
  missingInformation: string[];
  readyToSubmit: boolean;
  safetyStatus: SafetyStatus;
  /** Set once a ServiceRequest has been created from this conversation. */
  serviceRequestId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceRequestDTO {
  id: string;
  customerId: string;
  conversationId: string | null;
  serviceCategoryId: ServiceCategoryCode;
  description: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  requestedDate: string;
  requestedStartTime: string;
  requestedEndTime: string;
  urgency: Urgency;
  specialRequirements: string[];
  status: ServiceRequestStatus;
  estimatedPriceCents: number;
  platformFeeCents: number;
  /** Number of workers the request is currently offered to (pending offers). */
  pendingOfferCount: number;
  /** The active job, once a worker has accepted. */
  jobId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobDTO {
  id: string;
  requestId: string;
  workerId: string;
  status: JobStatus;
  acceptedAt: string | null;
  enRouteAt: string | null;
  arrivedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  finalPriceCents: number | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Job with everything a UI needs to render it. Customer address and contact
 * are only included for the assigned worker, the customer, and admins.
 */
export interface JobDetailDTO extends JobDTO {
  request: ServiceRequestDTO;
  worker: WorkerPublicDTO;
  customer: CustomerPublicDTO;
  /** Worker → customer distance in miles, when coordinates are known. */
  distanceMiles: number | null;
  rating: RatingDTO | null;
}

/** An open job shown on a worker's "Available Jobs Near You" list. */
export interface JobOfferDTO {
  id: string;
  requestId: string;
  workerId: string;
  status: JobOfferStatus;
  score: number;
  distanceMiles: number | null;
  serviceCategoryId: ServiceCategoryCode;
  serviceName: string;
  description: string;
  /** Approximate area only until accepted — the street address is withheld. */
  approximateLocation: string;
  requestedDate: string;
  requestedStartTime: string;
  requestedEndTime: string;
  urgency: Urgency;
  specialRequirements: string[];
  estimatedPayCents: number;
  customer: CustomerPublicDTO;
  createdAt: string;
}

export interface JobMessageDTO {
  id: string;
  jobId: string;
  senderId: string;
  senderRole: UserRole;
  senderName: string;
  content: string;
  createdAt: string;
}

export interface RatingDTO {
  id: string;
  jobId: string;
  customerId: string;
  workerId: string;
  score: number;
  comment: string | null;
  createdAt: string;
}

/** Row on the customer's history screen. */
export interface CustomerHistoryItemDTO {
  requestId: string;
  jobId: string | null;
  serviceCategoryId: ServiceCategoryCode;
  serviceName: string;
  description: string;
  requestedDate: string;
  requestedStartTime: string;
  requestStatus: ServiceRequestStatus;
  jobStatus: JobStatus | null;
  worker: WorkerPublicDTO | null;
  priceCents: number;
  rating: number | null;
  createdAt: string;
}

export interface WorkerEarningsDTO {
  totalEarnedCents: number;
  completedJobs: number;
  last7DaysCents: number;
  jobs: Array<{
    jobId: string;
    serviceName: string;
    completedAt: string;
    amountCents: number;
    ratingScore: number | null;
  }>;
}

export interface NotificationDTO {
  id: string;
  userId: string;
  type: string;
  /** Plain-language, safe to show or read aloud as-is. */
  title: string;
  body: string | null;
  data: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

export interface AdminStatsDTO {
  activeRequests: number;
  activeJobs: number;
  availableWorkers: number;
  completedToday: number;
  totalCustomers: number;
  totalWorkers: number;
}

export interface AdminCustomerDTO extends UserDTO {
  profile: CustomerProfileDTO | null;
  requestCount: number;
  openRequestCount: number;
}

export interface AdminWorkerDTO extends UserDTO {
  profile: WorkerProfileDTO;
  activeJobCount: number;
}
