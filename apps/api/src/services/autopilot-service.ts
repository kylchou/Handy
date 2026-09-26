import type { AutopilotStatusDTO, JobStatus, SetAutopilotBody } from "@handy/contracts";
import type { JobRow } from "@handy/db";
import { forbidden } from "../lib/errors";
import { jobsRepo } from "../repositories/jobs";
import { offersRepo } from "../repositories/offers";
import type { ServiceContext } from "./context";
import type { JobService } from "./job-service";

const NEXT: Partial<Record<JobStatus, JobStatus>> = {
  ACCEPTED: "EN_ROUTE",
  EN_ROUTE: "ARRIVED",
  ARRIVED: "IN_PROGRESS",
  IN_PROGRESS: "COMPLETED",
};

/**
 * Plays the worker's side of the demo so one person can show the whole flow
 * from the customer app. While it's on, new requests get accepted by the best
 * matched worker, then moved along one step every `stepSeconds`.
 *
 * With `hold` on, jobs it accepts wait at ACCEPTED until hold is turned off,
 * so the presenter can talk through the job page first.
 *
 * Everything goes through the normal JobService calls as that worker (it even
 * enters the arrival code), so the customer sees exactly what they would with
 * a real person. Only requests made after it's turned on are touched. State is
 * kept in memory, so a restart turns it off.
 */
export class DemoAutopilot {
  private enabled = false;
  private stepSeconds = 8;
  private hold = false;
  private since = new Date();
  private jobIds = new Set<string>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private ctx: ServiceContext,
    private jobs: JobService,
  ) {}

  status(): AutopilotStatusDTO {
    return { enabled: this.enabled, stepSeconds: this.stepSeconds, hold: this.hold, activeJobIds: [...this.jobIds] };
  }

  set(body: SetAutopilotBody, opts: { timer?: boolean } = {}): AutopilotStatusDTO {
    if (!this.ctx.config.allowDemoReset) throw forbidden("Demo tools are turned off on this server.");
    if (body.stepSeconds) this.stepSeconds = body.stepSeconds;
    if (body.hold !== undefined) this.hold = body.hold;
    if (body.enabled && !this.enabled) {
      this.since = new Date();
      this.jobIds.clear();
      if (opts.timer ?? true) {
        this.timer = setInterval(() => void this.tick(), 1000);
        this.timer.unref();
      }
    }
    if (!body.enabled) this.stop();
    this.enabled = body.enabled;
    this.ctx.log.info({ enabled: this.enabled, stepSeconds: this.stepSeconds, hold: this.hold }, "demo autopilot changed");
    return this.status();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.enabled = false;
  }

  /** One pass. Jobs move first so one it just accepted waits a full step before heading out. */
  async tick(now = new Date()): Promise<void> {
    if (!this.enabled || this.running) return;
    this.running = true;
    try {
      await this.advanceJobs(now);
      await this.acceptWaiting(now);
    } catch (err) {
      this.ctx.log.error({ err }, "demo autopilot failed");
    } finally {
      this.running = false;
    }
  }

  private async acceptWaiting(now: Date) {
    const waitedLongEnough = new Date(now.getTime() - this.stepSeconds * 1000);
    const offers = await offersRepo.pendingForNewRequests(this.ctx.db, this.since, waitedLongEnough);
    const handled = new Set<string>();
    // Offers come best first, so the top worker for each request gets it. If they
    // can't take it (say they're already booked then), the next one tries.
    for (const offer of offers) {
      if (handled.has(offer.requestId)) continue;
      try {
        const job = await this.jobs.accept({ id: offer.workerId, role: "WORKER" }, offer.id);
        this.jobIds.add(job.id);
        handled.add(offer.requestId);
      } catch (err) {
        this.ctx.log.info({ offerId: offer.id, reason: (err as Error).message }, "autopilot couldn't accept, trying the next worker");
      }
    }
  }

  private async advanceJobs(now: Date) {
    for (const jobId of [...this.jobIds]) {
      const job = await jobsRepo.get(this.ctx.db, jobId);
      const next = job && NEXT[job.status];
      if (!job || !next) {
        this.jobIds.delete(jobId); // finished, cancelled, or wiped by a demo reset
        continue;
      }
      if (this.hold && job.status === "ACCEPTED") continue;
      if (now.getTime() - lastChange(job) < this.stepSeconds * 1000) continue;
      try {
        await this.jobs.updateStatus({ id: job.workerId, role: "WORKER" }, job.id, next, { arrivalCode: job.arrivalCode ?? undefined });
      } catch (err) {
        this.ctx.log.warn({ jobId, next, reason: (err as Error).message }, "autopilot couldn't move the job along");
      }
    }
  }
}

function lastChange(job: JobRow): number {
  return Math.max(...[job.acceptedAt, job.enRouteAt, job.arrivedAt, job.startedAt].map((d) => d?.getTime() ?? 0));
}
