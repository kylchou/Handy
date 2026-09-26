import type { FastifyInstance } from "fastify";
import type { IdParams, RouteDeps } from "../types";

export async function notificationRoutes(app: FastifyInstance, { services, guards }: RouteDeps) {
  app.get<{ Querystring: { unread?: string } }>("/notifications", { preHandler: guards.auth }, async (req) =>
    services.notifications.list(req.user, req.query.unread === "true"),
  );

  app.post<IdParams<"notificationId">>("/notifications/:notificationId/read", { preHandler: guards.auth }, async (req) =>
    services.notifications.markRead(req.user, req.params.notificationId),
  );

  app.post("/notifications/read-all", { preHandler: guards.auth }, async (req) => services.notifications.markAllRead(req.user));
}
