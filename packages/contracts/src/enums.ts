/**
 * Shared enumerations. Each is exported both as a const object (for runtime use,
 * e.g. `JobStatus.EN_ROUTE`) and as a string-union type of the same name.
 */

function values<T extends Record<string, string>>(obj: T) {
  return Object.values(obj) as [T[keyof T], ...T[keyof T][]];
}

export const UserRole = {
  CUSTOMER: "CUSTOMER",
  WORKER: "WORKER",
  /** A family member or caregiver linked to one or more customers (read-only). */
  CAREGIVER: "CAREGIVER",
  ADMIN: "ADMIN",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];
export const USER_ROLES = values(UserRole);

/** Service categories. The code doubles as the ServiceCategory id. */
export const ServiceCategoryCode = {
  HOME_MAINTENANCE: "HOME_MAINTENANCE",
  CLEANING: "CLEANING",
  LAWN_CARE: "LAWN_CARE",
  ERRANDS: "ERRANDS",
  TRANSPORTATION: "TRANSPORTATION",
  PET_ASSISTANCE: "PET_ASSISTANCE",
  TECH_SUPPORT: "TECH_SUPPORT",
  COMPANIONSHIP: "COMPANIONSHIP",
  MOVING_ASSISTANCE: "MOVING_ASSISTANCE",
} as const;
export type ServiceCategoryCode = (typeof ServiceCategoryCode)[keyof typeof ServiceCategoryCode];
export const SERVICE_CATEGORY_CODES = values(ServiceCategoryCode);

export const ServiceRequestStatus = {
  /** Confirmed by the customer; offers are out to workers. */
  SEARCHING: "SEARCHING",
  /** A worker accepted; a Job exists. */
  MATCHED: "MATCHED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
  /** Nobody accepted before the requested time window ended. */
  EXPIRED: "EXPIRED",
} as const;
export type ServiceRequestStatus = (typeof ServiceRequestStatus)[keyof typeof ServiceRequestStatus];
export const SERVICE_REQUEST_STATUSES = values(ServiceRequestStatus);

/**
 * Job lifecycle. A Job row is created when a worker accepts, so persisted jobs
 * start at ACCEPTED; SEARCHING and MATCHED exist so a UI can render the full
 * customer timeline from a single enum.
 */
export const JobStatus = {
  SEARCHING: "SEARCHING",
  MATCHED: "MATCHED",
  ACCEPTED: "ACCEPTED",
  EN_ROUTE: "EN_ROUTE",
  ARRIVED: "ARRIVED",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
} as const;
export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];
export const JOB_STATUSES = values(JobStatus);

export const JobOfferStatus = {
  PENDING: "PENDING",
  ACCEPTED: "ACCEPTED",
  DECLINED: "DECLINED",
  /** Another worker accepted first, or the request was cancelled. */
  WITHDRAWN: "WITHDRAWN",
  /** The worker didn't respond in time. */
  EXPIRED: "EXPIRED",
} as const;
export type JobOfferStatus = (typeof JobOfferStatus)[keyof typeof JobOfferStatus];
export const JOB_OFFER_STATUSES = values(JobOfferStatus);

export const Urgency = {
  LOW: "LOW",
  NORMAL: "NORMAL",
  HIGH: "HIGH",
} as const;
export type Urgency = (typeof Urgency)[keyof typeof Urgency];
export const URGENCIES = values(Urgency);

export const SafetyStatus = {
  NORMAL_SERVICE: "NORMAL_SERVICE",
  NEEDS_CLARIFICATION: "NEEDS_CLARIFICATION",
  UNSUPPORTED_SERVICE: "UNSUPPORTED_SERVICE",
  POTENTIAL_EMERGENCY: "POTENTIAL_EMERGENCY",
} as const;
export type SafetyStatus = (typeof SafetyStatus)[keyof typeof SafetyStatus];
export const SAFETY_STATUSES = values(SafetyStatus);

export const ConversationStatus = {
  ACTIVE: "ACTIVE",
  /** A ServiceRequest was created from this conversation. */
  SUBMITTED: "SUBMITTED",
  ABANDONED: "ABANDONED",
} as const;
export type ConversationStatus = (typeof ConversationStatus)[keyof typeof ConversationStatus];
export const CONVERSATION_STATUSES = values(ConversationStatus);

export const SenderType = {
  CUSTOMER: "CUSTOMER",
  AI: "AI",
  SYSTEM: "SYSTEM",
} as const;
export type SenderType = (typeof SenderType)[keyof typeof SenderType];
export const SENDER_TYPES = values(SenderType);

export const AvailabilityStatus = {
  AVAILABLE: "AVAILABLE",
  BUSY: "BUSY",
  OFFLINE: "OFFLINE",
} as const;
export type AvailabilityStatus = (typeof AvailabilityStatus)[keyof typeof AvailabilityStatus];
export const AVAILABILITY_STATUSES = values(AvailabilityStatus);

export const VerificationStatus = {
  UNVERIFIED: "UNVERIFIED",
  PENDING: "PENDING",
  VERIFIED: "VERIFIED",
  REJECTED: "REJECTED",
} as const;
export type VerificationStatus = (typeof VerificationStatus)[keyof typeof VerificationStatus];
export const VERIFICATION_STATUSES = values(VerificationStatus);

export const QualificationLevel = {
  BASIC: "BASIC",
  EXPERIENCED: "EXPERIENCED",
  CERTIFIED: "CERTIFIED",
} as const;
export type QualificationLevel = (typeof QualificationLevel)[keyof typeof QualificationLevel];
export const QUALIFICATION_LEVELS = values(QualificationLevel);
