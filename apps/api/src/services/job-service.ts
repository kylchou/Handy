import { randomInt } from "node:crypto";
import {
  canTransitionJob,
  type CreateRatingBody,
  type JobDetailDTO,
  type JobMessageDTO,
  type JobOfferDTO,
  type JobStatus,
  type RatingDTO,
  type RealtimeEvent,
} from "@handy/contracts";
import type { JobRow, ServiceRequestRow } from "@handy/db";
import { ApiError, forbidden, notFound } from "../lib/errors";
import { addDays, formatTime12h, friendlyDate, todayIn, windowsOverlap, zonedDateTimeToDate } from "../lib/time";
import { categoriesRepo } from "../repositories/categories";
import { jobMessagesRepo, jobsRepo, ratingsRepo } from "../repositories/jobs";
import { offersRepo } from "../repositories/offers";
import { requestsRepo } from "../repositories/requests";
import { usersRepo } from "../repositories/users";
import { workersRepo } from "../repositories/workers";
import { Notifier, type Actor, type ServiceContext } from "./context";
import { toJobMessageDTO, toRatingDTO } from "./mappers";
import type { MatchingOrchestrator } from "./matching-orchestrator";
import { jobDetail, jobDetails, offerViews } from "./views";

const STATUS_EVENT: Partial<Record<JobStatus, RealtimeEvent["type"]>> = {
  EN_ROUTE: "WORKER_EN_ROUTE",
  ARRIVED: "WORKER_ARRIVED",
  IN_PROGRESS: "JOB_STARTED",
  COMPLETED: "JOB_COMPLETED",
};

const STATUS_TIMESTAMP: Partial<Record<JobStatus, keyof JobRow>> = {
  EN_ROUTE: "enRouteAt",
  ARRIVED: "arrivedAt",
  IN_PROGRESS: "startedAt",
  COMPLETED: "completedAt",
  CANCELLED: "cancelledAt",
};

const MAX_ARRIVAL_CODE_ATTEMPTS = 5;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

export class JobService {
  private notifier: Notifier;

  constructor(
    private ctx: ServiceContext,
    private matching: MatchingOrchestrator,
  ) {
    this.notifier = new Notifier(ctx);
  }

  // ---------- Offers (worker marketplace) ----------

  async available(actor: Actor): Promise<JobOfferDTO[]> {
    return offerViews(this.ctx, await offersRepo.pendingForWorker(this.ctx.db, actor.id, this.matching.offerCutoff()));
  }

  /** First valid worker to accept gets the job; everyone else's offer is withdrawn. */
  async accept(actor: Actor, offerId: string): Promise<JobDetailDTO> {
    const { db } = this.ctx;
    let result: {
      job: JobRow;
      request: ServiceRequestRow;
      withdrawn: Array<{ id: string; workerId: string }>;
      ownConflicts: Array<{ id: string; requestId: string }>;
    };
    try {
      result = await db.transaction(async (tx) => {
        const offer = await offersRepo.get(tx, offerId);
        if (!offer || offer.workerId !== actor.id) throw notFound("Job offer");
        // Lock the worker first so two accepts from the same worker can't both pass the overlap check.
        await workersRepo.lockProfile(tx, actor.id);
        const request = await requestsRepo.getForUpdate(tx, offer.requestId);
        const freshOffer = await offersRepo.get(tx, offerId);
        // An overdue offer is treated as expired even if the sweep hasn't marked it yet.
        const overdue = !freshOffer || freshOffer.createdAt <= this.matching.offerCutoff();
        if (!request || request.status !== "SEARCHING" || freshOffer?.status !== "PENDING" || overdue) {
          throw new ApiError("JOB_NO_LONGER_AVAILABLE", "Sorry, this job is no longer available.");
        }
        const overlaps = (w: { date: string; startTime: string; endTime: string }) =>
          w.date === request.requestedDate && windowsOverlap(w.startTime, w.endTime, request.requestedStartTime, request.requestedEndTime);
        if ((await workersRepo.bookedWindows(tx, [actor.id])).some(overlaps)) {
          throw new ApiError("SCHEDULE_CONFLICT", "You already have a job at that time.");
        }

        const now = new Date();
        const job = await jobsRepo.create(tx, {
          requestId: request.id,
          workerId: actor.id,
          status: "ACCEPTED",
          acceptedAt: now,
          arrivalCode: String(randomInt(0, 10_000)).padStart(4, "0"),
        });
        await offersRepo.update(tx, offerId, { status: "ACCEPTED", respondedAt: now });
        const withdrawn = await offersRepo.withdrawPending(tx, request.id, offerId);
        const updated = await requestsRepo.update(tx, request.id, { status: "MATCHED" });
        // The worker can't take other jobs at the same time anymore, so pull those offers.
        const conflicting = (await offersRepo.pendingWithWindows(tx, actor.id)).filter(overlaps);
        const ownConflicts = await offersRepo.withdraw(tx, conflicting.map((o) => o.id));
        return { job, request: updated, withdrawn, ownConflicts };
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw new ApiError("JOB_NO_LONGER_AVAILABLE", "Sorry, this job is no longer available.");
      throw err;
    }

    const { job, request, withdrawn, ownConflicts } = result;
    const detail = await jobDetail(this.ctx, job, actor);
    for (const o of withdrawn) this.notifier.emit([o.workerId], "JOB_NO_LONGER_AVAILABLE", { requestId: request.id, offerId: o.id });
    for (const o of ownConflicts) {
      this.notifier.emit([actor.id], "JOB_NO_LONGER_AVAILABLE", { requestId: o.requestId, offerId: o.id });
      // If this worker was the only one holding that request, find someone else.
      const stillPending = (await offersRepo.byRequest(this.ctx.db, o.requestId)).some((x) => x.status === "PENDING");
      if (!stillPending) await this.matching.broadcast(o.requestId);
    }
    this.notifier.emit([request.customerId, actor.id], "JOB_ACCEPTED", {
      jobId: job.id,
      requestId: request.id,
      status: job.status,
      workerId: actor.id,
    });
    await this.notifier.notifyCustomer(
      request.customerId,
      "JOB_ACCEPTED",
      `${detail.worker.firstName} is helping you ${this.friendlyWhen(request)}.`,
      `${detail.worker.displayName} · ${detail.worker.rating.toFixed(1)} stars · ${detail.worker.completedJobs} completed jobs. ` +
        `Your arrival code is ${job.arrivalCode}. Only tell it to ${detail.worker.firstName} once they're at your door.`,
      { jobId: job.id, requestId: request.id },
      (who) => ({
        title: `${detail.worker.displayName} will help ${who} ${this.friendlyWhen(request)}.`,
        body: `${detail.worker.rating.toFixed(1)} stars · ${detail.worker.completedJobs} completed jobs`,
      }),
    );
    return detail;
  }

  async decline(actor: Actor, offerId: string): Promise<JobOfferDTO> {
    const offer = await offersRepo.get(this.ctx.db, offerId);
    if (!offer || offer.workerId !== actor.id) throw notFound("Job offer");
    if (offer.status !== "PENDING") throw new ApiError("CONFLICT", "This job offer is no longer open.");
    const updated = await offersRepo.update(this.ctx.db, offerId, { status: "DECLINED", respondedAt: new Date() });
    // If nobody is left holding an offer, widen the search right away.
    const remaining = (await offersRepo.byRequest(this.ctx.db, offer.requestId)).filter((o) => o.status === "PENDING");
    if (remaining.length === 0) await this.matching.broadcast(offer.requestId);
    return (await offerViews(this.ctx, [updated]))[0]!;
  }

  // ---------- Jobs ----------

  async list(actor: Actor, status?: JobStatus): Promise<JobDetailDTO[]> {
    if (actor.role === "CAREGIVER") throw forbidden("Caregivers can see jobs on their dashboard.");
    const filter =
      actor.role === "WORKER" ? { workerId: actor.id, status } : actor.role === "CUSTOMER" ? { customerId: actor.id, status } : { status };
    return jobDetails(this.ctx, await jobsRepo.list(this.ctx.db, filter), actor);
  }

  async get(actor: Actor, jobId: string): Promise<JobDetailDTO> {
    const { job } = await this.load(actor, jobId);
    return jobDetail(this.ctx, job, actor);
  }

  async updateStatus(
    actor: Actor,
    jobId: string,
    to: JobStatus,
    opts: { reason?: string; arrivalCode?: string } = {},
  ): Promise<JobDetailDTO> {
    const { db } = this.ctx;
    const { reason } = opts;
    await this.load(actor, jobId);
    // Workers prove they're at the right door with the customer's code. Admins can skip it.
    if (to === "ARRIVED" && actor.role === "WORKER") await this.checkArrivalCode(jobId, opts.arrivalCode);

    const { job, request } = await db.transaction(async (tx) => {
      const current = await jobsRepo.getForUpdate(tx, jobId);
      if (!current) throw notFound("Job");
      if (!canTransitionJob(current.status, to, actor.role)) {
        throw new ApiError("INVALID_TRANSITION", `A job that is ${current.status.toLowerCase().replace("_", " ")} can't be changed to ${to.toLowerCase().replace("_", " ")}.`, {
          from: current.status,
          to,
        });
      }
      const req = (await requestsRepo.getForUpdate(tx, current.requestId))!;
      const now = new Date();
      const patch: Partial<JobRow> = { status: to };
      const tsField = STATUS_TIMESTAMP[to];
      if (tsField) (patch as Record<string, unknown>)[tsField] = now;

      let request = req;
      if (to === "COMPLETED") {
        patch.finalPriceCents = req.estimatedPriceCents;
        request = await requestsRepo.update(tx, req.id, { status: "COMPLETED" });
        const profile = await workersRepo.getProfile(tx, current.workerId);
        if (profile) await workersRepo.updateProfile(tx, current.workerId, { completedJobs: profile.completedJobs + 1 });
      } else if (to === "CANCELLED") {
        patch.cancelReason = reason ?? null;
        // A worker dropping out puts the request back on the market; otherwise the request ends.
        request = await requestsRepo.update(
          tx,
          req.id,
          actor.role === "WORKER" ? { status: "SEARCHING", lastMatchedAt: null } : { status: "CANCELLED" },
        );
      }
      const job = await jobsRepo.update(tx, jobId, patch);
      return { job, request };
    });

    await this.announceStatus(actor, job, request);
    if (to === "CANCELLED" && request.status === "SEARCHING") await this.matching.broadcast(request.id);
    return jobDetail(this.ctx, job, actor);
  }

  /**
   * Checks the code in its own transaction so a wrong guess is counted even
   * though the request fails. Five wrong guesses locks arriving for that job.
   */
  private async checkArrivalCode(jobId: string, code: string | undefined): Promise<void> {
    if (!code) throw new ApiError("INVALID_ARRIVAL_CODE", "Please enter the 4-digit code the customer gives you at the door.");
    const outcome = await this.ctx.db.transaction(async (tx) => {
      const job = await jobsRepo.getForUpdate(tx, jobId);
      if (!job || job.status !== "EN_ROUTE" || !job.arrivalCode) return "skip" as const; // the transition check reports this
      if (job.arrivalCodeAttempts >= MAX_ARRIVAL_CODE_ATTEMPTS) return "locked" as const;
      if (code === job.arrivalCode) return "ok" as const;
      await jobsRepo.update(tx, jobId, { arrivalCodeAttempts: job.arrivalCodeAttempts + 1 });
      return job.arrivalCodeAttempts + 1 >= MAX_ARRIVAL_CODE_ATTEMPTS ? ("locked" as const) : ("wrong" as const);
    });
    if (outcome === "wrong") throw new ApiError("INVALID_ARRIVAL_CODE", "That code doesn't match. Please ask the customer to read it again.");
    if (outcome === "locked") {
      throw new ApiError("TOO_MANY_ATTEMPTS", "Too many wrong codes for this job. Please contact support so we can check in with the customer.");
    }
  }

  private async announceStatus(actor: Actor, job: JobRow, request: ServiceRequestRow) {
    const parties = [request.customerId, job.workerId];
    const ref = { jobId: job.id, requestId: request.id, status: job.status };
    const worker = await usersRepo.findById(this.ctx.db, job.workerId);
    const name = worker?.firstName ?? "Your helper";
    const data = { jobId: job.id, requestId: request.id };

    if (job.status === "CANCELLED") {
      // Caregivers are read-only, so only these three roles can cancel (see JOB_STATUS_TRANSITIONS).
      const cancelledBy = actor.role as "CUSTOMER" | "WORKER" | "ADMIN";
      this.notifier.emit(parties, "JOB_CANCELLED", { ...ref, cancelledBy });
      if (cancelledBy === "WORKER") {
        await this.notifier.notifyCustomer(
          request.customerId,
          "JOB_CANCELLED",
          `${name} can no longer make it.`,
          "Don't worry — we're looking for someone else to help you.",
          data,
          (who) => ({ title: `${name} can no longer make it to ${who}'s job.`, body: "We're looking for someone else." }),
        );
      } else if (cancelledBy === "CUSTOMER") {
        await this.notifier.notify(job.workerId, "JOB_CANCELLED", "The customer cancelled this job.", null, data);
        await this.notifier.notifyCaregivers(request.customerId, "JOB_CANCELLED", (who) => ({ title: `${who} cancelled a job with ${name}.` }), data);
      } else {
        await this.notifier.notifyCustomer(request.customerId, "JOB_CANCELLED", "Your job was cancelled by our support team.", null, data, (who) => ({
          title: `${who}'s job was cancelled by our support team.`,
        }));
        await this.notifier.notify(job.workerId, "JOB_CANCELLED", "This job was cancelled by our support team.", null, data);
      }
      return;
    }

    const type = STATUS_EVENT[job.status];
    if (type) this.notifier.emit(parties, type as "WORKER_EN_ROUTE", ref);
    const messages: Partial<Record<JobStatus, [string, string | null]>> = {
      EN_ROUTE: [`${name} is on the way.`, null],
      ARRIVED: [`${name} has arrived.`, null],
      IN_PROGRESS: [`${name} has started working.`, null],
      COMPLETED: [`${name} has marked your job as complete.`, "Was everything completed successfully? You can leave a rating."],
    };
    // Caregivers only hear about the moments that matter, not every step.
    const forCaregivers: Partial<Record<JobStatus, (who: string) => string>> = {
      ARRIVED: (who) => `${name} has arrived at ${who}'s.`,
      COMPLETED: (who) => `${name} finished helping ${who}.`,
    };
    const msg = messages[job.status];
    const caregiverTitle = forCaregivers[job.status];
    if (msg) {
      await this.notifier.notifyCustomer(request.customerId, type ?? job.status, msg[0], msg[1], data, caregiverTitle && ((who) => ({ title: caregiverTitle(who) })));
    }
  }

  // ---------- Reminders ----------

  /**
   * Sends "tomorrow" (24h before) and "in about an hour" reminders for accepted
   * jobs. Each is sent once. It's skipped silently if the worker accepted after
   * that point (the acceptance notice already told everyone) or if the time
   * already passed. Called on an interval.
   */
  async sendReminders(now = new Date()): Promise<number> {
    const { db, config } = this.ctx;
    const today = todayIn(config.timezone, now);
    const due = await jobsRepo.awaitingReminders(db, addDays(today, -1), addDays(today, 2));
    if (due.length === 0) return 0;
    const categoryName = new Map((await categoriesRepo.list(db)).map((c) => [c.id, c.name]));
    let sent = 0;

    for (const { job, request } of due) {
      const start = zonedDateTimeToDate(request.requestedDate, request.requestedStartTime, config.timezone).getTime();
      const t = now.getTime();
      const hourDue = t >= start - HOUR_MS;
      const dayDue = t >= start - DAY_MS;
      const acceptedAt = job.acceptedAt?.getTime() ?? 0;

      // If the hour reminder is already due, the day one would just be noise.
      if (dayDue && !job.dayReminderSentAt && (await jobsRepo.claimReminder(db, job.id, "day", now))) {
        if (!hourDue && acceptedAt < start - DAY_MS) {
          await this.remind(job, request, "day", categoryName.get(request.serviceCategoryId) ?? "Your", now);
          sent++;
        }
      }
      if (hourDue && !job.hourReminderSentAt && (await jobsRepo.claimReminder(db, job.id, "hour", now))) {
        if (t < start && acceptedAt < start - HOUR_MS) {
          await this.remind(job, request, "hour", categoryName.get(request.serviceCategoryId) ?? "Your", now);
          sent++;
        }
      }
    }
    if (sent) this.ctx.log.info({ sent }, "sent job reminders");
    return sent;
  }

  private async remind(job: JobRow, request: ServiceRequestRow, kind: "day" | "hour", service: string, now: Date) {
    const [worker, customer] = await Promise.all([
      usersRepo.findById(this.ctx.db, job.workerId),
      usersRepo.findById(this.ctx.db, request.customerId),
    ]);
    const workerName = worker?.firstName ?? "Your helper";
    const customerName = customer ? `${customer.firstName} ${customer.lastName.charAt(0)}.` : "the customer";
    const when = this.friendlyWhen(request, now);
    const code = job.arrivalCode ? ` Your arrival code is ${job.arrivalCode}.` : "";
    const data = { jobId: job.id, requestId: request.id, reminder: kind };

    if (kind === "day") {
      await this.notifier.notifyCustomer(
        request.customerId,
        "JOB_REMINDER",
        `Reminder: ${workerName} is coming ${when}.`,
        `${service}: ${request.description}.${code}`,
        data,
        (who) => ({ title: `${workerName} is helping ${who} ${when}.` }),
      );
      await this.notifier.notify(job.workerId, "JOB_REMINDER", `Reminder: ${service} for ${customerName} ${when}.`, request.location, data);
    } else {
      await this.notifier.notify(
        request.customerId,
        "JOB_REMINDER",
        `${workerName} is coming in about an hour.`,
        `Around ${formatTime12h(request.requestedStartTime)}.${code}`,
        data,
      );
      await this.notifier.notify(job.workerId, "JOB_REMINDER", `Your ${service.toLowerCase()} job for ${customerName} starts in about an hour.`, request.location, data);
    }
  }

  // ---------- Chat ----------

  async messages(actor: Actor, jobId: string): Promise<JobMessageDTO[]> {
    await this.load(actor, jobId);
    const rows = await jobMessagesRepo.list(this.ctx.db, jobId);
    const senders = new Map((await usersRepo.findByIds(this.ctx.db, [...new Set(rows.map((r) => r.senderId))])).map((u) => [u.id, u]));
    return rows.map((r) => toJobMessageDTO(r, senders.get(r.senderId)));
  }

  async sendMessage(actor: Actor, jobId: string, content: string): Promise<JobMessageDTO> {
    const { job, request } = await this.load(actor, jobId);
    if (actor.role === "ADMIN") throw forbidden("Admins can read but not send job messages.");
    if (job.status === "CANCELLED" || job.status === "COMPLETED") {
      throw new ApiError("CONFLICT", "Messaging is closed for this job.");
    }
    const row = await jobMessagesRepo.create(this.ctx.db, { jobId, senderId: actor.id, content });
    const message = toJobMessageDTO(row, (await usersRepo.findById(this.ctx.db, actor.id)) ?? undefined);
    const recipient = actor.id === job.workerId ? request.customerId : job.workerId;
    this.notifier.emit([recipient, actor.id], "MESSAGE_RECEIVED", { jobId, message });
    return message;
  }

  // ---------- Rating ----------

  async rate(actor: Actor, jobId: string, body: CreateRatingBody): Promise<RatingDTO> {
    const { job, request } = await this.load(actor, jobId);
    if (request.customerId !== actor.id) throw forbidden("Only the customer can rate this job.");
    if (job.status !== "COMPLETED") throw new ApiError("CONFLICT", "You can rate a job once it's completed.");

    let rating;
    try {
      rating = await this.ctx.db.transaction(async (tx) => {
        const rating = await ratingsRepo.create(tx, {
          jobId,
          customerId: actor.id,
          workerId: job.workerId,
          score: body.score,
          comment: body.comment || null,
        });
        const profile = await workersRepo.getProfile(tx, job.workerId);
        if (profile) {
          const count = profile.ratingCount + 1;
          const avg = (profile.rating * profile.ratingCount + body.score) / count;
          await workersRepo.updateProfile(tx, job.workerId, { rating: Math.round(avg * 100) / 100, ratingCount: count });
        }
        return rating;
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw new ApiError("CONFLICT", "You've already rated this job. Thank you!");
      throw err;
    }
    this.notifier.emit([job.workerId], "RATING_SUBMITTED", { jobId, workerId: job.workerId, score: body.score });
    await this.notifier.notify(job.workerId, "RATING_SUBMITTED", `You received a ${body.score}-star rating.`, body.comment ?? null, { jobId });
    return toRatingDTO(rating);
  }

  // ---------- Access ----------

  /** The job's customer, its assigned worker, and admins may access a job. */
  private async load(actor: Actor, jobId: string): Promise<{ job: JobRow; request: ServiceRequestRow }> {
    const job = await jobsRepo.get(this.ctx.db, jobId);
    if (!job) throw notFound("Job");
    const request = (await requestsRepo.get(this.ctx.db, job.requestId))!;
    if (actor.role !== "ADMIN" && job.workerId !== actor.id && request.customerId !== actor.id) throw forbidden();
    return { job, request };
  }

  private friendlyWhen(r: ServiceRequestRow, now = new Date()): string {
    const today = todayIn(this.ctx.config.timezone, now);
    const day =
      r.requestedDate === today ? "today" : r.requestedDate === addDays(today, 1) ? "tomorrow" : `on ${friendlyDate(r.requestedDate)}`;
    return `${day} at ${formatTime12h(r.requestedStartTime)}`;
  }
}
