import type { FastifyInstance } from "fastify";
import { listJobsQuerySchema, updateJobStatusSchema } from "@handy/contracts";
import { parse } from "../../lib/validate";
import type { IdParams, RouteDeps } from "../types";

export async function jobRoutes(app: FastifyInstance, { services, guards }: RouteDeps) {
  // Worker marketplace: open offers for the logged-in worker.
  app.get("/jobs/available", { preHandler: guards.worker }, async (req) => services.jobs.available(req.user));

  app.post<IdParams<"offerId">>("/jobs/offers/:offerId/accept", { preHandler: guards.worker }, async (req) =>
    services.jobs.accept(req.user, req.params.offerId),
  );

  app.post<IdParams<"offerId">>("/jobs/offers/:offerId/decline", { preHandler: guards.worker }, async (req) =>
    services.jobs.decline(req.user, req.params.offerId),
  );

  app.get("/jobs", { preHandler: guards.auth }, async (req) => {
    const { status } = parse(listJobsQuerySchema, req.query);
    return services.jobs.list(req.user, status);
  });

  app.get<IdParams<"jobId">>("/jobs/:jobId", { preHandler: guards.auth }, async (req) => services.jobs.get(req.user, req.params.jobId));

  app.patch<IdParams<"jobId">>("/jobs/:jobId/status", { preHandler: guards.auth }, async (req) => {
    const { status, reason } = parse(updateJobStatusSchema, req.body);
    return services.jobs.updateStatus(req.user, req.params.jobId, status, reason);
  });
}
