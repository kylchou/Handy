import { and, asc, between, desc, eq, inArray, isNull, ne, or, type SQL } from "drizzle-orm";
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
  /** ACCEPTED jobs between two dates that still have a reminder to send (or skip). */
  async awaitingReminders(db: Database, fromDate: string, toDate: string) {
    return db
      .select({ job: jobs, request: serviceRequests })
      .from(jobs)
      .innerJoin(serviceRequests, eq(serviceRequests.id, jobs.requestId))
      .where(
        and(
          eq(jobs.status, "ACCEPTED"),
          or(isNull(jobs.dayReminderSentAt), isNull(jobs.hourReminderSentAt)),
          between(serviceRequests.requestedDate, fromDate, toDate),
        ),
      );
  },
  /** Marks a reminder as handled. Returns false if another sweep already claimed it. */
  async claimReminder(db: Database, jobId: string, kind: "day" | "hour", at: Date) {
    const column = kind === "day" ? jobs.dayReminderSentAt : jobs.hourReminderSentAt;
    const rows = await db
      .update(jobs)
      .set(kind === "day" ? { dayReminderSentAt: at } : { hourReminderSentAt: at })
      .where(and(eq(jobs.id, jobId), isNull(column)))
      .returning({ id: jobs.id });
    return rows.length > 0;
  },
  /** ACCEPTED jobs between two dates that haven't been checked for a no-show yet. */
  async awaitingNoShowCheck(db: Database, fromDate: string, toDate: string) {
    return db
      .select({ job: jobs, request: serviceRequests })
      .from(jobs)
      .innerJoin(serviceRequests, eq(serviceRequests.id, jobs.requestId))
      .where(and(eq(jobs.status, "ACCEPTED"), isNull(jobs.noShowAlertedAt), between(serviceRequests.requestedDate, fromDate, toDate)));
  },
  /** Returns false if another sweep already flagged it. */
  async claimNoShow(db: Database, jobId: string, at: Date) {
    const rows = await db
      .update(jobs)
      .set({ noShowAlertedAt: at })
      .where(and(eq(jobs.id, jobId), isNull(jobs.noShowAlertedAt), eq(jobs.status, "ACCEPTED")))
      .returning({ id: jobs.id });
    return rows.length > 0;
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
