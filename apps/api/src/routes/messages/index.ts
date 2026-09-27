import type { FastifyInstance } from "fastify";
import { sendJobMessageSchema, sendVoiceMessageSchema } from "@handy/contracts";
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

  // Recordings are sent as base64 JSON, so allow a bigger body than the default 1 MB.
  app.post<IdParams<"jobId">>("/jobs/:jobId/messages/voice", { preHandler: guards.auth, bodyLimit: 2 * 1024 * 1024 }, async (req, reply) => {
    const message = await services.jobs.sendVoiceMessage(req.user, req.params.jobId, parse(sendVoiceMessageSchema, req.body));
    reply.code(201);
    return message;
  });

  app.get<{ Params: { jobId: string; messageId: string } }>("/jobs/:jobId/messages/:messageId/audio", { preHandler: guards.auth }, async (req) =>
    services.jobs.voiceAudio(req.user, req.params.jobId, req.params.messageId),
  );
}
