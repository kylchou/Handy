import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import { API_PREFIX, type AIService, type ApiErrorBody, type MatchingService, type UserRole } from "@handy/contracts";
import { createDb, seed, type DbHandle } from "@handy/db";
import type { AppConfig } from "./config";
import { registerApiDocs } from "./docs/openapi";
import { loadIntegrations } from "./integrations";
import { ApiError } from "./lib/errors";
import { NominatimGeocoder, noGeocoder, type Geocoder } from "./lib/geocoder";
import { createRateLimits } from "./lib/rate-limits";
import { authenticate, newJti, requireRole, TokenRevocations } from "./middleware/auth";
import { adminRoutes } from "./routes/admin";
import { authRoutes } from "./routes/auth";
import { caregiverRoutes } from "./routes/caregivers";
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
  /** Defaults to OpenStreetMap, or no lookups when GEOCODER=off. */
  geocoder?: Geocoder;
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
  if (config.rateLimitEnabled) {
    // Off by default; only routes with `config.rateLimit` are limited. preHandler so the body is parsed.
    await app.register(rateLimit, {
      global: false,
      hook: "preHandler",
      errorResponseBuilder: (_req, ctx) =>
        new ApiError("RATE_LIMITED", "You're doing that a little too often. Please wait a moment and try again.", {
          retryAfterSeconds: Math.ceil(ctx.ttl / 1000),
        }),
    });
  }

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
    {
      db: dbHandle.db,
      config,
      bus,
      ai: integrations.ai,
      matching: integrations.matching,
      geocoder:
        opts.geocoder ??
        (config.geocoder === "off"
          ? noGeocoder
          : new NominatimGeocoder({
              contact: config.geocoderContact || "hackathon project",
              onError: (err) => app.log.warn({ err }, "address lookup failed"),
            })),
      log: app.log,
    },
    (actor) => {
      const token = app.jwt.sign({ sub: actor.id, role: actor.role, jti: newJti() });
      const { exp } = app.jwt.decode<{ exp: number }>(token)!;
      return { token, expiresAt: new Date(exp * 1000).toISOString() };
    },
  );

  const auth = authenticate(revocations);
  // Getters hand each route its own array: plugins like @fastify/rate-limit push
  // onto a route's preHandler list, which must never leak into other routes.
  const roles = (...r: UserRole[]) => [auth, requireRole(...r)];
  const guards: Guards = {
    get auth() {
      return [auth];
    },
    get customer() {
      return roles("CUSTOMER");
    },
    get worker() {
      return roles("WORKER");
    },
    get caregiver() {
      return roles("CAREGIVER");
    },
    get admin() {
      return roles("ADMIN");
    },
    get customerOrAdmin() {
      return roles("CUSTOMER", "ADMIN");
    },
    get workerOrAdmin() {
      return roles("WORKER", "ADMIN");
    },
    get jobParticipant() {
      return roles("CUSTOMER", "WORKER", "ADMIN");
    },
  };
  const deps: RouteDeps = { services, guards, limits: createRateLimits(app) };

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

  // Before any routes, so every route gets its docs attached.
  if (config.docsEnabled) await registerApiDocs(app);

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
      await api.register(caregiverRoutes, deps);
      await api.register(realtimeRoutes, { bus, revocations, corsOrigins: config.corsOrigins });
    },
    { prefix: API_PREFIX },
  );

  if (opts.backgroundJobs ?? true) {
    const interval = Math.max(5, Math.min(60, config.matchExpandAfterSeconds / 2, config.matchOfferTtlSeconds / 4)) * 1000;
    const timer = setInterval(() => {
      services.requests
        .expirePastRequests()
        .then(() => services.matching.expireOffers())
        .then(() => services.matching.expandStale())
        .then(() => services.jobs.sendReminders())
        .then(() => services.jobs.checkNoShows())
        .then(() => services.schedules.postUpcomingVisits())
        .catch((err) => app.log.error({ err }, "matching sweep failed"));
    }, interval);
    timer.unref();
    app.addHook("onClose", async () => clearInterval(timer));
  }
  app.addHook("onClose", async () => services.autopilot.stop());
  if (!opts.dbHandle) app.addHook("onClose", async () => dbHandle.close());

  return { app, services, bus, dbHandle };
}
