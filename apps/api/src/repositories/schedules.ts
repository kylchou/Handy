import { and, asc, eq, lte } from "drizzle-orm";
import { recurringSchedules, type Database, type RecurringScheduleRow } from "@handy/db";

export const schedulesRepo = {
  async create(db: Database, values: typeof recurringSchedules.$inferInsert) {
    const [row] = await db.insert(recurringSchedules).values(values).returning();
    return row!;
  },
  async get(db: Database, id: string) {
    const [row] = await db.select().from(recurringSchedules).where(eq(recurringSchedules.id, id));
    return row ?? null;
  },
  async getForUpdate(db: Database, id: string) {
    const [row] = await db.select().from(recurringSchedules).where(eq(recurringSchedules.id, id)).for("update");
    return row ?? null;
  },
  async forCustomer(db: Database, customerId: string) {
    return db.select().from(recurringSchedules).where(eq(recurringSchedules.customerId, customerId)).orderBy(asc(recurringSchedules.createdAt));
  },
  /** Active schedules whose next visit is on or before `date`. */
  async dueBy(db: Database, date: string) {
    return db
      .select()
      .from(recurringSchedules)
      .where(and(eq(recurringSchedules.active, true), lte(recurringSchedules.nextDate, date)));
  },
  async update(db: Database, id: string, values: Partial<Omit<RecurringScheduleRow, "id" | "customerId" | "createdAt">>) {
    const [row] = await db.update(recurringSchedules).set(values).where(eq(recurringSchedules.id, id)).returning();
    return row!;
  },
};
