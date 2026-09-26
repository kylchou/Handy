import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type {
  AccessibilityPreferences,
  AvailabilityStatus,
  CommunicationPreferences,
  ConversationStatus,
  EmergencyContact,
  JobOfferStatus,
  JobStatus,
  QualificationLevel,
  SafetyStatus,
  SenderType,
  ServiceCategoryCode,
  ServiceRequestDraft,
  ServiceRequestStatus,
  Urgency,
  UserRole,
  VerificationStatus,
} from "@handy/contracts";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const ts = (name: string) => timestamp(name, { withTimezone: true });

export const users = pgTable("users", {
  id: id(),
  role: text("role").$type<UserRole>().notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  passwordHash: text("password_hash").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const customerProfiles = pgTable("customer_profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  address: text("address"),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  accessibilityPreferences: jsonb("accessibility_preferences").$type<AccessibilityPreferences>().notNull().default({}),
  emergencyContact: jsonb("emergency_contact").$type<EmergencyContact | null>(),
  communicationPreferences: jsonb("communication_preferences").$type<CommunicationPreferences>().notNull().default({}),
});

export const workerProfiles = pgTable("worker_profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  bio: text("bio"),
  rating: doublePrecision("rating").notNull().default(0),
  ratingCount: integer("rating_count").notNull().default(0),
  completedJobs: integer("completed_jobs").notNull().default(0),
  serviceRadius: doublePrecision("service_radius").notNull().default(15),
  address: text("address"),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  availabilityStatus: text("availability_status").$type<AvailabilityStatus>().notNull().default("AVAILABLE"),
  verificationStatus: text("verification_status").$type<VerificationStatus>().notNull().default("PENDING"),
});

export const serviceCategories = pgTable("service_categories", {
  id: text("id").$type<ServiceCategoryCode>().primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  requiresQualification: boolean("requires_qualification").notNull().default(true),
  basePriceCents: integer("base_price_cents").notNull(),
});

export const workerQualifications = pgTable(
  "worker_qualifications",
  {
    workerId: uuid("worker_id")
      .notNull()
      .references(() => workerProfiles.userId, { onDelete: "cascade" }),
    serviceCategoryId: text("service_category_id")
      .$type<ServiceCategoryCode>()
      .notNull()
      .references(() => serviceCategories.id),
    qualificationLevel: text("qualification_level").$type<QualificationLevel>().notNull().default("BASIC"),
  },
  (t) => [primaryKey({ columns: [t.workerId, t.serviceCategoryId] }), index("worker_qualifications_category_idx").on(t.serviceCategoryId)],
);

/** Weekly availability windows. dayOfWeek: 0 = Sunday. Times are HH:mm. */
export const workerAvailability = pgTable(
  "worker_availability",
  {
    id: id(),
    workerId: uuid("worker_id")
      .notNull()
      .references(() => workerProfiles.userId, { onDelete: "cascade" }),
    dayOfWeek: integer("day_of_week").notNull(),
    startTime: text("start_time").notNull(),
    endTime: text("end_time").notNull(),
  },
  (t) => [index("worker_availability_worker_idx").on(t.workerId)],
);

export const conversations = pgTable(
  "conversations",
  {
    id: id(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status").$type<ConversationStatus>().notNull().default("ACTIVE"),
    draft: jsonb("draft").$type<ServiceRequestDraft>().notNull().default({}),
    missingInformation: jsonb("missing_information").$type<string[]>().notNull().default([]),
    readyToSubmit: boolean("ready_to_submit").notNull().default(false),
    safetyStatus: text("safety_status").$type<SafetyStatus>().notNull().default("NEEDS_CLARIFICATION"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("conversations_customer_idx").on(t.customerId)],
);

/** Messages in an AI conversation (customer ↔ assistant). */
export const messages = pgTable(
  "messages",
  {
    id: id(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    senderType: text("sender_type").$type<SenderType>().notNull(),
    senderId: uuid("sender_id"),
    content: text("content").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("messages_conversation_idx").on(t.conversationId, t.createdAt)],
);

export const serviceRequests = pgTable(
  "service_requests",
  {
    id: id(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
    serviceCategoryId: text("service_category_id")
      .$type<ServiceCategoryCode>()
      .notNull()
      .references(() => serviceCategories.id),
    description: text("description").notNull(),
    location: text("location").notNull(),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    requestedDate: date("requested_date", { mode: "string" }).notNull(),
    requestedStartTime: text("requested_start_time").notNull(),
    requestedEndTime: text("requested_end_time").notNull(),
    urgency: text("urgency").$type<Urgency>().notNull().default("NORMAL"),
    specialRequirements: jsonb("special_requirements").$type<string[]>().notNull().default([]),
    status: text("status").$type<ServiceRequestStatus>().notNull().default("SEARCHING"),
    estimatedPriceCents: integer("estimated_price_cents").notNull(),
    platformFeeCents: integer("platform_fee_cents").notNull(),
    /** How many times offers have been broadcast (0 = initial wave). */
    matchingRound: integer("matching_round").notNull().default(0),
    lastMatchedAt: ts("last_matched_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("service_requests_customer_idx").on(t.customerId),
    index("service_requests_status_idx").on(t.status),
  ],
);

/** A request broadcast to one worker. The first worker to accept wins. */
export const jobOffers = pgTable(
  "job_offers",
  {
    id: id(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => serviceRequests.id, { onDelete: "cascade" }),
    workerId: uuid("worker_id")
      .notNull()
      .references(() => workerProfiles.userId, { onDelete: "cascade" }),
    status: text("status").$type<JobOfferStatus>().notNull().default("PENDING"),
    score: doublePrecision("score").notNull(),
    distanceMiles: doublePrecision("distance_miles"),
    createdAt: createdAt(),
    respondedAt: ts("responded_at"),
  },
  (t) => [
    uniqueIndex("job_offers_request_worker_uq").on(t.requestId, t.workerId),
    index("job_offers_worker_status_idx").on(t.workerId, t.status),
  ],
);

export const jobs = pgTable(
  "jobs",
  {
    id: id(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => serviceRequests.id, { onDelete: "cascade" }),
    workerId: uuid("worker_id")
      .notNull()
      .references(() => workerProfiles.userId),
    status: text("status").$type<JobStatus>().notNull().default("ACCEPTED"),
    acceptedAt: ts("accepted_at"),
    enRouteAt: ts("en_route_at"),
    arrivedAt: ts("arrived_at"),
    startedAt: ts("started_at"),
    completedAt: ts("completed_at"),
    cancelledAt: ts("cancelled_at"),
    cancelReason: text("cancel_reason"),
    finalPriceCents: integer("final_price_cents"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // At most one non-cancelled job per request.
    uniqueIndex("jobs_one_active_per_request_uq").on(t.requestId).where(sql`${t.status} <> 'CANCELLED'`),
    index("jobs_worker_idx").on(t.workerId),
  ],
);

/** Customer ↔ worker chat on a job. */
export const jobMessages = pgTable(
  "job_messages",
  {
    id: id(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => users.id),
    content: text("content").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("job_messages_job_idx").on(t.jobId, t.createdAt)],
);

export const ratings = pgTable(
  "ratings",
  {
    id: id(),
    jobId: uuid("job_id")
      .notNull()
      .unique()
      .references(() => jobs.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => users.id),
    workerId: uuid("worker_id")
      .notNull()
      .references(() => workerProfiles.userId),
    score: integer("score").notNull(),
    comment: text("comment"),
    createdAt: createdAt(),
  },
  (t) => [index("ratings_worker_idx").on(t.workerId)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    readAt: ts("read_at"),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.createdAt)],
);

export type UserRow = typeof users.$inferSelect;
export type CustomerProfileRow = typeof customerProfiles.$inferSelect;
export type WorkerProfileRow = typeof workerProfiles.$inferSelect;
export type ServiceCategoryRow = typeof serviceCategories.$inferSelect;
export type WorkerQualificationRow = typeof workerQualifications.$inferSelect;
export type WorkerAvailabilityRow = typeof workerAvailability.$inferSelect;
export type ConversationRow = typeof conversations.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;
export type ServiceRequestRow = typeof serviceRequests.$inferSelect;
export type JobOfferRow = typeof jobOffers.$inferSelect;
export type JobRow = typeof jobs.$inferSelect;
export type JobMessageRow = typeof jobMessages.$inferSelect;
export type RatingRow = typeof ratings.$inferSelect;
export type NotificationRow = typeof notifications.$inferSelect;
