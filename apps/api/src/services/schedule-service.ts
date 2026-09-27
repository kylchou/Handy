import type { RecurringScheduleDTO } from "@handy/contracts";
import type { RecurringScheduleRow } from "@handy/db";
import { forbidden, notFound } from "../lib/errors";
import { estimatePriceCents } from "../lib/pricing";
import { addDays, formatTime12h, friendlyDate, repeatDays, todayIn } from "../lib/time";
import { categoriesRepo } from "../repositories/categories";
import { requestsRepo } from "../repositories/requests";
import { schedulesRepo } from "../repositories/schedules";
import { Notifier, type Actor, type ServiceContext } from "./context";
import type { MatchingOrchestrator } from "./matching-orchestrator";

/** How many days ahead each visit gets posted, so there's time to find someone. */
const DAYS_AHEAD = 3;

export function toScheduleDTO(s: RecurringScheduleRow): RecurringScheduleDTO {
  return {
    id: s.id,
    customerId: s.customerId,
    frequency: s.frequency,
    serviceCategoryId: s.serviceCategoryId,
    description: s.description,
    location: s.location,
    dayOfWeek: s.dayOfWeek,
    startTime: s.startTime,
    endTime: s.endTime,
    preferredWorkerId: s.preferredWorkerId,
    nextDate: s.nextDate,
    active: s.active,
    createdAt: s.createdAt.toISOString(),
  };
}

/** Repeating requests ("mow my lawn every Saturday"). */
export class ScheduleService {
  private notifier: Notifier;

  constructor(
    private ctx: ServiceContext,
    private matching: MatchingOrchestrator,
  ) {
    this.notifier = new Notifier(ctx);
  }

  async list(actor: Actor): Promise<RecurringScheduleDTO[]> {
    return (await schedulesRepo.forCustomer(this.ctx.db, actor.id)).map(toScheduleDTO);
  }

  async stop(actor: Actor, scheduleId: string): Promise<RecurringScheduleDTO> {
    const schedule = await schedulesRepo.get(this.ctx.db, scheduleId);
    if (!schedule) throw notFound("Repeating request");
    if (schedule.customerId !== actor.id) throw forbidden();
    return toScheduleDTO(await schedulesRepo.update(this.ctx.db, scheduleId, { active: false }));
  }

  /**
   * Posts each upcoming visit a few days before it happens and sends it to
   * workers. Visits missed while the server was down are skipped, not posted
   * late. Called on an interval.
   */
  async postUpcomingVisits(now = new Date()): Promise<number> {
    const { db, config } = this.ctx;
    const today = todayIn(config.timezone, now);
    const due = await schedulesRepo.dueBy(db, addDays(today, DAYS_AHEAD));
    if (due.length === 0) return 0;
    const categories = new Map((await categoriesRepo.list(db)).map((c) => [c.id, c]));
    let posted = 0;

    for (const s of due) {
      const request = await db.transaction(async (tx) => {
        const locked = await schedulesRepo.getForUpdate(tx, s.id);
        if (!locked?.active || locked.nextDate > addDays(today, DAYS_AHEAD)) return null; // handled by another sweep
        let date = locked.nextDate;
        while (date < today) date = addDays(date, repeatDays(locked.frequency));
        await schedulesRepo.update(tx, s.id, { nextDate: addDays(date, repeatDays(locked.frequency)) });
        if (date > addDays(today, DAYS_AHEAD)) return null; // caught up on missed ones, next visit isn't due yet

        const category = categories.get(locked.serviceCategoryId);
        return requestsRepo.create(tx, {
          customerId: locked.customerId,
          scheduleId: locked.id,
          serviceCategoryId: locked.serviceCategoryId,
          description: locked.description,
          location: locked.location,
          latitude: locked.latitude,
          longitude: locked.longitude,
          requestedDate: date,
          requestedStartTime: locked.startTime,
          requestedEndTime: locked.endTime,
          urgency: locked.urgency,
          specialRequirements: locked.specialRequirements,
          preferredWorkerId: locked.preferredWorkerId,
          status: "SEARCHING",
          estimatedPriceCents: estimatePriceCents(category?.basePriceCents ?? 0, locked.urgency),
          platformFeeCents: config.platformFeeCents,
          tipCents: locked.tipCents,
        });
      });
      if (!request) continue;
      posted++;

      const service = categories.get(request.serviceCategoryId)?.name.toLowerCase() ?? "visit";
      const every = s.frequency === "WEEKLY" ? "weekly" : "every-other-week";
      this.notifier.emit([request.customerId], "REQUEST_CREATED", { requestId: request.id, status: request.status });
      await this.notifier.notify(
        request.customerId,
        "REQUEST_CREATED",
        `We're finding someone for your ${every} ${service} on ${friendlyDate(request.requestedDate)}.`,
        `Around ${formatTime12h(request.requestedStartTime)}. You can cancel just this one, or stop the whole thing in your settings.`,
        { requestId: request.id, scheduleId: s.id },
      );
      await this.matching.broadcast(request.id);
    }
    if (posted) this.ctx.log.info({ posted }, "posted repeating visits");
    return posted;
  }
}
