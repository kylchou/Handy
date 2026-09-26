import { and, count, eq, gte, inArray } from "drizzle-orm";
import { jobs, resetDemoData, serviceRequests, workerProfiles } from "@handy/db";
import {
  ACTIVE_JOB_STATUSES,
  type AdminCustomerDTO,
  type AdminStatsDTO,
  type AdminWorkerDTO,
  type VerificationStatus,
  type WorkerProfileDTO,
} from "@handy/contracts";
import { forbidden, notFound } from "../lib/errors";
import { todayIn } from "../lib/time";
import { customerProfilesRepo, usersRepo } from "../repositories/users";
import { workersRepo } from "../repositories/workers";
import type { ServiceContext } from "./context";
import { toCustomerProfileDTO, toUserDTO, toWorkerProfileDTO } from "./mappers";

export class AdminService {
  constructor(private ctx: ServiceContext) {}

  async stats(): Promise<AdminStatsDTO> {
    const { db, config } = this.ctx;
    const since = new Date(Date.now() - 36 * 60 * 60 * 1000);
    const [[activeRequests], [activeJobs], [availableWorkers], recentCompleted, totalCustomers, totalWorkers] = await Promise.all([
      db.select({ n: count() }).from(serviceRequests).where(eq(serviceRequests.status, "SEARCHING")),
      db.select({ n: count() }).from(jobs).where(inArray(jobs.status, ACTIVE_JOB_STATUSES)),
      db
        .select({ n: count() })
        .from(workerProfiles)
        .where(and(eq(workerProfiles.availabilityStatus, "AVAILABLE"), eq(workerProfiles.verificationStatus, "VERIFIED"))),
      db.select({ completedAt: jobs.completedAt }).from(jobs).where(and(eq(jobs.status, "COMPLETED"), gte(jobs.completedAt, since))),
      usersRepo.countByRole(db, "CUSTOMER"),
      usersRepo.countByRole(db, "WORKER"),
    ]);
    const today = todayIn(config.timezone);
    return {
      activeRequests: activeRequests?.n ?? 0,
      activeJobs: activeJobs?.n ?? 0,
      availableWorkers: availableWorkers?.n ?? 0,
      completedToday: recentCompleted.filter((j) => j.completedAt && todayIn(config.timezone, j.completedAt) === today).length,
      totalCustomers,
      totalWorkers,
    };
  }

  async workers(): Promise<AdminWorkerDTO[]> {
    const { db } = this.ctx;
    const users = await usersRepo.listByRole(db, "WORKER");
    const ids = users.map((u) => u.id);
    const [profiles, quals, slots, active] = await Promise.all([
      workersRepo.listProfiles(db, ids),
      workersRepo.qualifications(db, ids),
      workersRepo.availability(db, ids),
      workersRepo.activeJobCounts(db),
    ]);
    const profileById = new Map(profiles.map((p) => [p.userId, p]));
    const activeById = new Map(active.map((a) => [a.workerId, a.n]));
    return users.flatMap((u) => {
      const p = profileById.get(u.id);
      return p ? [{ ...toUserDTO(u), profile: toWorkerProfileDTO(p, quals, slots), activeJobCount: activeById.get(u.id) ?? 0 }] : [];
    });
  }

  async customers(): Promise<AdminCustomerDTO[]> {
    const { db } = this.ctx;
    const [users, profiles, counts] = await Promise.all([
      usersRepo.listByRole(db, "CUSTOMER"),
      customerProfilesRepo.listAll(db),
      customerProfilesRepo.requestCounts(db),
    ]);
    const profileById = new Map(profiles.map((p) => [p.userId, p]));
    return users.map((u) => {
      const mine = counts.filter((c) => c.customerId === u.id);
      const p = profileById.get(u.id);
      return {
        ...toUserDTO(u),
        profile: p ? toCustomerProfileDTO(p) : null,
        requestCount: mine.reduce((s, c) => s + c.n, 0),
        openRequestCount: mine.filter((c) => c.status === "SEARCHING" || c.status === "MATCHED").reduce((s, c) => s + c.n, 0),
      };
    });
  }

  /** Restores the seeded demo state and tells every open app to reload. */
  async resetDemo(): Promise<{ ok: true }> {
    if (!this.ctx.config.allowDemoReset) throw forbidden("Demo reset is turned off on this server.");
    await resetDemoData(this.ctx.db);
    this.ctx.bus.broadcast({ type: "DEMO_RESET", at: new Date().toISOString(), data: {} });
    this.ctx.log.warn("demo data was reset");
    return { ok: true };
  }

  async setVerification(workerId: string, verificationStatus: VerificationStatus): Promise<WorkerProfileDTO> {
    const { db } = this.ctx;
    const p = await workersRepo.updateProfile(db, workerId, { verificationStatus });
    if (!p) throw notFound("Worker");
    const [quals, slots] = await Promise.all([workersRepo.qualifications(db, [workerId]), workersRepo.availability(db, [workerId])]);
    return toWorkerProfileDTO(p, quals, slots);
  }
}
