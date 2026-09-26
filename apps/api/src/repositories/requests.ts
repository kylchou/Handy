import { and, desc, eq, inArray, lt, lte, or, sql, type SQL } from "drizzle-orm";
import { serviceRequests, type Database, type ServiceRequestRow } from "@handy/db";
import type { ServiceRequestStatus } from "@handy/contracts";

export const requestsRepo = {
  async create(db: Database, values: typeof serviceRequests.$inferInsert) {
    const [row] = await db.insert(serviceRequests).values(values).returning();
    return row!;
  },
  async get(db: Database, id: string) {
    const [row] = await db.select().from(serviceRequests).where(eq(serviceRequests.id, id));
    return row ?? null;
  },
  /** Locks the row for the rest of the transaction (first accept wins). */
  async getForUpdate(db: Database, id: string) {
    const [row] = await db.select().from(serviceRequests).where(eq(serviceRequests.id, id)).for("update");
    return row ?? null;
  },
  async getByConversation(db: Database, conversationId: string) {
    const [row] = await db.select().from(serviceRequests).where(eq(serviceRequests.conversationId, conversationId));
    return row ?? null;
  },
  async update(db: Database, id: string, values: Partial<Omit<ServiceRequestRow, "id" | "createdAt">>) {
    const [row] = await db.update(serviceRequests).set(values).where(eq(serviceRequests.id, id)).returning();
    return row!;
  },
  async list(db: Database, filter: { customerId?: string; status?: ServiceRequestStatus; ids?: string[] } = {}) {
    const where: SQL[] = [];
    if (filter.customerId) where.push(eq(serviceRequests.customerId, filter.customerId));
    if (filter.status) where.push(eq(serviceRequests.status, filter.status));
    if (filter.ids) {
      if (filter.ids.length === 0) return [];
      where.push(inArray(serviceRequests.id, filter.ids));
    }
    return db
      .select()
      .from(serviceRequests)
      .where(and(...where))
      .orderBy(desc(serviceRequests.createdAt));
  },
  /** SEARCHING requests whose time window ended before `today` at `nowTime`. */
  async searchingPastWindow(db: Database, today: string, nowTime: string) {
    return db
      .select()
      .from(serviceRequests)
      .where(
        and(
          eq(serviceRequests.status, "SEARCHING"),
          or(
            lt(serviceRequests.requestedDate, today),
            and(eq(serviceRequests.requestedDate, today), lte(serviceRequests.requestedEndTime, nowTime)),
          ),
        ),
      );
  },
  /** SEARCHING requests whose last broadcast is older than `before`. */
  async stale(db: Database, before: Date) {
    return db
      .select()
      .from(serviceRequests)
      .where(
        and(
          eq(serviceRequests.status, "SEARCHING"),
          lt(sql`coalesce(${serviceRequests.lastMatchedAt}, ${serviceRequests.createdAt})`, before),
        ),
      );
  },
};
