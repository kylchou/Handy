import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ApiRequestError, createApiClient, type ApiClient, type RealtimeEvent } from "@handy/contracts";
import { createDb, DEMO_PASSWORD, seed, type DbHandle } from "@handy/db";
import { buildApp, type App } from "../src/app";
import { loadConfig } from "../src/config";
import { addDays, todayIn } from "../src/lib/time";

let server: App;
let handle: DbHandle;
let baseUrl: string;

const client = (): ApiClient => createApiClient({ baseUrl });

beforeAll(async () => {
  handle = await createDb("pglite://memory");
  await handle.migrate();
  await seed(handle.db, () => {});
  server = await buildApp({
    config: loadConfig({ seedOnStart: false, jwtSecret: "client-test", aiServiceModule: "", matchingServiceModule: "" }),
    dbHandle: handle,
    logger: false,
    backgroundJobs: false,
  });
  baseUrl = await server.app.listen({ port: 0, host: "127.0.0.1" });
});

afterAll(async () => {
  await server.app.close();
  await handle.close();
});

describe("API client", () => {
  it("runs the demo flow end to end over HTTP", async () => {
    const saved: Array<string | null> = [];
    const margaret = createApiClient({ baseUrl, onTokenChange: (t) => saved.push(t) });
    const james = client();

    await margaret.auth.login({ email: "margaret@handy.demo", password: DEMO_PASSWORD });
    await james.auth.login({ email: "james@handy.demo", password: DEMO_PASSWORD });
    expect(saved).toHaveLength(1);
    expect(margaret.getToken()).toBe(saved[0]);
    expect((await margaret.auth.me()).user.firstName).toBe("Margaret");

    // Live updates for Margaret over WebSocket.
    const events: RealtimeEvent[] = [];
    await new Promise<void>((resolve) => {
      const stop = margaret.realtime.subscribe((e) => events.push(e), { transport: "ws", onOpen: resolve });
      afterAll(stop);
    });

    const { conversation } = await margaret.conversations.create();
    await margaret.conversations.sendMessage(conversation.id, "I need someone to help me move a couch tomorrow afternoon.");
    await margaret.conversations.sendMessage(conversation.id, "Around 3.");
    const turn = await margaret.conversations.sendMessage(conversation.id, "Yes, at my home please.");
    expect(turn.conversation.readyToSubmit).toBe(true);

    const { request } = await margaret.requests.create({ conversationId: conversation.id });
    expect(request.requestedDate).toBe(addDays(todayIn("America/New_York"), 1));

    const offer = (await james.jobs.available()).find((o) => o.requestId === request.id)!;
    const job = await james.jobs.acceptOffer(offer.id);
    expect(job.arrivalCode).toBeNull();
    const { arrivalCode } = await margaret.jobs.get(job.id);
    await james.jobs.updateStatus(job.id, "EN_ROUTE");
    await james.jobs.arrive(job.id, arrivalCode!);
    await james.jobs.updateStatus(job.id, "IN_PROGRESS");
    await james.jobs.updateStatus(job.id, "COMPLETED");
    const rating = await margaret.jobs.rate(job.id, { score: 5, comment: "Great" });
    expect(rating.score).toBe(5);
    expect((await margaret.customers.history()).find((h) => h.requestId === request.id)?.rating).toBe(5);

    await new Promise((r) => setTimeout(r, 100));
    expect(events.map((e) => e.type)).toEqual(
      expect.arrayContaining(["REQUEST_CREATED", "JOB_ACCEPTED", "WORKER_EN_ROUTE", "WORKER_ARRIVED", "JOB_COMPLETED"]),
    );
  });

  it("throws ApiRequestError with the server's code and message", async () => {
    const margaret = client();
    await margaret.auth.login({ email: "margaret@handy.demo", password: DEMO_PASSWORD });

    const err = await margaret.jobs.available().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect((err as ApiRequestError).status).toBe(403);
    expect((err as ApiRequestError).code).toBe("FORBIDDEN");

    await expect(client().auth.login({ email: "margaret@handy.demo", password: "wrong" })).rejects.toThrow(
      "That email and password don't match our records.",
    );
  });

  it("calls onUnauthorized and clears the token on logout", async () => {
    const unauthorized: string[] = [];
    const api = createApiClient({ baseUrl, onUnauthorized: (e) => unauthorized.push(e.code) });
    await api.auth.login({ email: "james@handy.demo", password: DEMO_PASSWORD });
    const oldToken = api.getToken();
    await api.auth.logout();
    expect(api.getToken()).toBeNull();

    api.setToken(oldToken);
    await expect(api.auth.me()).rejects.toMatchObject({ status: 401 });
    expect(unauthorized).toEqual(["UNAUTHENTICATED"]);
  });

  it("reports a friendly network error when the server is unreachable", async () => {
    const api = createApiClient({ baseUrl: "http://127.0.0.1:1" });
    await expect(api.categories.list()).rejects.toMatchObject({ status: 0, code: "NETWORK_ERROR" });
  });

  describe("missed live events", () => {
    async function newRequest(api: ApiClient) {
      const { conversation } = await api.conversations.create();
      const { request } = await api.requests.create({
        conversationId: conversation.id,
        serviceCategoryId: "ERRANDS",
        description: "Pick up prescriptions",
        location: "123 Main Street, Atlanta, GA",
        requestedDate: addDays(todayIn("America/New_York"), 2),
        requestedStartTime: "12:00",
      });
      return request.id;
    }

    /** Opens a raw WebSocket and collects parsed messages. */
    function openSocket(url: string) {
      const messages: Array<{ type: string; id?: string; replayed?: number; data?: { requestId?: string } }> = [];
      const ws = new WebSocket(url);
      ws.onmessage = (e) => messages.push(JSON.parse(String(e.data)));
      const opened = new Promise<void>((r) => (ws.onopen = () => r()));
      return { ws, messages, opened };
    }
    const until = async (check: () => boolean) => {
      for (let i = 0; i < 50 && !check(); i++) await new Promise((r) => setTimeout(r, 20));
    };

    it("replays what a WebSocket client missed while disconnected", async () => {
      const margaret = client();
      await margaret.auth.login({ email: "margaret@handy.demo", password: DEMO_PASSWORD });

      const first = openSocket(margaret.realtime.websocketUrl());
      await first.opened;
      const requestId = await newRequest(margaret);
      await until(() => first.messages.some((m) => m.type === "REQUEST_CREATED"));
      const lastSeen = first.messages.findLast((m) => m.id)!.id!;
      first.ws.close();

      // This happens while nobody is connected.
      await margaret.requests.cancel(requestId);

      const second = openSocket(margaret.realtime.websocketUrl(lastSeen));
      await until(() => second.messages.length >= 2);
      second.ws.close();
      expect(second.messages[0]).toMatchObject({ type: "CONNECTED", replayed: 1 });
      expect(second.messages[1]).toMatchObject({ type: "REQUEST_CANCELLED", data: { requestId } });
    });

    it("replays over SSE using the Last-Event-ID header", async () => {
      const margaret = client();
      await margaret.auth.login({ email: "margaret@handy.demo", password: DEMO_PASSWORD });
      const before = openSocket(margaret.realtime.websocketUrl());
      await before.opened;
      const requestId = await newRequest(margaret);
      await until(() => before.messages.some((m) => m.type === "REQUEST_CREATED"));
      const lastSeen = before.messages.findLast((m) => m.id)!.id!;
      before.ws.close();
      await margaret.requests.cancel(requestId);

      const abort = new AbortController();
      const res = await fetch(margaret.realtime.eventsUrl(), { headers: { "Last-Event-ID": lastSeen }, signal: abort.signal });
      const reader = res.body!.getReader();
      let text = "";
      while (!text.includes("REQUEST_CANCELLED")) text += new TextDecoder().decode((await reader.read()).value);
      abort.abort();
      expect(text).toContain('"replayed":1');
      expect(text).toMatch(/id: \w+:\d+\ndata: \{[^\n]*"REQUEST_CANCELLED"/);
    });

    it("asks the client to resync when the gap can't be replayed", async () => {
      const margaret = client();
      await margaret.auth.login({ email: "margaret@handy.demo", password: DEMO_PASSWORD });
      const s = openSocket(margaret.realtime.websocketUrl("deadbeef:5"));
      await until(() => s.messages.length >= 2);
      s.ws.close();
      expect(s.messages.map((m) => m.type)).toEqual(["CONNECTED", "RESYNC"]);
    });

    it("the client reconnects by itself and doesn't lose events", async () => {
      const margaret = client();
      await margaret.auth.login({ email: "margaret@handy.demo", password: DEMO_PASSWORD });

      // Wrap the global WebSocket so the test can see (and drop) the client's connections.
      const RealWS = globalThis.WebSocket;
      const sockets: WebSocket[] = [];
      const urls: string[] = [];
      globalThis.WebSocket = class extends RealWS {
        constructor(url: string | URL) {
          super(url);
          urls.push(String(url));
          sockets.push(this);
        }
      } as typeof WebSocket;

      const events: RealtimeEvent[] = [];
      let opens = 0;
      const stop = margaret.realtime.subscribe((e) => events.push(e), { transport: "ws", onOpen: () => opens++ });
      try {
        await until(() => opens === 1);
        const requestId = await newRequest(margaret);
        await until(() => events.some((e) => e.type === "REQUEST_CREATED"));

        sockets[0]!.close(); // connection drops
        await margaret.requests.cancel(requestId); // happens while it's down

        await until(() => events.some((e) => e.type === "REQUEST_CANCELLED"));
        expect(opens).toBe(2);
        expect(urls[1]).toContain("lastEventId=");
        expect(events.filter((e) => e.type === "REQUEST_CANCELLED")).toHaveLength(1);
      } finally {
        stop();
        globalThis.WebSocket = RealWS;
      }
    });
  });

  it("resets the demo data without logging anyone out", async () => {
    const admin = client();
    const margaret = client();
    const james = client();
    await admin.auth.login({ email: "admin@handy.demo", password: DEMO_PASSWORD });
    await margaret.auth.login({ email: "margaret@handy.demo", password: DEMO_PASSWORD });
    await james.auth.login({ email: "james@handy.demo", password: DEMO_PASSWORD });
    const newbie = client();
    await newbie.auth.signup({ role: "CUSTOMER", firstName: "Temp", lastName: "User", email: "temp@example.com", password: "longenough1" });

    // The demo flow above changed James's stats and Margaret's history.
    expect((await james.workers.getProfile()).completedJobs).toBe(88);
    expect((await margaret.customers.history()).length).toBeGreaterThan(1);
    await expect(james.admin.resetDemo()).rejects.toMatchObject({ status: 403 });

    const events: RealtimeEvent[] = [];
    await new Promise<void>((resolve) => {
      const stop = margaret.realtime.subscribe((e) => events.push(e), { transport: "ws", onOpen: resolve });
      afterAll(stop);
    });
    expect(await admin.admin.resetDemo()).toEqual({ ok: true });
    await new Promise((r) => setTimeout(r, 100));
    expect(events.some((e) => e.type === "DEMO_RESET")).toBe(true);

    // Same sessions still work, and everything is back to the seeded state.
    const profile = await james.workers.getProfile();
    expect(profile).toMatchObject({ completedJobs: 87, rating: 4.9, ratingCount: 80 });
    expect(profile.qualifications.map((q) => q.serviceCategoryId).sort()).toEqual(["HOME_MAINTENANCE", "MOVING_ASSISTANCE"]);
    const history = await margaret.customers.history();
    expect(history).toHaveLength(1);
    expect(history[0]!.worker?.displayName).toBe("Maria L.");
    expect(await margaret.notifications.list()).toHaveLength(0);
    expect(await james.jobs.available()).toHaveLength(0);
    await expect(client().auth.login({ email: "temp@example.com", password: "longenough1" })).rejects.toMatchObject({ status: 401 });
    expect((await admin.admin.stats()).activeRequests).toBe(0);
  });

  it("refuses to reset when demo reset is turned off", async () => {
    const locked = await buildApp({
      config: loadConfig({ seedOnStart: false, jwtSecret: "client-test", aiServiceModule: "", matchingServiceModule: "", allowDemoReset: false }),
      dbHandle: handle,
      logger: false,
      backgroundJobs: false,
    });
    const url = await locked.app.listen({ port: 0, host: "127.0.0.1" });
    const admin = createApiClient({ baseUrl: url });
    await admin.auth.login({ email: "admin@handy.demo", password: DEMO_PASSWORD });
    await expect(admin.admin.resetDemo()).rejects.toMatchObject({ status: 403 });
    await locked.app.close();
  });

  it("passes query params through", async () => {
    const admin = client();
    await admin.auth.login({ email: "admin@handy.demo", password: DEMO_PASSWORD });
    const completed = await admin.admin.jobs("COMPLETED");
    expect(completed.length).toBeGreaterThanOrEqual(1);
    expect(completed.every((j) => j.status === "COMPLETED")).toBe(true);
  });
});
