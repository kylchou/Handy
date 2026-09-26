import type { FastifyInstance } from "fastify";
import { updateCustomerProfileSchema } from "@handy/contracts";
import { parse } from "../../lib/validate";
import type { IdParams, RouteDeps } from "../types";

export async function customerRoutes(app: FastifyInstance, { services, guards }: RouteDeps) {
  app.get("/customers/me/profile", { preHandler: guards.customer }, async (req) => services.profiles.getCustomerProfile(req.user));

  app.put("/customers/me/profile", { preHandler: guards.customer }, async (req) =>
    services.profiles.updateCustomerProfile(req.user, parse(updateCustomerProfileSchema, req.body)),
  );

  app.get("/customers/me/history", { preHandler: guards.customer }, async (req) => services.profiles.customerHistory(req.user.id));

  app.get("/customers/me/past-workers", { preHandler: guards.customer }, async (req) => services.profiles.pastWorkers(req.user.id));

  app.get("/customers/me/schedules", { preHandler: guards.customer }, async (req) => services.schedules.list(req.user));

  app.delete<IdParams<"scheduleId">>("/customers/me/schedules/:scheduleId", { preHandler: guards.customer }, async (req) =>
    services.schedules.stop(req.user, req.params.scheduleId),
  );
}
