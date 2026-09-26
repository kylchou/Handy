import { and, eq } from "drizzle-orm";
import { caregiverInvites, caregiverLinks, type Database } from "@handy/db";

export const caregiversRepo = {
  async createInvite(db: Database, values: typeof caregiverInvites.$inferInsert) {
    const [row] = await db.insert(caregiverInvites).values(values).returning();
    return row!;
  },
  async getInviteForUpdate(db: Database, code: string) {
    const [row] = await db.select().from(caregiverInvites).where(eq(caregiverInvites.code, code)).for("update");
    return row ?? null;
  },
  async markInviteUsed(db: Database, code: string) {
    await db.update(caregiverInvites).set({ usedAt: new Date() }).where(eq(caregiverInvites.code, code));
  },
  /** Creates the link, or returns the existing one if they're already linked. */
  async link(db: Database, customerId: string, caregiverId: string) {
    await db.insert(caregiverLinks).values({ customerId, caregiverId }).onConflictDoNothing();
    const [row] = await db
      .select()
      .from(caregiverLinks)
      .where(and(eq(caregiverLinks.customerId, customerId), eq(caregiverLinks.caregiverId, caregiverId)));
    return row!;
  },
  /** Returns whether a link was removed. */
  async unlink(db: Database, customerId: string, caregiverId: string) {
    const rows = await db
      .delete(caregiverLinks)
      .where(and(eq(caregiverLinks.customerId, customerId), eq(caregiverLinks.caregiverId, caregiverId)))
      .returning();
    return rows.length > 0;
  },
  async caregiversOf(db: Database, customerId: string) {
    return db.select().from(caregiverLinks).where(eq(caregiverLinks.customerId, customerId)).orderBy(caregiverLinks.createdAt);
  },
  async customersOf(db: Database, caregiverId: string) {
    return db.select().from(caregiverLinks).where(eq(caregiverLinks.caregiverId, caregiverId)).orderBy(caregiverLinks.createdAt);
  },
};
