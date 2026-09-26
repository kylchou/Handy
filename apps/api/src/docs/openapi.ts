import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  API_PREFIX,
  JOB_STATUSES,
  SERVICE_REQUEST_STATUSES,
  acceptCaregiverInviteSchema,
  createRatingSchema,
  createServiceRequestSchema,
  loginSchema,
  sendConversationMessageSchema,
  sendJobMessageSchema,
  signupSchema,
  updateAvailabilitySchema,
  updateCustomerProfileSchema,
  updateJobStatusSchema,
  updateQualificationsSchema,
  updateUserSchema,
  setAutopilotSchema,
  updateVerificationSchema,
  updateWorkerProfileSchema,
  type ApiResponses,
} from "@handy/contracts";

interface RouteDoc {
  tag: string;
  summary: string;
  /** Name of the response type in @handy/contracts. */
  returns: string;
  /** Who can call it; "public" means no token needed. */
  who: "public" | "any" | "customer" | "worker" | "caregiver" | "admin" | string;
  body?: z.ZodType;
  query?: Record<string, { enum?: readonly string[]; description: string }>;
  status?: number;
  notes?: string;
}

const statusQuery = (values: readonly string[]) => ({ status: { enum: values, description: "Only return this status" } });

/**
 * Docs for every endpoint. Typed against ApiResponses, so a new endpoint won't
 * compile until it's documented here.
 */
const ROUTE_DOCS: Record<keyof ApiResponses, RouteDoc> = {
  "POST /auth/signup": { tag: "Auth", summary: "Create an account", returns: "AuthResponse", who: "public", body: signupSchema, status: 201, notes: "New workers start PENDING verification. Caregivers link to someone with an invite code afterwards." },
  "POST /auth/login": { tag: "Auth", summary: "Log in", returns: "AuthResponse", who: "public", body: loginSchema, notes: "Limited to 10 tries per 15 minutes per IP + email." },
  "POST /auth/logout": { tag: "Auth", summary: "Log out (revokes the token)", returns: "nothing (204)", who: "any", status: 204 },
  "GET /auth/me": { tag: "Auth", summary: "The logged-in user and their profile", returns: "MeResponse", who: "any" },
  "PATCH /users/me": { tag: "Auth", summary: "Update name or phone", returns: "UserDTO", who: "any", body: updateUserSchema },
  "GET /service-categories": { tag: "Auth", summary: "List service categories", returns: "ServiceCategoryDTO[]", who: "public" },

  "GET /customers/me/profile": { tag: "Customers", summary: "Get my profile", returns: "CustomerProfileDTO", who: "customer" },
  "PUT /customers/me/profile": { tag: "Customers", summary: "Update my profile", returns: "CustomerProfileDTO", who: "customer", body: updateCustomerProfileSchema },
  "GET /customers/me/history": { tag: "Customers", summary: "Everything for the history screen", returns: "CustomerHistoryItemDTO[]", who: "customer" },
  "GET /customers/me/schedules": { tag: "Customers", summary: "My repeating requests", returns: "RecurringScheduleDTO[]", who: "customer", notes: "Create one by sending repeat: \"WEEKLY\" or \"BIWEEKLY\" with POST /requests." },
  "DELETE /customers/me/schedules/:scheduleId": { tag: "Customers", summary: "Stop a repeating request", returns: "RecurringScheduleDTO", who: "customer", notes: "Visits that were already booked stay booked." },
  "GET /customers/me/past-workers": { tag: "Customers", summary: "People who've helped me before", returns: "PastWorkerDTO[]", who: "customer", notes: "For a \"Book James again\" button: pass the worker's id as preferredWorkerId when creating a request." },

  "POST /customers/me/caregivers/invite": { tag: "Caregivers", summary: "Make an invite code for a family member", returns: "CaregiverInviteDTO", who: "customer", status: 201, notes: "6 characters, good for 24 hours, works once." },
  "GET /customers/me/caregivers": { tag: "Caregivers", summary: "Who's linked to me", returns: "CaregiverLinkDTO[]", who: "customer" },
  "DELETE /customers/me/caregivers/:caregiverId": { tag: "Caregivers", summary: "Remove a caregiver", returns: "nothing (204)", who: "customer", status: 204 },
  "POST /caregivers/me/links": { tag: "Caregivers", summary: "Link to someone with their invite code", returns: "CaregiverPersonDTO", who: "caregiver", body: acceptCaregiverInviteSchema, status: 201 },
  "GET /caregivers/me/people": { tag: "Caregivers", summary: "Caregiver dashboard", returns: "CaregiverPersonDTO[]", who: "caregiver", notes: "Active jobs, open requests and recent history for each linked person. Never includes arrival codes." },
  "DELETE /caregivers/me/people/:customerId": { tag: "Caregivers", summary: "Unlink myself", returns: "nothing (204)", who: "caregiver", status: 204 },

  "POST /ai/conversations": { tag: "AI chat", summary: "Start a conversation", returns: "CreateConversationResponse", who: "customer", status: 201 },
  "GET /ai/conversations/:conversationId": { tag: "AI chat", summary: "Conversation, draft and messages", returns: "ConversationDetailResponse", who: "customer, admin" },
  "POST /ai/conversations/:conversationId/messages": { tag: "AI chat", summary: "Send a message to the assistant", returns: "SendConversationMessageResponse", who: "customer", body: sendConversationMessageSchema, notes: "When conversation.readyToSubmit is true, show the confirmation card. If emergency is set, show it prominently. Limited to 20 per minute." },

  "POST /requests": { tag: "Requests", summary: "Confirm Request", returns: "CreateServiceRequestResponse", who: "customer", body: createServiceRequestSchema, status: 201, notes: "Any fields sent override the AI's draft (that's how Edit works). 422 REQUEST_INCOMPLETE or POTENTIAL_EMERGENCY if it can't go through." },
  "GET /requests": { tag: "Requests", summary: "List requests", returns: "ServiceRequestDTO[]", who: "customer, admin", query: statusQuery(SERVICE_REQUEST_STATUSES) },
  "GET /requests/:requestId": { tag: "Requests", summary: "Get a request", returns: "ServiceRequestDTO", who: "customer, assigned worker, admin" },
  "POST /requests/:requestId/cancel": { tag: "Requests", summary: "Cancel while still searching", returns: "ServiceRequestDTO", who: "customer, admin" },
  "GET /requests/:requestId/matches": { tag: "Requests", summary: "Ranked workers with scores and reasons", returns: "RequestMatchesResponse", who: "customer, admin" },

  "GET /jobs/available": { tag: "Jobs", summary: "Jobs offered to me", returns: "JobOfferDTO[]", who: "worker", notes: "Shows a general area only; the full address comes after accepting. Offers expire (see expiresAt)." },
  "POST /jobs/offers/:offerId/accept": { tag: "Jobs", summary: "Accept a job", returns: "JobDetailDTO", who: "worker", notes: "First to accept wins; others get 409 JOB_NO_LONGER_AVAILABLE. 409 SCHEDULE_CONFLICT if it overlaps another job." },
  "POST /jobs/offers/:offerId/decline": { tag: "Jobs", summary: "Decline a job", returns: "JobOfferDTO", who: "worker" },
  "GET /jobs": { tag: "Jobs", summary: "My jobs (admins get all)", returns: "JobDetailDTO[]", who: "customer, worker, admin", query: statusQuery(JOB_STATUSES) },
  "GET /jobs/:jobId": { tag: "Jobs", summary: "Get a job", returns: "JobDetailDTO", who: "the job's customer or worker, admin", notes: "arrivalCode is only included for the customer and admins." },
  "PATCH /jobs/:jobId/status": { tag: "Jobs", summary: "Move a job to its next status", returns: "JobDetailDTO", who: "the job's customer or worker, admin", body: updateJobStatusSchema, notes: "ACCEPTED -> EN_ROUTE -> ARRIVED -> IN_PROGRESS -> COMPLETED. Workers need the customer's arrivalCode to mark ARRIVED." },
  "GET /jobs/:jobId/messages": { tag: "Jobs", summary: "Chat messages", returns: "JobMessageDTO[]", who: "the job's customer or worker, admin" },
  "POST /jobs/:jobId/messages": { tag: "Jobs", summary: "Send a chat message", returns: "JobMessageDTO", who: "the job's customer or worker", body: sendJobMessageSchema, status: 201 },
  "POST /jobs/:jobId/rating": { tag: "Jobs", summary: "Rate a completed job", returns: "RatingDTO", who: "the job's customer", body: createRatingSchema, status: 201 },

  "GET /workers/me/profile": { tag: "Workers", summary: "Get my profile", returns: "WorkerProfileDTO", who: "worker" },
  "PUT /workers/me/profile": { tag: "Workers", summary: "Update my profile", returns: "WorkerProfileDTO", who: "worker", body: updateWorkerProfileSchema },
  "PUT /workers/me/qualifications": { tag: "Workers", summary: "Replace my services", returns: "WorkerProfileDTO", who: "worker", body: updateQualificationsSchema },
  "PUT /workers/me/availability": { tag: "Workers", summary: "Set my status and weekly schedule", returns: "WorkerProfileDTO", who: "worker", body: updateAvailabilitySchema },
  "GET /workers/me/earnings": { tag: "Workers", summary: "My earnings", returns: "WorkerEarningsDTO", who: "worker" },
  "GET /workers/:workerId": { tag: "Workers", summary: "A worker's public profile", returns: "WorkerPublicDTO", who: "any" },
  "GET /workers/:workerId/ratings": { tag: "Workers", summary: "A worker's ratings", returns: "RatingDTO[]", who: "any" },

  "GET /notifications": { tag: "Notifications", summary: "My latest 50 notifications", returns: "NotificationDTO[]", who: "any", query: { unread: { enum: ["true"], description: "Only unread" } } },
  "POST /notifications/:notificationId/read": { tag: "Notifications", summary: "Mark one as read", returns: "NotificationDTO", who: "any" },
  "POST /notifications/read-all": { tag: "Notifications", summary: "Mark all as read", returns: "{ updated: number }", who: "any" },

  "GET /admin/stats": { tag: "Admin", summary: "Dashboard numbers", returns: "AdminStatsDTO", who: "admin" },
  "GET /admin/requests": { tag: "Admin", summary: "All requests", returns: "ServiceRequestDTO[]", who: "admin", query: statusQuery(SERVICE_REQUEST_STATUSES) },
  "GET /admin/jobs": { tag: "Admin", summary: "All jobs", returns: "JobDetailDTO[]", who: "admin", query: statusQuery(JOB_STATUSES) },
  "GET /admin/workers": { tag: "Admin", summary: "All workers", returns: "AdminWorkerDTO[]", who: "admin" },
  "GET /admin/customers": { tag: "Admin", summary: "All customers", returns: "AdminCustomerDTO[]", who: "admin" },
  "PATCH /admin/workers/:workerId/verification": { tag: "Admin", summary: "Verify (or un-verify) a worker", returns: "WorkerProfileDTO", who: "admin", body: updateVerificationSchema, notes: "Only VERIFIED workers get job offers." },
  "POST /admin/demo/reset": { tag: "Admin", summary: "Reset to the starting demo data", returns: "{ ok: true }", who: "admin", notes: "Nobody gets logged out. Off in production unless ALLOW_DEMO_RESET=true." },
  "GET /admin/demo/autopilot": { tag: "Admin", summary: "Is the demo autopilot on", returns: "AutopilotStatusDTO", who: "admin" },
  "PUT /admin/demo/autopilot": { tag: "Admin", summary: "Turn the demo autopilot on or off", returns: "AutopilotStatusDTO", who: "admin", body: setAutopilotSchema, notes: "While on, new requests get accepted by the best matched worker and moved to done one step every stepSeconds (default 8). With hold: true, accepted jobs wait until hold is set back to false. Off in production unless ALLOW_DEMO_RESET=true." },
};

const TAGS = ["Auth", "AI chat", "Requests", "Jobs", "Customers", "Caregivers", "Workers", "Notifications", "Admin", "Realtime"];

function toJsonSchema(schema: z.ZodType) {
  return z.toJSONSchema(schema, { io: "input", target: "openapi-3.0" }) as Record<string, unknown>;
}

function buildSchema(doc: RouteDoc) {
  const status = doc.status ?? 200;
  return {
    tags: [doc.tag],
    summary: doc.summary,
    description: [`**Who:** ${doc.who}`, `**Returns:** \`${doc.returns}\` (from @handy/contracts)`, doc.notes].filter(Boolean).join("\n\n"),
    ...(doc.who !== "public" && { security: [{ bearerAuth: [] }] }),
    ...(doc.body && { body: toJsonSchema(doc.body) }),
    ...(doc.query && {
      querystring: {
        type: "object",
        properties: Object.fromEntries(
          Object.entries(doc.query).map(([k, v]) => [k, { type: "string", description: v.description, ...(v.enum && { enum: v.enum }) }]),
        ),
      },
    }),
    response: {
      [status]: { description: doc.returns === "nothing (204)" ? "No content" : `\`${doc.returns}\`` },
      default: { description: "Error: `{ error: { code, message, details? } }`" },
    },
  };
}

/**
 * Serves interactive API docs at /docs (spec at /docs/json). Must be called
 * before any routes are registered. Schemas here are for documentation only;
 * requests are still validated by the zod schemas inside each route.
 */
export async function registerApiDocs(app: FastifyInstance) {
  // Docs-only schemas: never let Fastify validate or reshape anything with them.
  app.setValidatorCompiler(() => () => true);
  app.setSerializerCompiler(() => (data) => JSON.stringify(data));

  app.addHook("onRoute", (route) => {
    if (!route.url.startsWith(API_PREFIX)) {
      route.schema = { ...route.schema, hide: true };
      return;
    }
    const path = route.url.slice(API_PREFIX.length);
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    const doc = ROUTE_DOCS[`${methods[0]} ${path}` as keyof ApiResponses];
    if (doc) route.schema = buildSchema(doc);
    else if (path === "/events") {
      route.schema = {
        tags: ["Realtime"],
        summary: "Live events (Server-Sent Events)",
        description:
          "Open with `new EventSource(url + '?token=...')`. Each message is a JSON `RealtimeMessage`. Reconnecting with Last-Event-ID replays anything missed. Easier: `api.realtime.subscribe()` from the API client.",
        querystring: { type: "object", properties: { token: { type: "string" }, lastEventId: { type: "string" } }, required: ["token"] },
      };
    } else route.schema = { ...route.schema, hide: true }; // e.g. the WebSocket endpoint
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: "Handy API",
        version: "1.0.0",
        description:
          "Backend for Handy. Log in with `POST /auth/login` (demo password `password123`), copy the token, and click Authorize. " +
          "Types are in `@handy/contracts`, and there's a typed client (`createApiClient`) so you don't need to write fetch calls. More detail in docs/api.md.",
      },
      servers: [{ url: "/" }],
      tags: TAGS.map((name) => ({ name })),
      components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } } },
    },
  });
  await app.register(swaggerUi, { routePrefix: "/docs", uiConfig: { persistAuthorization: true, docExpansion: "list" } });
}
