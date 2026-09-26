import type { ConversationState } from "./types.js";

/** Conversation state between turns. No direct DB access; backend can pass Redis/Postgres store, in-memory fine for demo. */
export interface ConversationStore {
  get(conversationId: string): Promise<ConversationState | undefined>;
  save(state: ConversationState): Promise<void>;
  delete(conversationId: string): Promise<void>;
}

export class InMemoryConversationStore implements ConversationStore {
  private readonly states = new Map<string, ConversationState>();

  async get(conversationId: string): Promise<ConversationState | undefined> {
    const state = this.states.get(conversationId);
    return state ? structuredClone(state) : undefined;
  }

  async save(state: ConversationState): Promise<void> {
    this.states.set(state.conversationId, structuredClone(state));
  }

  async delete(conversationId: string): Promise<void> {
    this.states.delete(conversationId);
  }
}
