import type { FastifyInstance } from "fastify";
import { createServiceRequestSchema, listRequestsQuerySchema } from "@handy/contracts";
import { parse } from "../../lib/validate";
import type { IdParams, RouteDeps } from "../types";

export async function requestRoutes(app: FastifyInstance, { services, guards }: RouteDeps) {
  // Called when the customer taps "Confirm Request" on the AI summary card.
  app.post("/requests", { preHandler: guards.customer }, async (req, reply) => {
    const result = await services.requests.create(req.user, parse(createServiceRequestSchema, req.body));
    reply.code(201);
    return result;
  });

  app.get("/requests", { preHandler: guards.customerOrAdmin }, async (req) => {
    const { status } = parse(listRequestsQuerySchema, req.query);
    return services.requests.list(req.user, status);
  });

  app.get<IdParams<"requestId">>("/requests/:requestId", { preHandler: guards.auth }, async (req) =>
    services.requests.get(req.user, req.params.requestId),
  );

  app.post<IdParams<"requestId">>("/requests/:requestId/cancel", { preHandler: guards.customerOrAdmin }, async (req) =>
    services.requests.cancel(req.user, req.params.requestId),
  );
}
