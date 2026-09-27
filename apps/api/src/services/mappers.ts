import type {
  ConversationRow,
  CustomerProfileRow,
  JobMessageRow,
  JobOfferRow,
  JobRow,
  MessageRow,
  NotificationRow,
  RatingRow,
  ServiceCategoryRow,
  ServiceRequestRow,
  UserRow,
  WorkerAvailabilityRow,
  WorkerProfileRow,
  WorkerQualificationRow,
} from "@handy/db";
import type {
  ConversationDTO,
  ConversationMessageDTO,
  CustomerProfileDTO,
  CustomerPublicDTO,
  JobDTO,
  JobMessageDTO,
  JobOfferDTO,
  NotificationDTO,
  PriceQuoteDTO,
  RatingDTO,
  ServiceCategoryDTO,
  ServiceRequestDTO,
  UserDTO,
  WorkerProfileDTO,
  WorkerPublicDTO,
} from "@handy/contracts";
import { approximateLocation } from "../lib/geo";
import { SCAM_WARNINGS, type ScamSignal } from "../lib/scam";

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export function toUserDTO(u: UserRow): UserDTO {
  return {
    id: u.id,
    role: u.role,
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    phone: u.phone,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  };
}

export function toCustomerProfileDTO(p: CustomerProfileRow): CustomerProfileDTO {
  return {
    userId: p.userId,
    address: p.address,
    latitude: p.latitude,
    longitude: p.longitude,
    accessibilityPreferences: p.accessibilityPreferences,
    emergencyContact: p.emergencyContact ?? null,
    communicationPreferences: p.communicationPreferences,
  };
}

export function toWorkerProfileDTO(
  p: WorkerProfileRow,
  quals: WorkerQualificationRow[],
  slots: WorkerAvailabilityRow[],
): WorkerProfileDTO {
  return {
    userId: p.userId,
    bio: p.bio,
    rating: p.rating,
    ratingCount: p.ratingCount,
    completedJobs: p.completedJobs,
    serviceRadius: p.serviceRadius,
    address: p.address,
    latitude: p.latitude,
    longitude: p.longitude,
    availabilityStatus: p.availabilityStatus,
    verificationStatus: p.verificationStatus,
    qualifications: quals
      .filter((q) => q.workerId === p.userId)
      .map((q) => ({ serviceCategoryId: q.serviceCategoryId, qualificationLevel: q.qualificationLevel })),
    availability: slots
      .filter((s) => s.workerId === p.userId)
      .map((s) => ({ dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime })),
  };
}

export function toWorkerPublicDTO(u: UserRow, p: WorkerProfileRow, quals: WorkerQualificationRow[]): WorkerPublicDTO {
  const lastInitial = `${u.lastName.charAt(0).toUpperCase()}.`;
  return {
    id: u.id,
    firstName: u.firstName,
    lastInitial,
    displayName: `${u.firstName} ${lastInitial}`,
    bio: p.bio,
    rating: Math.round(p.rating * 100) / 100,
    ratingCount: p.ratingCount,
    completedJobs: p.completedJobs,
    verificationStatus: p.verificationStatus,
    services: quals.filter((q) => q.workerId === u.id).map((q) => q.serviceCategoryId),
  };
}

export function toCustomerPublicDTO(u: UserRow): CustomerPublicDTO {
  const lastInitial = `${u.lastName.charAt(0).toUpperCase()}.`;
  return { id: u.id, firstName: u.firstName, lastInitial, displayName: `${u.firstName} ${lastInitial}` };
}

export function toCategoryDTO(c: ServiceCategoryRow): ServiceCategoryDTO {
  return {
    id: c.id,
    name: c.name,
    description: c.description,
    requiresQualification: c.requiresQualification,
    basePriceCents: c.basePriceCents,
  };
}

export function toConversationDTO(c: ConversationRow, serviceRequestId: string | null, priceQuote: PriceQuoteDTO | null = null): ConversationDTO {
  return {
    id: c.id,
    customerId: c.customerId,
    status: c.status,
    draft: c.draft,
    missingInformation: c.missingInformation,
    readyToSubmit: c.readyToSubmit,
    safetyStatus: c.safetyStatus,
    priceQuote,
    serviceRequestId,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

export function toConversationMessageDTO(m: MessageRow): ConversationMessageDTO {
  return {
    id: m.id,
    conversationId: m.conversationId,
    senderType: m.senderType,
    senderId: m.senderId,
    content: m.content,
    createdAt: m.createdAt.toISOString(),
  };
}

export function toRequestDTO(r: ServiceRequestRow, pendingOfferCount: number, jobId: string | null): ServiceRequestDTO {
  return {
    id: r.id,
    customerId: r.customerId,
    conversationId: r.conversationId,
    serviceCategoryId: r.serviceCategoryId,
    description: r.description,
    location: r.location,
    latitude: r.latitude,
    longitude: r.longitude,
    requestedDate: r.requestedDate,
    requestedStartTime: r.requestedStartTime,
    requestedEndTime: r.requestedEndTime,
    urgency: r.urgency,
    specialRequirements: r.specialRequirements,
    preferredWorkerId: r.preferredWorkerId,
    scheduleId: r.scheduleId,
    status: r.status,
    estimatedPriceCents: r.estimatedPriceCents,
    platformFeeCents: r.platformFeeCents,
    tipCents: r.tipCents,
    workerPayCents: r.estimatedPriceCents + r.tipCents,
    totalPriceCents: r.estimatedPriceCents + r.platformFeeCents + r.tipCents,
    pendingOfferCount,
    jobId,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export function toJobDTO(j: JobRow): JobDTO {
  return {
    id: j.id,
    requestId: j.requestId,
    workerId: j.workerId,
    status: j.status,
    acceptedAt: iso(j.acceptedAt),
    enRouteAt: iso(j.enRouteAt),
    arrivedAt: iso(j.arrivedAt),
    startedAt: iso(j.startedAt),
    completedAt: iso(j.completedAt),
    cancelledAt: iso(j.cancelledAt),
    noShowAlertedAt: iso(j.noShowAlertedAt),
    finalPriceCents: j.finalPriceCents,
    createdAt: j.createdAt.toISOString(),
    updatedAt: j.updatedAt.toISOString(),
  };
}

export function toJobOfferDTO(
  o: JobOfferRow,
  r: ServiceRequestRow,
  category: ServiceCategoryRow | undefined,
  customer: UserRow,
  ttlSeconds: number,
): JobOfferDTO {
  return {
    id: o.id,
    requestId: o.requestId,
    workerId: o.workerId,
    status: o.status,
    score: o.score,
    distanceMiles: o.distanceMiles,
    serviceCategoryId: r.serviceCategoryId,
    serviceName: category?.name ?? r.serviceCategoryId,
    description: r.description,
    approximateLocation: approximateLocation(r.location),
    requestedDate: r.requestedDate,
    requestedStartTime: r.requestedStartTime,
    requestedEndTime: r.requestedEndTime,
    urgency: r.urgency,
    specialRequirements: r.specialRequirements,
    estimatedPayCents: r.estimatedPriceCents + r.tipCents,
    tipCents: r.tipCents,
    urgentBonusCents: category ? Math.max(0, r.estimatedPriceCents - category.basePriceCents) : 0,
    customer: toCustomerPublicDTO(customer),
    createdAt: o.createdAt.toISOString(),
    expiresAt: new Date(o.createdAt.getTime() + ttlSeconds * 1000).toISOString(),
  };
}

export function toJobMessageDTO(m: JobMessageRow, sender: UserRow | undefined): JobMessageDTO {
  return {
    id: m.id,
    jobId: m.jobId,
    senderId: m.senderId,
    senderRole: sender?.role ?? "CUSTOMER",
    senderName: sender ? `${sender.firstName} ${sender.lastName.charAt(0)}.` : "Unknown",
    content: m.content,
    flags: m.flags,
    warning: m.flags.length ? m.flags.map((f) => SCAM_WARNINGS[f as ScamSignal] ?? "").filter(Boolean).join(" ") : null,
    createdAt: m.createdAt.toISOString(),
  };
}

export function toRatingDTO(r: RatingRow): RatingDTO {
  return {
    id: r.id,
    jobId: r.jobId,
    customerId: r.customerId,
    workerId: r.workerId,
    score: r.score,
    comment: r.comment,
    createdAt: r.createdAt.toISOString(),
  };
}

export function toNotificationDTO(n: NotificationRow): NotificationDTO {
  return {
    id: n.id,
    userId: n.userId,
    type: n.type,
    title: n.title,
    body: n.body,
    data: n.data,
    readAt: iso(n.readAt),
    createdAt: n.createdAt.toISOString(),
  };
}
