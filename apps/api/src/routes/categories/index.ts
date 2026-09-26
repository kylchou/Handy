import type { FastifyInstance } from "fastify";
import type { RouteDeps } from "../types";

export async function categoryRoutes(app: FastifyInstance, { services }: RouteDeps) {
  app.get("/service-categories", async () => services.categories.list());
}
