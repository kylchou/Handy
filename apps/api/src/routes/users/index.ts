import type { FastifyInstance } from "fastify";
import { updateUserSchema } from "@handy/contracts";
import { parse } from "../../lib/validate";
import type { RouteDeps } from "../types";

export async function userRoutes(app: FastifyInstance, { services, guards }: RouteDeps) {
  app.patch("/users/me", { preHandler: guards.auth }, async (req) => services.profiles.updateUser(req.user, parse(updateUserSchema, req.body)));
}
