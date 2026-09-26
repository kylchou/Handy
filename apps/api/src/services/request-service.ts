import type {
  CreateServiceRequestBody,
  CreateServiceRequestResponse,
  RequestMatchesResponse,
  ServiceRequestDTO,
  ServiceRequestStatus,
} from "@handy/contracts";
import { REQUIRED_REQUEST_FIELDS } from "@handy/contracts";
import type { ServiceRequestRow } from "@handy/db";
import { ApiError, forbidden, notFound } from "../lib/errors";
import { EMERGENCY_GUIDANCE, detectEmergency } from "../lib/safety";
import { addMinutes, friendlyDate, nowTimeIn, todayIn } from "../lib/time";
import { categoriesRepo } from "../repositories/categories";
import { conversationsRepo } from "../repositories/conversations";
import { jobsRepo } from "../repositories/jobs";
import { offersRepo } from "../repositories/offers";
import { requestsRepo } from "../repositories/requests";
import { customerProfilesRepo, usersRepo } from "../repositories/users";
import { Notifier, type Actor, type ServiceContext } from "./context";
import type { ConversationService } from "./conversation-service";
import { mergeDraft } from "./conversation-service";
import type { MatchingOrchestrator } from "./matching-orchestrator";
import { requestView, requestViews } from "./views";

const HIGH_URGENCY_SURCHARGE_CENTS = 1000;

export class RequestService {
  private notifier: Notifier;

  constructor(
    private ctx: ServiceContext,
    private conversations: ConversationService,
    private matching: MatchingOrchestrator,
  ) {
    this.notifier = new Notifier(ctx);
  }

  /** Customer confirmed the AI's summary: create the request and broadcast it. */
  async create(actor: Actor, body: CreateServiceRequestBody): Promise<CreateServiceRequestResponse> {
    const { db, config } = this.ctx;
    const conv = await this.conversations.load(actor, body.conversationId);
    if (conv.customerId !== actor.id) throw forbidden("Only the customer can confirm their own request.");
    if (conv.status === "SUBMITTED") throw new ApiError("CONFLICT", "This request was already sent.");

    const { conversationId: _ignored, ...overrides } = body;
    const draft = mergeDraft(conv.draft, overrides);
    if (draft.requestedStartTime && !draft.requestedEndTime) draft.requestedEndTime = addMinutes(draft.requestedStartTime, 60);

    if (conv.safetyStatus === "POTENTIAL_EMERGENCY" || detectEmergency(`${draft.description ?? ""} ${draft.specialRequirements?.join(" ") ?? ""}`)) {
      throw new ApiError("POTENTIAL_EMERGENCY", EMERGENCY_GUIDANCE.message, EMERGENCY_GUIDANCE);
    }
    if (conv.safetyStatus === "UNSUPPORTED_SERVICE" && !body.serviceCategoryId) {
      throw new ApiError("REQUEST_INCOMPLETE", "We can't send a helper for this kind of request.");
    }
    const missing = REQUIRED_REQUEST_FIELDS.filter((f) => draft[f] == null || draft[f] === "");
    if (missing.length) {
      throw new ApiError("REQUEST_INCOMPLETE", "I still need a little more information before I can send this.", { missingInformation: missing });
    }
    const today = todayIn(config.timezone);
    if (draft.requestedDate! < today) {
      throw new ApiError("VALIDATION_FAILED", "That date has already passed. Please choose today or a later day.");
    }
    if (draft.requestedEndTime! <= draft.requestedStartTime!) {
      throw new ApiError("VALIDATION_FAILED", "The end time needs to be after the start time.");
    }
    if (draft.requestedDate === today && draft.requestedEndTime! <= nowTimeIn(config.timezone)) {
      throw new ApiError("VALIDATION_FAILED", "That time has already passed today. Please choose a later time.");
    }

    const [category, profile] = await Promise.all([
      categoriesRepo.get(db, draft.serviceCategoryId!),
      customerProfilesRepo.get(db, actor.id),
    ]);
    if (!category) throw new ApiError("VALIDATION_FAILED", "Unknown service type.");
    if (draft.preferredWorkerId) {
      const preferred = await usersRepo.findById(db, draft.preferredWorkerId);
      if (preferred?.role !== "WORKER") throw new ApiError("VALIDATION_FAILED", "We couldn't find that helper.");
    }

    // No geocoder yet: the customer's home coordinates stand in for the job site.
    const request = await db.transaction(async (tx) => {
      const created = await requestsRepo.create(tx, {
        customerId: actor.id,
        conversationId: conv.id,
        serviceCategoryId: category.id,
        description: draft.description!,
        location: draft.location!,
        latitude: profile?.latitude ?? null,
        longitude: profile?.longitude ?? null,
        requestedDate: draft.requestedDate!,
        requestedStartTime: draft.requestedStartTime!,
        requestedEndTime: draft.requestedEndTime!,
        urgency: draft.urgency ?? "NORMAL",
        specialRequirements: draft.specialRequirements ?? [],
        preferredWorkerId: draft.preferredWorkerId ?? null,
        status: "SEARCHING",
        estimatedPriceCents: category.basePriceCents + (draft.urgency === "HIGH" ? HIGH_URGENCY_SURCHARGE_CENTS : 0),
        platformFeeCents: config.platformFeeCents,
      });
      await conversationsRepo.update(tx, conv.id, { status: "SUBMITTED", draft, readyToSubmit: true, missingInformation: [] });
      await conversationsRepo.addMessage(tx, {
        conversationId: conv.id,
        senderType: "SYSTEM",
        content: "Request confirmed. Looking for someone to help.",
      });
      return created;
    });

    this.notifier.emit([actor.id], "REQUEST_CREATED", { requestId: request.id, status: request.status });
    const notifiedWorkerCount = await this.matching.broadcast(request.id);
    const fresh = (await requestsRepo.get(db, request.id))!;
    return { request: await requestView(this.ctx, fresh), notifiedWorkerCount };
  }

  async list(actor: Actor, status?: ServiceRequestStatus): Promise<ServiceRequestDTO[]> {
    const rows = await requestsRepo.list(this.ctx.db, { customerId: actor.role === "ADMIN" ? undefined : actor.id, status });
    return requestViews(this.ctx, rows);
  }

  async get(actor: Actor, requestId: string): Promise<ServiceRequestDTO> {
    return requestView(this.ctx, await this.load(actor, requestId));
  }

  async cancel(actor: Actor, requestId: string): Promise<ServiceRequestDTO> {
    const { db } = this.ctx;
    const existing = await this.load(actor, requestId);
    if (existing.status !== "SEARCHING") {
      throw new ApiError(
        "INVALID_TRANSITION",
        existing.status === "MATCHED"
          ? "Someone has already accepted this job. Cancel it from the job screen instead."
          : "This request can no longer be cancelled.",
      );
    }
    const { request, withdrawn } = await db.transaction(async (tx) => {
      const locked = await requestsRepo.getForUpdate(tx, requestId);
      if (!locked || locked.status !== "SEARCHING") throw new ApiError("INVALID_TRANSITION", "This request can no longer be cancelled.");
      const request = await requestsRepo.update(tx, requestId, { status: "CANCELLED" });
      const withdrawn = await offersRepo.withdrawPending(tx, requestId);
      return { request, withdrawn };
    });
    for (const o of withdrawn) this.notifier.emit([o.workerId], "JOB_NO_LONGER_AVAILABLE", { requestId, offerId: o.id });
    this.notifier.emit([request.customerId], "REQUEST_CANCELLED", { requestId, status: request.status });
    return requestView(this.ctx, request);
  }

  /**
   * Closes requests nobody accepted before their time window ended, pulls the
   * open offers, and lets the customer know. Called on an interval.
   */
  async expirePastRequests(now = new Date()): Promise<number> {
    const { db, config } = this.ctx;
    const due = await requestsRepo.searchingPastWindow(db, todayIn(config.timezone, now), nowTimeIn(config.timezone, now));
    if (due.length === 0) return 0;
    const categoryName = new Map((await categoriesRepo.list(db)).map((c) => [c.id, c.name.toLowerCase()]));
    let count = 0;
    for (const r of due) {
      const result = await db.transaction(async (tx) => {
        const locked = await requestsRepo.getForUpdate(tx, r.id);
        if (!locked || locked.status !== "SEARCHING") return null; // someone accepted or cancelled in the meantime
        const request = await requestsRepo.update(tx, r.id, { status: "EXPIRED" });
        const withdrawn = await offersRepo.withdrawPending(tx, r.id);
        return { request, withdrawn };
      });
      if (!result) continue;
      count++;
      for (const o of result.withdrawn) this.notifier.emit([o.workerId], "JOB_NO_LONGER_AVAILABLE", { requestId: r.id, offerId: o.id });
      this.notifier.emit([r.customerId], "REQUEST_EXPIRED", { requestId: r.id, status: result.request.status });
      await this.notifier.notifyCustomer(
        r.customerId,
        "REQUEST_EXPIRED",
        `We couldn't find anyone for your ${categoryName.get(r.serviceCategoryId) ?? "request"} on ${friendlyDate(r.requestedDate)}.`,
        "Would you like to pick another time? Just start a new request and we'll look again.",
        { requestId: r.id },
        (who) => ({
          title: `We couldn't find anyone for ${who}'s ${categoryName.get(r.serviceCategoryId) ?? "request"} on ${friendlyDate(r.requestedDate)}.`,
          body: "You might want to check in with them about picking another time.",
        }),
      );
    }
    if (count) this.ctx.log.info({ expired: count }, "expired requests nobody accepted in time");
    return count;
  }

  async matches(actor: Actor, requestId: string): Promise<RequestMatchesResponse> {
    await this.load(actor, requestId);
    return { requestId, matches: await this.matching.preview(requestId) };
  }

  /** Customers see their own requests; the assigned worker sees theirs; admins see all. */
  private async load(actor: Actor, requestId: string): Promise<ServiceRequestRow> {
    const request = await requestsRepo.get(this.ctx.db, requestId);
    if (!request) throw notFound("Request");
    if (actor.role === "ADMIN" || request.customerId === actor.id) return request;
    if (actor.role === "WORKER") {
      const [job] = await jobsRepo.activeForRequests(this.ctx.db, [requestId]);
      if (job?.workerId === actor.id) return request;
    }
    throw forbidden();
  }
}
