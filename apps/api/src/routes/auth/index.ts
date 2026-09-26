import type { FastifyInstance } from "fastify";
import { loginSchema, signupSchema } from "@handy/contracts";
import { parse } from "../../lib/validate";
import type { TokenRevocations } from "../../middleware/auth";
import type { RouteDeps } from "../types";

export async function authRoutes(
  app: FastifyInstance,
  { services, guards, limits, revocations }: RouteDeps & { revocations: TokenRevocations },
) {
  app.post("/auth/signup", { config: { rateLimit: limits.signup } }, async (req, reply) => {
    const body = parse(signupSchema, req.body);
    reply.code(201);
    return services.auth.signup(body);
  });

  app.post("/auth/login", { config: { rateLimit: limits.login } }, async (req) => services.auth.login(parse(loginSchema, req.body)));

  app.post("/auth/logout", { preHandler: guards.auth }, async (req, reply) => {
    revocations.revoke(req.user.jti, req.user.exp);
    reply.code(204);
  });

  app.get("/auth/me", { preHandler: guards.auth }, async (req) => services.auth.me(req.user));
}
