import type { FastifyInstance } from "fastify";
import { listJobsQuerySchema, listRequestsQuerySchema, setAutopilotSchema, updateVerificationSchema } from "@handy/contracts";
import { parse } from "../../lib/validate";
import type { IdParams, RouteDeps } from "../types";

export async function adminRoutes(app: FastifyInstance, { services, guards }: RouteDeps) {
  app.get("/admin/stats", { preHandler: guards.admin }, async () => services.admin.stats());

  app.get("/admin/requests", { preHandler: guards.admin }, async (req) => {
    const { status } = parse(listRequestsQuerySchema, req.query);
    return services.requests.list(req.user, status);
  });

  app.get("/admin/jobs", { preHandler: guards.admin }, async (req) => {
    const { status } = parse(listJobsQuerySchema, req.query);
    return services.jobs.list(req.user, status);
  });

  app.get("/admin/workers", { preHandler: guards.admin }, async () => services.admin.workers());

  app.get("/admin/customers", { preHandler: guards.admin }, async () => services.admin.customers());

  app.post("/admin/demo/reset", { preHandler: guards.admin }, async () => services.admin.resetDemo());

  app.get("/admin/demo/autopilot", { preHandler: guards.admin }, async () => services.autopilot.status());

  app.put("/admin/demo/autopilot", { preHandler: guards.admin }, async (req) => services.autopilot.set(parse(setAutopilotSchema, req.body)));

  app.patch<IdParams<"workerId">>("/admin/workers/:workerId/verification", { preHandler: guards.admin }, async (req) => {
    const { verificationStatus } = parse(updateVerificationSchema, req.body);
    return services.admin.setVerification(req.params.workerId, verificationStatus);
  });
}
