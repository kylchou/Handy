import type { FastifyInstance } from "fastify";
import { acceptCaregiverInviteSchema } from "@handy/contracts";
import { parse } from "../../lib/validate";
import type { IdParams, RouteDeps } from "../types";

/** Linking family members to a customer, and the caregiver's read-only dashboard. */
export async function caregiverRoutes(app: FastifyInstance, { services, guards, limits }: RouteDeps) {
  // Customer side
  app.post("/customers/me/caregivers/invite", { preHandler: guards.customer }, async (req, reply) => {
    reply.code(201);
    return services.caregivers.createInvite(req.user);
  });

  app.get("/customers/me/caregivers", { preHandler: guards.customer }, async (req) => services.caregivers.listCaregivers(req.user));

  app.delete<IdParams<"caregiverId">>("/customers/me/caregivers/:caregiverId", { preHandler: guards.customer }, async (req, reply) => {
    await services.caregivers.removeCaregiver(req.user, req.params.caregiverId);
    reply.code(204);
  });

  // Caregiver side
  app.post("/caregivers/me/links", { preHandler: guards.caregiver, config: { rateLimit: limits.caregiverInvite } }, async (req, reply) => {
    const { code } = parse(acceptCaregiverInviteSchema, req.body);
    reply.code(201);
    return services.caregivers.acceptInvite(req.user, code);
  });

  app.get("/caregivers/me/people", { preHandler: guards.caregiver }, async (req) => services.caregivers.people(req.user));

  app.delete<IdParams<"customerId">>("/caregivers/me/people/:customerId", { preHandler: guards.caregiver }, async (req, reply) => {
    await services.caregivers.unlinkSelf(req.user, req.params.customerId);
    reply.code(204);
  });
}
