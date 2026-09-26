import type { FastifyInstance } from "fastify";
import type { RealtimeEvent, RealtimeHello, RealtimeMessage, RealtimeResync } from "@handy/contracts";
import { verifyToken, type TokenRevocations } from "../middleware/auth";
import type { EventBus } from "./event-bus";

const HEARTBEAT_MS = 25_000;

type Query = { token?: string; lastEventId?: string };

/**
 * Realtime transports. Both authenticate with `?token=<jwt>` because browsers
 * can't set headers on EventSource/WebSocket.
 *   GET /api/v1/events — Server-Sent Events (EventSource); each message is a JSON RealtimeMessage.
 *   GET /api/v1/ws     — WebSocket; each message is a JSON RealtimeMessage.
 *
 * On connect the server sends CONNECTED, then any events missed since the
 * client's last event id (Last-Event-ID header for SSE, ?lastEventId= for
 * either), or RESYNC if those can't be recovered, then live events.
 */
export async function realtimeRoutes(
  app: FastifyInstance,
  opts: { bus: EventBus; revocations: TokenRevocations; corsOrigins: string[] },
) {
  const { bus, revocations, corsOrigins } = opts;

  /** Missed events (or RESYNC) followed by a live subscription. Runs synchronously so nothing slips in between. */
  function start(actor: { id: string; role: string }, lastEventId: string | undefined, send: (msg: RealtimeMessage) => void) {
    const all = actor.role === "ADMIN";
    const missed = lastEventId ? bus.replay(actor.id, lastEventId, { all }) : [];
    const hello: RealtimeHello = { type: "CONNECTED", userId: actor.id, replayed: missed?.length ?? 0 };
    send(hello);
    if (missed === null) send({ type: "RESYNC" } satisfies RealtimeResync);
    else for (const e of missed) send(e);
    return bus.subscribe(actor.id, (e: RealtimeEvent) => send(e), { all });
  }

  app.get<{ Querystring: Query }>("/events", async (request, reply) => {
    const actor = verifyToken(app, revocations, request.query.token);
    const header = request.headers["last-event-id"];
    const lastEventId = (Array.isArray(header) ? header[0] : header) || request.query.lastEventId;

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

    // The `id:` line is what makes the browser send Last-Event-ID when it reconnects.
    const send = (msg: RealtimeMessage) => res.write(`${"id" in msg ? `id: ${msg.id}\n` : ""}data: ${JSON.stringify(msg)}\n\n`);
    const unsubscribe = start(actor, lastEventId, send);
    const heartbeat = setInterval(() => res.write(": ping\n\n"), HEARTBEAT_MS);
    request.raw.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  app.get<{ Querystring: Query }>("/ws", { websocket: true }, (socket, request) => {
    let actor;
    try {
      actor = verifyToken(app, revocations, request.query.token);
    } catch {
      socket.close(4401, "Unauthenticated");
      return;
    }
    const unsubscribe = start(actor, request.query.lastEventId, (msg) => socket.send(JSON.stringify(msg)));
    const heartbeat = setInterval(() => socket.ping(), HEARTBEAT_MS);
    socket.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });
}
