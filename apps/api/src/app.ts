import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import websocket from "@fastify/websocket";
import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import { API_PREFIX, type AIService, type ApiErrorBody, type MatchingService } from "@handy/contracts";
import { createDb, seed, type DbHandle } from "@handy/db";
import type { AppConfig } from "./config";
import { loadIntegrations } from "./integrations";
import { ApiError } from "./lib/errors";
import { authenticate, newJti, requireRole, TokenRevocations } from "./middleware/auth";
import { adminRoutes } from "./routes/admin";
import { authRoutes } from "./routes/auth";
import { categoryRoutes } from "./routes/categories";
import { conversationRoutes } from "./routes/conversations";
import { customerRoutes } from "./routes/customers";
import { jobRoutes } from "./routes/jobs";
import { matchingRoutes } from "./routes/matching";
import { messageRoutes } from "./routes/messages";
import { notificationRoutes } from "./routes/notifications";
import { ratingRoutes } from "./routes/ratings";
import { requestRoutes } from "./routes/requests";
import type { Guards, RouteDeps } from "./routes/types";
import { userRoutes } from "./routes/users";
import { workerRoutes } from "./routes/workers";
import { createServices, type Services } from "./services";
import { EventBus } from "./websocket/event-bus";
import { realtimeRoutes } from "./websocket/routes";

export interface BuildAppOptions {
  config: AppConfig;
  /** Provide an open database (tests); otherwise one is opened from config.databaseUrl. */
  dbHandle?: DbHandle;
  ai?: AIService;
  matching?: MatchingService;
  logger?: FastifyServerOptions["logger"];
  /** Periodically widen the search for requests nobody has accepted. Default true. */
  backgroundJobs?: boolean;
}

export interface App {
  app: FastifyInstance;
  services: Services;
  bus: EventBus;
  dbHandle: DbHandle;
}

export async function buildApp(opts: BuildAppOptions): Promise<App> {
  const { config } = opts;
  const app = Fastify({ logger: opts.logger ?? true, trustProxy: true });

  const dbHandle = opts.dbHandle ?? (await createDb(config.databaseUrl));
  if (!opts.dbHandle) {
    await dbHandle.migrate();
    if (config.seedOnStart) await seed(dbHandle.db, (msg) => app.log.info(msg));
  }

  const integrations =
    opts.ai && opts.matching
      ? { ai: opts.ai, matching: opts.matching }
      : await loadIntegrations({ ai: config.aiServiceModule, matching: config.matchingServiceModule }, app.log);

  const bus = new EventBus();
  const revocations = new TokenRevocations();

  await app.register(cors, { origin: config.corsOrigins, credentials: true, methods: ["GET", "POST", "PUT", "PATCH", "DELETE"] });
  await app.register(jwt, {
    secret: config.jwtSecret,
    sign: { expiresIn: config.jwtExpiresIn },
    formatUser: (p) => ({ id: p.sub, role: p.role, jti: p.jti, exp: (p as { exp?: number }).exp }),
  });
  await app.register(websocket);

  // Treat an empty JSON body as {} so action endpoints like POST /requests/:id/cancel work with any client.
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
    if (body === "" || body == null) return done(null, {});
    try {
      done(null, JSON.parse(body as string));
    } catch {
      done(new ApiError("BAD_REQUEST", "The request body isn't valid JSON."), undefined);
    }
  });

  const services = createServices(
    { db: dbHandle.db, config, bus, ai: integrations.ai, matching: integrations.matching, log: app.log },
    (actor) => {
      const token = app.jwt.sign({ sub: actor.id, role: actor.role, jti: newJti() });
      const { exp } = app.jwt.decode<{ exp: number }>(token)!;
      return { token, expiresAt: new Date(exp * 1000).toISOString() };
    },
  );

  const auth = authenticate(revocations);
  const guards: Guards = {
    auth: [auth],
    customer: [auth, requireRole("CUSTOMER")],
    worker: [auth, requireRole("WORKER")],
    admin: [auth, requireRole("ADMIN")],
    customerOrAdmin: [auth, requireRole("CUSTOMER", "ADMIN")],
    workerOrAdmin: [auth, requireRole("WORKER", "ADMIN")],
  };
  const deps: RouteDeps = { services, guards };

  app.setErrorHandler((err, req, reply) => {
    let body: ApiErrorBody;
    let status: number;
    if (err instanceof ApiError) {
      status = err.statusCode;
      body = { error: { code: err.code, message: err.message, ...(err.details !== undefined && { details: err.details }) } };
    } else if (typeof (err as { statusCode?: number }).statusCode === "number" && (err as { statusCode: number }).statusCode < 500) {
      status = (err as { statusCode: number }).statusCode;
      body = { error: { code: "BAD_REQUEST", message: (err as Error).message } };
    } else {
      req.log.error({ err }, "unhandled error");
      status = 500;
      body = { error: { code: "INTERNAL_ERROR", message: "Something went wrong on our end. Please try again." } };
    }
    reply.status(status).send(body);
  });

  app.setNotFoundHandler((req, reply) => {
    const body: ApiErrorBody = { error: { code: "NOT_FOUND", message: `No route for ${req.method} ${req.url}` } };
    reply.status(404).send(body);
  });

  app.get("/health", async () => ({ ok: true, db: dbHandle.driver, realtimeConnections: bus.connectionCount() }));

  await app.register(
    async (api) => {
      await api.register(authRoutes, { ...deps, revocations });
      await api.register(userRoutes, deps);
      await api.register(categoryRoutes, deps);
      await api.register(customerRoutes, deps);
      await api.register(workerRoutes, deps);
      await api.register(conversationRoutes, deps);
      await api.register(requestRoutes, deps);
      await api.register(matchingRoutes, deps);
      await api.register(jobRoutes, deps);
      await api.register(messageRoutes, deps);
      await api.register(ratingRoutes, deps);
      await api.register(notificationRoutes, deps);
      await api.register(adminRoutes, deps);
      await api.register(realtimeRoutes, { bus, revocations, corsOrigins: config.corsOrigins });
    },
    { prefix: API_PREFIX },
  );

  if (opts.backgroundJobs ?? true) {
    const interval = Math.max(10, Math.min(60, config.matchExpandAfterSeconds / 2)) * 1000;
    const timer = setInterval(() => {
      services.matching.expandStale().catch((err) => app.log.error({ err }, "expandStale failed"));
    }, interval);
    timer.unref();
    app.addHook("onClose", async () => clearInterval(timer));
  }
  if (!opts.dbHandle) app.addHook("onClose", async () => dbHandle.close());

  return { app, services, bus, dbHandle };
}
