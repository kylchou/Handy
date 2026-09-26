import { and, asc, desc, eq, inArray, ne, type SQL } from "drizzle-orm";
import { jobMessages, jobs, ratings, serviceRequests, type Database, type JobRow } from "@handy/db";
import type { JobStatus } from "@handy/contracts";

export const jobsRepo = {
  async create(db: Database, values: typeof jobs.$inferInsert) {
    const [row] = await db.insert(jobs).values(values).returning();
    return row!;
  },
  async get(db: Database, id: string) {
    const [row] = await db.select().from(jobs).where(eq(jobs.id, id));
    return row ?? null;
  },
  async getForUpdate(db: Database, id: string) {
    const [row] = await db.select().from(jobs).where(eq(jobs.id, id)).for("update");
    return row ?? null;
  },
  /** The non-cancelled job for each request, if any. */
  async activeForRequests(db: Database, requestIds: string[]) {
    if (requestIds.length === 0) return [];
    return db
      .select()
      .from(jobs)
      .where(and(inArray(jobs.requestId, requestIds), ne(jobs.status, "CANCELLED")));
  },
  async update(db: Database, id: string, values: Partial<Omit<JobRow, "id" | "requestId" | "createdAt">>) {
    const [row] = await db.update(jobs).set(values).where(eq(jobs.id, id)).returning();
    return row!;
  },
  async list(db: Database, filter: { workerId?: string; customerId?: string; status?: JobStatus } = {}) {
    const where: SQL[] = [];
    if (filter.workerId) where.push(eq(jobs.workerId, filter.workerId));
    if (filter.customerId) where.push(eq(serviceRequests.customerId, filter.customerId));
    if (filter.status) where.push(eq(jobs.status, filter.status));
    const rows = await db
      .select({ job: jobs })
      .from(jobs)
      .innerJoin(serviceRequests, eq(serviceRequests.id, jobs.requestId))
      .where(and(...where))
      .orderBy(desc(jobs.createdAt));
    return rows.map((r) => r.job);
  },
};

export const jobMessagesRepo = {
  async create(db: Database, values: typeof jobMessages.$inferInsert) {
    const [row] = await db.insert(jobMessages).values(values).returning();
    return row!;
  },
  async list(db: Database, jobId: string) {
    return db
      .select()
      .from(jobMessages)
      .where(eq(jobMessages.jobId, jobId))
      .orderBy(asc(jobMessages.createdAt), asc(jobMessages.id));
  },
};

export const ratingsRepo = {
  async create(db: Database, values: typeof ratings.$inferInsert) {
    const [row] = await db.insert(ratings).values(values).returning();
    return row!;
  },
  async byJobs(db: Database, jobIds: string[]) {
    if (jobIds.length === 0) return [];
    return db.select().from(ratings).where(inArray(ratings.jobId, jobIds));
  },
  async byWorker(db: Database, workerId: string) {
    return db.select().from(ratings).where(eq(ratings.workerId, workerId)).orderBy(desc(ratings.createdAt));
  },
};
