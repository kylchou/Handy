import type { FastifyInstance } from "fastify";
import { sendJobMessageSchema } from "@handy/contracts";
import { parse } from "../../lib/validate";
import type { IdParams, RouteDeps } from "../types";

/** Customer-worker chat on an accepted job, so phone numbers are never exchanged. */
export async function messageRoutes(app: FastifyInstance, { services, guards }: RouteDeps) {
  app.get<IdParams<"jobId">>("/jobs/:jobId/messages", { preHandler: guards.auth }, async (req) =>
    services.jobs.messages(req.user, req.params.jobId),
  );

  app.post<IdParams<"jobId">>("/jobs/:jobId/messages", { preHandler: guards.auth }, async (req, reply) => {
    const { content } = parse(sendJobMessageSchema, req.body);
    const message = await services.jobs.sendMessage(req.user, req.params.jobId, content);
    reply.code(201);
    return message;
  });
}
