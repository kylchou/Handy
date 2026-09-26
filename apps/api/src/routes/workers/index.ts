import type { FastifyInstance } from "fastify";
import { updateAvailabilitySchema, updateQualificationsSchema, updateWorkerProfileSchema } from "@handy/contracts";
import { parse } from "../../lib/validate";
import type { IdParams, RouteDeps } from "../types";

export async function workerRoutes(app: FastifyInstance, { services, guards }: RouteDeps) {
  app.get("/workers/me/profile", { preHandler: guards.worker }, async (req) => services.profiles.getWorkerProfile(req.user.id));

  app.put("/workers/me/profile", { preHandler: guards.worker }, async (req) =>
    services.profiles.updateWorkerProfile(req.user, parse(updateWorkerProfileSchema, req.body)),
  );

  app.put("/workers/me/qualifications", { preHandler: guards.worker }, async (req) =>
    services.profiles.updateQualifications(req.user, parse(updateQualificationsSchema, req.body)),
  );

  app.put("/workers/me/availability", { preHandler: guards.worker }, async (req) =>
    services.profiles.updateAvailability(req.user, parse(updateAvailabilitySchema, req.body)),
  );

  app.get("/workers/me/earnings", { preHandler: guards.worker }, async (req) => services.profiles.earnings(req.user));

  // Customer-safe worker profile: first name + last initial, rating, services.
  app.get<IdParams<"workerId">>("/workers/:workerId", { preHandler: guards.auth }, async (req) =>
    services.profiles.publicWorker(req.params.workerId),
  );

  app.get<IdParams<"workerId">>("/workers/:workerId/ratings", { preHandler: guards.auth }, async (req) =>
    services.profiles.workerRatings(req.params.workerId),
  );
}
