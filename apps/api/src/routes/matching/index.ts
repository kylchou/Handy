import type { FastifyInstance } from "fastify";
import type { IdParams, RouteDeps } from "../types";

export async function matchingRoutes(app: FastifyInstance, { services, guards }: RouteDeps) {
  // Ranked candidates with scores and reasons, for the admin dashboard and demos.
  app.get<IdParams<"requestId">>("/requests/:requestId/matches", { preHandler: guards.customerOrAdmin }, async (req) =>
    services.requests.matches(req.user, req.params.requestId),
  );
}
