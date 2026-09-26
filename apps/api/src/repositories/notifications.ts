import { and, desc, eq, isNull } from "drizzle-orm";
import { notifications, type Database } from "@handy/db";

export const notificationsRepo = {
  async create(db: Database, values: typeof notifications.$inferInsert) {
    const [row] = await db.insert(notifications).values(values).returning();
    return row!;
  },
  async list(db: Database, userId: string, opts: { unreadOnly?: boolean; limit?: number } = {}) {
    const where = [eq(notifications.userId, userId)];
    if (opts.unreadOnly) where.push(isNull(notifications.readAt));
    return db
      .select()
      .from(notifications)
      .where(and(...where))
      .orderBy(desc(notifications.createdAt))
      .limit(opts.limit ?? 50);
  },
  async markRead(db: Database, userId: string, id: string) {
    const [row] = await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
      .returning();
    return row ?? null;
  },
  async markAllRead(db: Database, userId: string) {
    const rows = await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
      .returning({ id: notifications.id });
    return rows.length;
  },
};
