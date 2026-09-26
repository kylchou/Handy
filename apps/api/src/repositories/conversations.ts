import { asc, desc, eq, inArray } from "drizzle-orm";
import { conversations, messages, serviceRequests, type ConversationRow, type Database } from "@handy/db";

export const conversationsRepo = {
  async create(db: Database, customerId: string) {
    const [row] = await db.insert(conversations).values({ customerId }).returning();
    return row!;
  },
  async get(db: Database, id: string) {
    const [row] = await db.select().from(conversations).where(eq(conversations.id, id));
    return row ?? null;
  },
  async listByCustomer(db: Database, customerId: string, limit: number) {
    return db
      .select()
      .from(conversations)
      .where(eq(conversations.customerId, customerId))
      .orderBy(desc(conversations.updatedAt))
      .limit(limit);
  },
  /** Messages for several conversations, oldest first. */
  async messagesFor(db: Database, conversationIds: string[]) {
    if (conversationIds.length === 0) return [];
    return db
      .select()
      .from(messages)
      .where(inArray(messages.conversationId, conversationIds))
      .orderBy(asc(messages.createdAt), asc(messages.id));
  },
  /** conversationId -> service request id, for conversations that became a request. */
  async requestIdsFor(db: Database, conversationIds: string[]) {
    if (conversationIds.length === 0) return new Map<string, string>();
    const rows = await db
      .select({ id: serviceRequests.id, conversationId: serviceRequests.conversationId })
      .from(serviceRequests)
      .where(inArray(serviceRequests.conversationId, conversationIds));
    return new Map(rows.flatMap((r) => (r.conversationId ? [[r.conversationId, r.id] as const] : [])));
  },
  async update(db: Database, id: string, values: Partial<Omit<ConversationRow, "id" | "customerId" | "createdAt">>) {
    const [row] = await db.update(conversations).set(values).where(eq(conversations.id, id)).returning();
    return row!;
  },
  async addMessage(db: Database, values: typeof messages.$inferInsert) {
    const [row] = await db.insert(messages).values(values).returning();
    return row!;
  },
  async messages(db: Database, conversationId: string) {
    return db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.createdAt), asc(messages.id));
  },
};
