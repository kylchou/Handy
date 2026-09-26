import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { jobOffers, serviceRequests, type Database, type JobOfferRow } from "@handy/db";

export const offersRepo = {
  /** Creates offers; a previously WITHDRAWN offer to the same worker is re-opened. */
  async createMany(db: Database, rows: Array<typeof jobOffers.$inferInsert>) {
    if (rows.length === 0) return [];
    return db
      .insert(jobOffers)
      .values(rows)
      .onConflictDoUpdate({
        target: [jobOffers.requestId, jobOffers.workerId],
        set: {
          status: "PENDING",
          score: sql`excluded.score`,
          distanceMiles: sql`excluded.distance_miles`,
          createdAt: sql`now()`,
          respondedAt: null,
        },
        setWhere: eq(jobOffers.status, "WITHDRAWN"),
      })
      .returning();
  },
  async get(db: Database, id: string) {
    const [row] = await db.select().from(jobOffers).where(eq(jobOffers.id, id));
    return row ?? null;
  },
  async byRequest(db: Database, requestId: string) {
    return db.select().from(jobOffers).where(eq(jobOffers.requestId, requestId)).orderBy(desc(jobOffers.score));
  },
  async pendingForWorker(db: Database, workerId: string) {
    return db
      .select()
      .from(jobOffers)
      .where(and(eq(jobOffers.workerId, workerId), eq(jobOffers.status, "PENDING")))
      .orderBy(desc(jobOffers.createdAt));
  },
  /** A worker's pending offers along with each request's date and time window. */
  async pendingWithWindows(db: Database, workerId: string) {
    return db
      .select({
        id: jobOffers.id,
        requestId: jobOffers.requestId,
        date: serviceRequests.requestedDate,
        startTime: serviceRequests.requestedStartTime,
        endTime: serviceRequests.requestedEndTime,
      })
      .from(jobOffers)
      .innerJoin(serviceRequests, eq(serviceRequests.id, jobOffers.requestId))
      .where(and(eq(jobOffers.workerId, workerId), eq(jobOffers.status, "PENDING")));
  },
  async withdraw(db: Database, ids: string[]) {
    if (ids.length === 0) return [];
    return db
      .update(jobOffers)
      .set({ status: "WITHDRAWN", respondedAt: new Date() })
      .where(and(inArray(jobOffers.id, ids), eq(jobOffers.status, "PENDING")))
      .returning();
  },
  async pendingCounts(db: Database, requestIds: string[]) {
    const map = new Map<string, number>();
    if (requestIds.length === 0) return map;
    const rows = await db
      .select({ requestId: jobOffers.requestId })
      .from(jobOffers)
      .where(and(inArray(jobOffers.requestId, requestIds), eq(jobOffers.status, "PENDING")));
    for (const r of rows) map.set(r.requestId, (map.get(r.requestId) ?? 0) + 1);
    return map;
  },
  async update(db: Database, id: string, values: Partial<Pick<JobOfferRow, "status" | "respondedAt">>) {
    const [row] = await db.update(jobOffers).set(values).where(eq(jobOffers.id, id)).returning();
    return row!;
  },
  /** Withdraws every pending offer on a request except `keepOfferId`; returns what was withdrawn. */
  async withdrawPending(db: Database, requestId: string, keepOfferId?: string) {
    const conds = [eq(jobOffers.requestId, requestId), eq(jobOffers.status, "PENDING")];
    if (keepOfferId) conds.push(ne(jobOffers.id, keepOfferId));
    return db
      .update(jobOffers)
      .set({ status: "WITHDRAWN", respondedAt: new Date() })
      .where(and(...conds))
      .returning();
  },
};
