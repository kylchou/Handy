import type { FastifyInstance } from "fastify";
import { sendConversationMessageSchema } from "@handy/contracts";
import { parse } from "../../lib/validate";
import type { IdParams, RouteDeps } from "../types";

/** AI assistant conversations. The frontend never calls the LLM directly. */
export async function conversationRoutes(app: FastifyInstance, { services, guards, limits }: RouteDeps) {
  app.post("/ai/conversations", { preHandler: guards.customer, config: { rateLimit: limits.newConversation } }, async (req, reply) => {
    reply.code(201);
    return services.conversations.create(req.user);
  });

  app.get<IdParams<"conversationId">>("/ai/conversations/:conversationId", { preHandler: guards.customerOrAdmin }, async (req) =>
    services.conversations.get(req.user, req.params.conversationId),
  );

  app.post<IdParams<"conversationId">>("/ai/conversations/:conversationId/messages", { preHandler: guards.customer, config: { rateLimit: limits.aiMessage } }, async (req) => {
    const { content } = parse(sendConversationMessageSchema, req.body);
    return services.conversations.sendMessage(req.user, req.params.conversationId, content);
  });
}
