import { asc, eq } from "drizzle-orm";
import { conversations, messages, type ConversationRow, type Database } from "@handy/db";

export const conversationsRepo = {
  async create(db: Database, customerId: string) {
    const [row] = await db.insert(conversations).values({ customerId }).returning();
    return row!;
  },
  async get(db: Database, id: string) {
    const [row] = await db.select().from(conversations).where(eq(conversations.id, id));
    return row ?? null;
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
