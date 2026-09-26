import type { FastifyInstance } from "fastify";
import type { RealtimeEvent, RealtimeHello } from "@handy/contracts";
import { verifyToken, type TokenRevocations } from "../middleware/auth";
import type { EventBus } from "./event-bus";

const HEARTBEAT_MS = 25_000;

/**
 * Realtime transports. Both authenticate with `?token=<jwt>` because browsers
 * can't set headers on EventSource/WebSocket.
 *   GET /api/v1/events — Server-Sent Events (EventSource); each message is a JSON RealtimeEvent.
 *   GET /api/v1/ws     — WebSocket; each message is a JSON RealtimeEvent.
 */
export async function realtimeRoutes(
  app: FastifyInstance,
  opts: { bus: EventBus; revocations: TokenRevocations; corsOrigins: string[] },
) {
  const { bus, revocations, corsOrigins } = opts;

  app.get<{ Querystring: { token?: string } }>("/events", async (request, reply) => {
    const actor = verifyToken(app, revocations, request.query.token);
    reply.hijack();
    const res = reply.raw;
    const headers: Record<string, string> = {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    };
    // reply.hijack() bypasses @fastify/cors, so apply the allow-list here.
    const origin = request.headers.origin;
    if (origin && corsOrigins.includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
    res.writeHead(200, headers);
    const write = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`);
    const hello: RealtimeHello = { type: "CONNECTED", userId: actor.id };
    write(hello);

    const unsubscribe = bus.subscribe(actor.id, (e: RealtimeEvent) => write(e), { all: actor.role === "ADMIN" });
    const heartbeat = setInterval(() => res.write(": ping\n\n"), HEARTBEAT_MS);
    request.raw.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  app.get<{ Querystring: { token?: string } }>("/ws", { websocket: true }, (socket, request) => {
    let actor;
    try {
      actor = verifyToken(app, revocations, request.query.token);
    } catch {
      socket.close(4401, "Unauthenticated");
      return;
    }
    const hello: RealtimeHello = { type: "CONNECTED", userId: actor.id };
    socket.send(JSON.stringify(hello));
    const unsubscribe = bus.subscribe(actor.id, (e) => socket.send(JSON.stringify(e)), { all: actor.role === "ADMIN" });
    const heartbeat = setInterval(() => socket.ping(), HEARTBEAT_MS);
    socket.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });
}
