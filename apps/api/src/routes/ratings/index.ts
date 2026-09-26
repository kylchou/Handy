import type { FastifyInstance } from "fastify";
import { createRatingSchema } from "@handy/contracts";
import { parse } from "../../lib/validate";
import type { IdParams, RouteDeps } from "../types";

export async function ratingRoutes(app: FastifyInstance, { services, guards }: RouteDeps) {
  app.post<IdParams<"jobId">>("/jobs/:jobId/rating", { preHandler: guards.customer }, async (req, reply) => {
    const rating = await services.jobs.rate(req.user, req.params.jobId, parse(createRatingSchema, req.body));
    reply.code(201);
    return rating;
  });
}
