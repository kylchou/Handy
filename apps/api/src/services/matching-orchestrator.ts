import type { WorkerCandidate, WorkerMatchDTO } from "@handy/contracts";
import type { ServiceRequestRow } from "@handy/db";
import { offersRepo } from "../repositories/offers";
import { requestsRepo } from "../repositories/requests";
import { usersRepo } from "../repositories/users";
import { workersRepo } from "../repositories/workers";
import { formatTime12h } from "../lib/time";
import { Notifier, type ServiceContext } from "./context";
import { offerViews, requestView } from "./views";
import { LOW_RATING, workerHistoryFor } from "./worker-history";

/**
 * Backend side of matching: loads candidates, asks the MatchingService to rank
 * them, and broadcasts offers in waves:
 *   round 0 — the top MATCH_INITIAL_OFFERS workers, immediately;
 *   later   — every remaining eligible worker, once the request has been
 *             searching for MATCH_EXPAND_AFTER_SECONDS (see expandStale()).
 */
export class MatchingOrchestrator {
  private notifier: Notifier;

  constructor(private ctx: ServiceContext) {
    this.notifier = new Notifier(ctx);
  }

  async buildCandidates(request: ServiceRequestRow, excludeWorkerIds: Set<string>): Promise<WorkerCandidate[]> {
    const { db } = this.ctx;
    const history = await workerHistoryFor(this.ctx, request.customerId);
    // Never send someone the customer rated poorly.
    const ratedLow = (id: string) => (history.get(id)?.lastRating ?? 5) <= LOW_RATING;
    const ids = (await workersRepo.idsQualifiedFor(db, request.serviceCategoryId)).filter((id) => !excludeWorkerIds.has(id) && !ratedLow(id));
    if (ids.length === 0) return [];
    const [users, profiles, quals, slots, booked, experience] = await Promise.all([
      usersRepo.findByIds(db, ids),
      workersRepo.listProfiles(db, ids),
      workersRepo.qualifications(db, ids),
      workersRepo.availability(db, ids),
      workersRepo.bookedWindows(db, ids),
      workersRepo.completedInCategory(db, ids, request.serviceCategoryId),
    ]);
    const userById = new Map(users.map((u) => [u.id, u]));
    const expById = new Map(experience.map((e) => [e.workerId, e.n]));
    return profiles.map((p) => {
      const u = userById.get(p.userId);
      return {
        workerId: p.userId,
        displayName: u ? `${u.firstName} ${u.lastName.charAt(0)}.` : "Worker",
        latitude: p.latitude,
        longitude: p.longitude,
        serviceRadius: p.serviceRadius,
        rating: p.rating,
        ratingCount: p.ratingCount,
        completedJobs: p.completedJobs,
        completedJobsInCategory: expById.get(p.userId) ?? 0,
        availabilityStatus: p.availabilityStatus,
        verificationStatus: p.verificationStatus,
        qualifications: quals
          .filter((q) => q.workerId === p.userId)
          .map((q) => ({ serviceCategoryId: q.serviceCategoryId, qualificationLevel: q.qualificationLevel })),
        weeklyAvailability: slots
          .filter((s) => s.workerId === p.userId)
          .map((s) => ({ dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime })),
        bookedWindows: booked.filter((b) => b.workerId === p.userId).map(({ date, startTime, endTime }) => ({ date, startTime, endTime })),
        withCustomer: {
          completedJobs: history.get(p.userId)?.completedJobs ?? 0,
          lastRating: history.get(p.userId)?.lastRating ?? null,
        },
      };
    });
  }

  /** Ranks eligible workers for a request, without sending anything (admin view). */
  async preview(requestId: string): Promise<WorkerMatchDTO[]> {
    const request = await requestsRepo.get(this.ctx.db, requestId);
    if (!request) return [];
    const offers = await offersRepo.byRequest(this.ctx.db, requestId);
    const offered = new Set(offers.map((o) => o.workerId));
    const candidates = await this.buildCandidates(request, new Set());
    const names = new Map(candidates.map((c) => [c.workerId, c.displayName]));
    const matches = await this.ctx.matching.findMatches(await requestView(this.ctx, request), candidates);
    return matches.map((m) => ({ ...m, displayName: names.get(m.workerId) ?? "Worker", offered: offered.has(m.workerId) }));
  }

  /**
   * Sends offers for a SEARCHING request to workers who haven't been offered it
   * yet. Returns how many workers were notified.
   */
  async broadcast(requestId: string): Promise<number> {
    const { db, config, log } = this.ctx;
    const request = await requestsRepo.get(db, requestId);
    if (!request || request.status !== "SEARCHING") return 0;

    // Workers who already hold, accepted, declined, or let an offer expire are skipped; withdrawn ones are eligible again.
    const existing = await offersRepo.byRequest(db, requestId);
    const preferred = request.preferredWorkerId;
    // Give the preferred worker their full response window before anyone else is asked.
    if (preferred && existing.some((o) => o.workerId === preferred && o.status === "PENDING")) return 0;
    const skip = new Set(existing.filter((o) => o.status !== "WITHDRAWN").map((o) => o.workerId));
    const candidates = await this.buildCandidates(request, skip);
    let matches;
    try {
      matches = await this.ctx.matching.findMatches(await requestView(this.ctx, request), candidates);
    } catch (err) {
      log.error({ err, requestId }, "matching service failed");
      return 0;
    }
    const eligible = new Set(candidates.map((c) => c.workerId));
    const ranked = matches.filter((m) => eligible.has(m.workerId));
    // Rounds: [preferred worker alone] → top MATCH_INITIAL_OFFERS → everyone else who qualifies.
    const firstOpenRound = preferred ? 1 : 0;
    let chosen = ranked.slice(0, request.matchingRound <= firstOpenRound ? config.matchInitialOffers : Number.POSITIVE_INFINITY);
    if (preferred && request.matchingRound === 0) {
      const match = ranked.find((m) => m.workerId === preferred);
      if (match) chosen = [match];
      else await this.tellCustomerPreferredUnavailable(request);
    }

    const created = await offersRepo.createMany(
      db,
      chosen.map((m) => ({ requestId, workerId: m.workerId, score: m.score, distanceMiles: m.distance })),
    );
    await requestsRepo.update(db, requestId, { matchingRound: request.matchingRound + 1, lastMatchedAt: new Date() });

    const views = await offerViews(this.ctx, created);
    for (const offer of views) {
      this.notifier.emit([offer.workerId], "JOB_OFFERED", { offer });
      void this.notifier.notify(
        offer.workerId,
        "JOB_OFFERED",
        `New job: ${offer.serviceName}`,
        `${offer.requestedDate} at ${formatTime12h(offer.requestedStartTime)}${offer.distanceMiles != null ? ` · ${offer.distanceMiles} miles away` : ""}`,
        { offerId: offer.id, requestId },
      );
    }
    if (created.length > 0) {
      this.notifier.emit([request.customerId], "WORKER_MATCHED", {
        requestId,
        status: request.status,
        notifiedWorkerCount: created.length,
      });
    }
    log.info({ requestId, round: request.matchingRound, candidates: candidates.length, offered: created.length }, "broadcast offers");
    return created.length;
  }

  /** Offers created before this are past their response window. */
  offerCutoff(now = new Date()): Date {
    return new Date(now.getTime() - this.ctx.config.matchOfferTtlSeconds * 1000);
  }

  /**
   * Expires offers nobody responded to in time, tells those workers, and sends
   * any request left with no pending offers to the next workers. Called on an interval.
   */
  async expireOffers(now = new Date()): Promise<number> {
    const expired = await offersRepo.expireOlderThan(this.ctx.db, this.offerCutoff(now));
    for (const o of expired) {
      this.notifier.emit([o.workerId], "JOB_NO_LONGER_AVAILABLE", { requestId: o.requestId, offerId: o.id });
    }
    for (const requestId of new Set(expired.map((o) => o.requestId))) {
      const stillPending = (await offersRepo.byRequest(this.ctx.db, requestId)).some((o) => o.status === "PENDING");
      if (!stillPending) await this.broadcast(requestId);
    }
    if (expired.length) this.ctx.log.info({ expired: expired.length }, "expired unanswered offers");
    return expired.length;
  }

  private async tellCustomerPreferredUnavailable(request: ServiceRequestRow) {
    const worker = request.preferredWorkerId ? await usersRepo.findById(this.ctx.db, request.preferredWorkerId) : null;
    const name = worker?.firstName ?? "The helper you asked for";
    await this.notifier.notify(
      request.customerId,
      "PREFERRED_UNAVAILABLE",
      `${name} isn't available then, so we're asking other helpers too.`,
      null,
      { requestId: request.id },
    );
  }

  /** Re-broadcasts requests that have been searching too long. Called on an interval. */
  async expandStale(): Promise<void> {
    const before = new Date(Date.now() - this.ctx.config.matchExpandAfterSeconds * 1000);
    for (const r of await requestsRepo.stale(this.ctx.db, before)) {
      await this.broadcast(r.id);
    }
  }
}
