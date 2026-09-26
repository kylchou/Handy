import { count, eq, inArray } from "drizzle-orm";
import { customerProfiles, serviceRequests, users, type Database, type UserRow } from "@handy/db";
import type { UserRole } from "@handy/contracts";

export const usersRepo = {
  async findById(db: Database, id: string) {
    const [row] = await db.select().from(users).where(eq(users.id, id));
    return row ?? null;
  },
  async findByEmail(db: Database, email: string) {
    const [row] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
    return row ?? null;
  },
  async findByIds(db: Database, ids: string[]) {
    if (ids.length === 0) return [];
    return db.select().from(users).where(inArray(users.id, ids));
  },
  async create(db: Database, values: typeof users.$inferInsert) {
    const [row] = await db.insert(users).values(values).returning();
    return row!;
  },
  async update(db: Database, id: string, values: Partial<Pick<UserRow, "firstName" | "lastName" | "phone">>) {
    const [row] = await db.update(users).set(values).where(eq(users.id, id)).returning();
    return row ?? null;
  },
  async listByRole(db: Database, role: UserRole) {
    return db.select().from(users).where(eq(users.role, role)).orderBy(users.createdAt);
  },
  async countByRole(db: Database, role: UserRole) {
    const [row] = await db.select({ n: count() }).from(users).where(eq(users.role, role));
    return row?.n ?? 0;
  },
};

export const customerProfilesRepo = {
  async get(db: Database, userId: string) {
    const [row] = await db.select().from(customerProfiles).where(eq(customerProfiles.userId, userId));
    return row ?? null;
  },
  async upsert(db: Database, userId: string, values: Partial<typeof customerProfiles.$inferInsert>) {
    const [row] = await db
      .insert(customerProfiles)
      .values({ ...values, userId })
      .onConflictDoUpdate({ target: customerProfiles.userId, set: values })
      .returning();
    return row!;
  },
  async listAll(db: Database) {
    return db.select().from(customerProfiles);
  },
  async requestCounts(db: Database) {
    const rows = await db
      .select({ customerId: serviceRequests.customerId, status: serviceRequests.status, n: count() })
      .from(serviceRequests)
      .groupBy(serviceRequests.customerId, serviceRequests.status);
    return rows;
  },
};
