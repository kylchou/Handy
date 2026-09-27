import { z } from "zod";
import {
  AVAILABILITY_STATUSES,
  JOB_STATUSES,
  QUALIFICATION_LEVELS,
  SERVICE_CATEGORY_CODES,
  SERVICE_REQUEST_STATUSES,
  URGENCIES,
  VERIFICATION_STATUSES,
} from "./enums";
import type {
  AdminCustomerDTO,
  AdminStatsDTO,
  AdminWorkerDTO,
  AutopilotStatusDTO,
  CaregiverInviteDTO,
  CaregiverLinkDTO,
  CaregiverPersonDTO,
  ConversationDTO,
  ConversationMessageDTO,
  ConversationSummaryDTO,
  CustomerHistoryItemDTO,
  CustomerProfileDTO,
  JobDetailDTO,
  JobMessageDTO,
  JobOfferDTO,
  NotificationDTO,
  PastWorkerDTO,
  RecurringScheduleDTO,
  RatingDTO,
  ServiceCategoryDTO,
  ServiceRequestDTO,
  UserDTO,
  WorkerEarningsDTO,
  WorkerProfileDTO,
  WorkerPublicDTO,
} from "./dto";
import type { WorkerMatchDTO } from "./matching";

/**
 * Request bodies are zod schemas so the API and the frontends validate the same
 * rules. Response types are plain interfaces. Every path is under /api/v1.
 */

export const API_PREFIX = "/api/v1";

// ---------- Errors ----------

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "VALIDATION_FAILED"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INVALID_TRANSITION"
  | "REQUEST_INCOMPLETE"
  | "POTENTIAL_EMERGENCY"
  | "JOB_NO_LONGER_AVAILABLE"
  | "SCHEDULE_CONFLICT"
  | "INVALID_ARRIVAL_CODE"
  | "TOO_MANY_ATTEMPTS"
  | "INVALID_INVITE"
  | "PRICE_CHANGED"
  | "RATE_LIMITED"
  | "SENSITIVE_INFO"
  | "INTERNAL_ERROR";

/** Body of every non-2xx response. */
export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    /** Plain-language message, safe to show to the user. */
    message: string;
    details?: unknown;
  };
}

// ---------- Shared field schemas ----------

export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:mm (24h)");
const serviceCategorySchema = z.enum(SERVICE_CATEGORY_CODES);

const emergencyContactSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().min(3).max(40),
  relationship: z.string().max(100).optional(),
});

const accessibilityPreferencesSchema = z.object({
  largeText: z.boolean().optional(),
  textSize: z.enum(["DEFAULT", "LARGE", "LARGEST"]).optional(),
  highContrast: z.boolean().optional(),
  voiceInput: z.boolean().optional(),
  voiceResponses: z.boolean().optional(),
  mobilityNotes: z.string().max(1000).optional(),
  hearingNotes: z.string().max(1000).optional(),
  visionNotes: z.string().max(1000).optional(),
});

const communicationPreferencesSchema = z.object({
  preferredChannel: z.enum(["IN_APP", "PHONE", "SMS"]).optional(),
  preferredLanguage: z.string().max(50).optional(),
  notes: z.string().max(1000).optional(),
});

// ---------- Auth ----------

export const signupSchema = z.object({
  role: z.enum(["CUSTOMER", "WORKER", "CAREGIVER"]),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  phone: z.string().trim().max(40).optional(),
  password: z.string().min(8).max(200),
  /** Optional starting location (customer home / worker base). */
  address: z.string().max(500).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});
export type SignupBody = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1),
});
export type LoginBody = z.infer<typeof loginSchema>;

export interface AuthResponse {
  /** Send as `Authorization: Bearer <token>`; for SSE/WebSocket use `?token=<token>`. */
  token: string;
  expiresAt: string;
  user: UserDTO;
}

export interface MeResponse {
  user: UserDTO;
  customerProfile: CustomerProfileDTO | null;
  workerProfile: WorkerProfileDTO | null;
}

// ---------- Users ----------

export const updateUserSchema = z.object({
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  phone: z.string().trim().max(40).nullable().optional(),
});
export type UpdateUserBody = z.infer<typeof updateUserSchema>;

// ---------- Customers ----------

export const updateCustomerProfileSchema = z.object({
  address: z.string().max(500).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  accessibilityPreferences: accessibilityPreferencesSchema.optional(),
  emergencyContact: emergencyContactSchema.nullable().optional(),
  communicationPreferences: communicationPreferencesSchema.optional(),
});
export type UpdateCustomerProfileBody = z.infer<typeof updateCustomerProfileSchema>;

// ---------- Workers ----------

export const updateWorkerProfileSchema = z.object({
  bio: z.string().max(2000).nullable().optional(),
  serviceRadius: z.number().positive().max(200).optional(),
  address: z.string().max(500).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
});
export type UpdateWorkerProfileBody = z.infer<typeof updateWorkerProfileSchema>;

export const updateQualificationsSchema = z.object({
  qualifications: z
    .array(
      z.object({
        serviceCategoryId: serviceCategorySchema,
        qualificationLevel: z.enum(QUALIFICATION_LEVELS).default("BASIC"),
      }),
    )
    .max(SERVICE_CATEGORY_CODES.length),
});
export type UpdateQualificationsBody = z.input<typeof updateQualificationsSchema>;

export const updateAvailabilitySchema = z.object({
  availabilityStatus: z.enum(AVAILABILITY_STATUSES).optional(),
  /** Replaces the whole weekly schedule when provided. */
  slots: z
    .array(
      z
        .object({
          dayOfWeek: z.number().int().min(0).max(6),
          startTime: timeSchema,
          endTime: timeSchema,
        })
        .refine((s) => s.startTime < s.endTime, "startTime must be before endTime"),
    )
    .max(50)
    .optional(),
});
export type UpdateAvailabilityBody = z.infer<typeof updateAvailabilitySchema>;

// ---------- AI conversations ----------

export interface CreateConversationResponse {
  conversation: ConversationDTO;
  /** The assistant's greeting ("What can we help you with?"). */
  messages: ConversationMessageDTO[];
}

export interface ConversationDetailResponse {
  conversation: ConversationDTO;
  messages: ConversationMessageDTO[];
}

export const sendConversationMessageSchema = z.object({
  content: z.string().trim().min(1).max(4000),
});
export type SendConversationMessageBody = z.infer<typeof sendConversationMessageSchema>;

export interface SendConversationMessageResponse {
  userMessage: ConversationMessageDTO;
  assistantMessage: ConversationMessageDTO;
  conversation: ConversationDTO;
  /** Present when safetyStatus is POTENTIAL_EMERGENCY. Show prominently. */
  emergency: EmergencyGuidance | null;
}

export interface EmergencyGuidance {
  message: string;
  callNumber: string;
}

// ---------- Service requests ----------

/**
 * Confirm the conversation's draft and submit it. Any field provided here
 * overrides the draft (this is how the confirmation card's "Edit" works).
 */
export const createServiceRequestSchema = z.object({
  conversationId: z.string().uuid(),
  serviceCategoryId: serviceCategorySchema.optional(),
  description: z.string().trim().min(1).max(2000).optional(),
  location: z.string().trim().min(1).max(500).optional(),
  requestedDate: dateSchema.optional(),
  requestedStartTime: timeSchema.optional(),
  requestedEndTime: timeSchema.optional(),
  urgency: z.enum(URGENCIES).optional(),
  specialRequirements: z.array(z.string().max(500)).max(20).optional(),
  /** Ask this worker first (e.g. someone from GET /customers/me/past-workers). */
  preferredWorkerId: z.string().uuid().nullable().optional(),
  /** Make it repeat on the same day and time. */
  repeat: z.enum(["WEEKLY", "BIWEEKLY"]).nullable().optional(),
  /**
   * The total the customer agreed to on the confirmation card. If the price
   * works out different when submitting, it's refused with PRICE_CHANGED so
   * they never pay something they didn't see.
   */
  agreedTotalCents: z.number().int().nonnegative().optional(),
});
export type CreateServiceRequestBody = z.infer<typeof createServiceRequestSchema>;

export interface CreateServiceRequestResponse {
  request: ServiceRequestDTO;
  /** How many qualified workers were notified. 0 means we are still looking. */
  notifiedWorkerCount: number;
}

export const listRequestsQuerySchema = z.object({
  status: z.enum(SERVICE_REQUEST_STATUSES).optional(),
});

export interface RequestMatchesResponse {
  requestId: string;
  matches: WorkerMatchDTO[];
}

// ---------- Jobs ----------

export const updateJobStatusSchema = z.object({
  status: z.enum(JOB_STATUSES),
  reason: z.string().max(500).optional(),
  /** Required when a worker moves the job to ARRIVED. */
  arrivalCode: z.string().regex(/^\d{4}$/, "The code is 4 digits").optional(),
});
export type UpdateJobStatusBody = z.infer<typeof updateJobStatusSchema>;

export const listJobsQuerySchema = z.object({
  status: z.enum(JOB_STATUSES).optional(),
});

export const sendJobMessageSchema = z.object({
  content: z.string().trim().min(1).max(4000),
});
export type SendJobMessageBody = z.infer<typeof sendJobMessageSchema>;

// ---------- Ratings ----------

export const createRatingSchema = z.object({
  score: z.number().int().min(1).max(5),
  comment: z.string().trim().max(2000).optional(),
});
export type CreateRatingBody = z.infer<typeof createRatingSchema>;

// ---------- Caregivers ----------

export const acceptCaregiverInviteSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{6}$/, "The invite code is 6 letters and numbers"),
});
export type AcceptCaregiverInviteBody = z.input<typeof acceptCaregiverInviteSchema>;

// ---------- Admin ----------

export const updateVerificationSchema = z.object({
  verificationStatus: z.enum(VERIFICATION_STATUSES),
});
export type UpdateVerificationBody = z.infer<typeof updateVerificationSchema>;

export const setAutopilotSchema = z.object({
  enabled: z.boolean(),
  /** Seconds between each step (accept, on the way, arrived, started, done). */
  stepSeconds: z.number().int().min(2).max(60).optional(),
  /** Accept new requests but keep them at "accepted" until this is set back to false. Gives the presenter time to talk. */
  hold: z.boolean().optional(),
});
export type SetAutopilotBody = z.input<typeof setAutopilotSchema>;

// ---------- Response type map ----------

/** Response bodies by endpoint, for typed API clients. */
export interface ApiResponses {
  "POST /auth/signup": AuthResponse;
  "POST /auth/login": AuthResponse;
  "POST /auth/logout": void;
  "GET /auth/me": MeResponse;
  "PATCH /users/me": UserDTO;
  "GET /service-categories": ServiceCategoryDTO[];
  "GET /customers/me/profile": CustomerProfileDTO;
  "PUT /customers/me/profile": CustomerProfileDTO;
  "GET /customers/me/history": CustomerHistoryItemDTO[];
  "GET /customers/me/past-workers": PastWorkerDTO[];
  "GET /customers/me/schedules": RecurringScheduleDTO[];
  "DELETE /customers/me/schedules/:scheduleId": RecurringScheduleDTO;
  "GET /workers/me/profile": WorkerProfileDTO;
  "PUT /workers/me/profile": WorkerProfileDTO;
  "PUT /workers/me/qualifications": WorkerProfileDTO;
  "PUT /workers/me/availability": WorkerProfileDTO;
  "GET /workers/me/earnings": WorkerEarningsDTO;
  "GET /workers/:workerId": WorkerPublicDTO;
  "GET /workers/:workerId/ratings": RatingDTO[];
  "GET /ai/conversations": ConversationSummaryDTO[];
  "POST /ai/conversations": CreateConversationResponse;
  "GET /ai/conversations/:conversationId": ConversationDetailResponse;
  "POST /ai/conversations/:conversationId/messages": SendConversationMessageResponse;
  "POST /requests": CreateServiceRequestResponse;
  "GET /requests": ServiceRequestDTO[];
  "GET /requests/:requestId": ServiceRequestDTO;
  "POST /requests/:requestId/cancel": ServiceRequestDTO;
  "GET /requests/:requestId/matches": RequestMatchesResponse;
  "GET /jobs/available": JobOfferDTO[];
  "POST /jobs/offers/:offerId/accept": JobDetailDTO;
  "POST /jobs/offers/:offerId/decline": JobOfferDTO;
  "GET /jobs": JobDetailDTO[];
  "GET /jobs/:jobId": JobDetailDTO;
  "PATCH /jobs/:jobId/status": JobDetailDTO;
  "GET /jobs/:jobId/messages": JobMessageDTO[];
  "POST /jobs/:jobId/messages": JobMessageDTO;
  "POST /jobs/:jobId/rating": RatingDTO;
  "GET /notifications": NotificationDTO[];
  "POST /notifications/:notificationId/read": NotificationDTO;
  "POST /notifications/read-all": { updated: number };
  "GET /admin/stats": AdminStatsDTO;
  "GET /admin/requests": ServiceRequestDTO[];
  "GET /admin/jobs": JobDetailDTO[];
  "GET /admin/workers": AdminWorkerDTO[];
  "GET /admin/customers": AdminCustomerDTO[];
  "PATCH /admin/workers/:workerId/verification": WorkerProfileDTO;
  "POST /admin/demo/reset": { ok: true };
  "GET /admin/demo/autopilot": AutopilotStatusDTO;
  "PUT /admin/demo/autopilot": AutopilotStatusDTO;
  "POST /customers/me/caregivers/invite": CaregiverInviteDTO;
  "GET /customers/me/caregivers": CaregiverLinkDTO[];
  "DELETE /customers/me/caregivers/:caregiverId": void;
  "POST /caregivers/me/links": CaregiverPersonDTO;
  "GET /caregivers/me/people": CaregiverPersonDTO[];
  "DELETE /caregivers/me/people/:customerId": void;
}
