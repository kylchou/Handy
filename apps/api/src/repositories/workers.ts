import { and, count, eq, inArray } from "drizzle-orm";
import {
  jobs,
  serviceRequests,
  users,
  workerAvailability,
  workerProfiles,
  workerQualifications,
  type Database,
  type WorkerProfileRow,
} from "@handy/db";
import { ACTIVE_JOB_STATUSES, type ServiceCategoryCode } from "@handy/contracts";

export const workersRepo = {
  async getProfile(db: Database, userId: string) {
    const [row] = await db.select().from(workerProfiles).where(eq(workerProfiles.userId, userId));
    return row ?? null;
  },
  /** Locks the worker's profile row so their accepts are handled one at a time. */
  async lockProfile(db: Database, userId: string) {
    const [row] = await db.select().from(workerProfiles).where(eq(workerProfiles.userId, userId)).for("update");
    return row ?? null;
  },
  async listProfiles(db: Database, userIds?: string[]) {
    if (userIds && userIds.length === 0) return [];
    const q = db.select().from(workerProfiles);
    return userIds ? q.where(inArray(workerProfiles.userId, userIds)) : q;
  },
  async createProfile(db: Database, values: typeof workerProfiles.$inferInsert) {
    const [row] = await db.insert(workerProfiles).values(values).returning();
    return row!;
  },
  async updateProfile(db: Database, userId: string, values: Partial<Omit<WorkerProfileRow, "userId">>) {
    if (Object.keys(values).length === 0) return workersRepo.getProfile(db, userId);
    const [row] = await db.update(workerProfiles).set(values).where(eq(workerProfiles.userId, userId)).returning();
    return row ?? null;
  },
  async qualifications(db: Database, workerIds: string[]) {
    if (workerIds.length === 0) return [];
    return db.select().from(workerQualifications).where(inArray(workerQualifications.workerId, workerIds));
  },
  async replaceQualifications(db: Database, workerId: string, rows: Array<Omit<typeof workerQualifications.$inferInsert, "workerId">>) {
    await db.delete(workerQualifications).where(eq(workerQualifications.workerId, workerId));
    if (rows.length) await db.insert(workerQualifications).values(rows.map((r) => ({ ...r, workerId })));
  },
  async availability(db: Database, workerIds: string[]) {
    if (workerIds.length === 0) return [];
    return db
      .select()
      .from(workerAvailability)
      .where(inArray(workerAvailability.workerId, workerIds))
      .orderBy(workerAvailability.dayOfWeek, workerAvailability.startTime);
  },
  async replaceAvailability(db: Database, workerId: string, slots: Array<{ dayOfWeek: number; startTime: string; endTime: string }>) {
    await db.delete(workerAvailability).where(eq(workerAvailability.workerId, workerId));
    if (slots.length) await db.insert(workerAvailability).values(slots.map((s) => ({ ...s, workerId })));
  },
  /** Worker ids that list the category among their services. */
  async idsQualifiedFor(db: Database, category: ServiceCategoryCode) {
    const rows = await db
      .select({ workerId: workerQualifications.workerId })
      .from(workerQualifications)
      .innerJoin(users, eq(users.id, workerQualifications.workerId))
      .where(eq(workerQualifications.serviceCategoryId, category));
    return rows.map((r) => r.workerId);
  },
  /** Active jobs' time windows per worker (for double-booking checks). */
  async bookedWindows(db: Database, workerIds: string[]) {
    if (workerIds.length === 0) return [];
    return db
      .select({
        workerId: jobs.workerId,
        date: serviceRequests.requestedDate,
        startTime: serviceRequests.requestedStartTime,
        endTime: serviceRequests.requestedEndTime,
      })
      .from(jobs)
      .innerJoin(serviceRequests, eq(serviceRequests.id, jobs.requestId))
      .where(and(inArray(jobs.workerId, workerIds), inArray(jobs.status, ACTIVE_JOB_STATUSES)));
  },
  async completedInCategory(db: Database, workerIds: string[], category: ServiceCategoryCode) {
    if (workerIds.length === 0) return [];
    return db
      .select({ workerId: jobs.workerId, n: count() })
      .from(jobs)
      .innerJoin(serviceRequests, eq(serviceRequests.id, jobs.requestId))
      .where(and(inArray(jobs.workerId, workerIds), eq(jobs.status, "COMPLETED"), eq(serviceRequests.serviceCategoryId, category)))
      .groupBy(jobs.workerId);
  },
  async activeJobCounts(db: Database) {
    return db
      .select({ workerId: jobs.workerId, n: count() })
      .from(jobs)
      .where(inArray(jobs.status, ACTIVE_JOB_STATUSES))
      .groupBy(jobs.workerId);
  },
};
