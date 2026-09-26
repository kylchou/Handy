import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ApiRequestError, createApiClient, type ApiClient, type RealtimeEvent } from "@handy/contracts";
import { eq } from "drizzle-orm";
import { DEMO_PASSWORD, jobs, type DbHandle } from "@handy/db";
import { buildApp, type App } from "../src/app";
import { loadConfig } from "../src/config";
import { createTestDb } from "./helpers";
import { addDays, todayIn, zonedDateTimeToDate } from "../src/lib/time";

let server: App;
let handle: DbHandle;
let baseUrl: string;

const client = (): ApiClient => createApiClient({ baseUrl });

beforeAll(async () => {
  handle = await createTestDb();
  server = await buildApp({
    config: loadConfig({ seedOnStart: false, jwtSecret: "client-test", aiServiceModule: "", matchingServiceModule: "", rateLimitEnabled: false }),
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

  describe("caregivers", () => {
    const login = async (email: string) => {
      const api = client();
      await api.auth.login({ email, password: DEMO_PASSWORD });
      return api;
    };
    const titles = async (api: ApiClient) => (await api.notifications.list()).map((n) => n.title);

    it("links a family member with an invite code", async () => {
      const margaret = await login("margaret@handy.demo");
      const niece = client();
      const nora = await niece.auth.signup({ role: "CAREGIVER", firstName: "Nora", lastName: "Hayes", email: "nora@example.com", password: "longenough1" });
      expect(await niece.caregivers.people()).toEqual([]);

      const { code } = await margaret.customers.createCaregiverInvite();
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
      await expect(niece.caregivers.acceptInvite("ZZZZZZ")).rejects.toMatchObject({ status: 400, code: "INVALID_INVITE" });

      const person = await niece.caregivers.acceptInvite(code.toLowerCase());
      expect(person.customer.firstName).toBe("Margaret");
      expect(await titles(margaret)).toContain("Nora can now see your Handy requests.");
      expect((await margaret.customers.caregivers()).map((c) => c.caregiver.firstName).sort()).toEqual(["Nora", "Susan"]);

      // Codes only work once.
      const other = client();
      await other.auth.signup({ role: "CAREGIVER", firstName: "Omar", lastName: "Ali", email: "omar@example.com", password: "longenough1" });
      await expect(other.caregivers.acceptInvite(code)).rejects.toMatchObject({ code: "INVALID_INVITE" });

      // Margaret can remove her; Nora's dashboard is empty again.
      await margaret.customers.removeCaregiver(nora.user.id);
      expect(await niece.caregivers.people()).toEqual([]);
      await expect(niece.caregivers.unlink(person.customer.id)).rejects.toMatchObject({ status: 404 });
    });

    it("keeps the caregiver updated on the moments that matter", async () => {
      const margaret = await login("margaret@handy.demo");
      const james = await login("james@handy.demo");
      const susan = await login("susan@handy.demo");

      const { conversation } = await margaret.conversations.create();
      const { request } = await margaret.requests.create({
        conversationId: conversation.id,
        serviceCategoryId: "MOVING_ASSISTANCE",
        description: "Move a chair",
        location: "123 Main Street, Atlanta, GA",
        requestedDate: addDays(todayIn("America/New_York"), 3),
        requestedStartTime: "11:00",
      });
      const offer = (await james.jobs.available()).find((o) => o.requestId === request.id)!;
      const job = await james.jobs.acceptOffer(offer.id);
      expect((await titles(susan)).some((t) => t.startsWith("James R. will help Margaret"))).toBe(true);

      // The dashboard shows the job, but never the arrival code.
      const [person] = await susan.caregivers.people();
      const active = person!.activeJobs.find((j) => j.id === job.id)!;
      expect(active.worker.displayName).toBe("James R.");
      expect(active.arrivalCode).toBeNull();

      await james.jobs.updateStatus(job.id, "EN_ROUTE");
      await james.jobs.arrive(job.id, (await margaret.jobs.get(job.id)).arrivalCode!);
      await james.jobs.updateStatus(job.id, "IN_PROGRESS");
      await james.jobs.updateStatus(job.id, "COMPLETED");

      const susanTitles = await titles(susan);
      expect(susanTitles).toContain("James has arrived at Margaret's.");
      expect(susanTitles).toContain("James finished helping Margaret.");
      // Not every step, just the important ones.
      expect(susanTitles.some((t) => t.includes("on the way"))).toBe(false);
      expect((await susan.caregivers.people())[0]!.recentHistory.find((h) => h.requestId === request.id)?.jobStatus).toBe("COMPLETED");
    });

    it("alerts caregivers once when the customer describes an emergency", async () => {
      const margaret = await login("margaret@handy.demo");
      const susan = await login("susan@handy.demo");
      const { conversation } = await margaret.conversations.create();
      await margaret.conversations.sendMessage(conversation.id, "I fell and can't get up");
      await margaret.conversations.sendMessage(conversation.id, "I fell and can't get up, please help");
      const alerts = (await susan.notifications.list()).filter((n) => n.type === "POTENTIAL_EMERGENCY");
      expect(alerts).toHaveLength(1);
      expect(alerts[0]!.title).toBe("Margaret may need help right now.");
    });

    it("is read-only", async () => {
      const susan = await login("susan@handy.demo");
      const [person] = await susan.caregivers.people();
      const job = person!.recentHistory.find((h) => h.jobId)!;
      await expect(susan.jobs.list()).rejects.toMatchObject({ status: 403 });
      await expect(susan.jobs.get(job.jobId!)).rejects.toMatchObject({ status: 403 });
      await expect(susan.requests.get(job.requestId)).rejects.toMatchObject({ status: 403 });
      await expect(susan.conversations.create()).rejects.toMatchObject({ status: 403 });
      await expect(susan.customers.createCaregiverInvite()).rejects.toMatchObject({ status: 403 });
    });
  });

  describe("reminders", () => {
    const login = async (email: string) => {
      const api = client();
      await api.auth.login({ email, password: DEMO_PASSWORD });
      return api;
    };
    const reminders = async (api: ApiClient) => (await api.notifications.list()).filter((n) => n.type === "JOB_REMINDER");

    async function bookJames(margaret: ApiClient, james: ApiClient, date: string, time: string) {
      const { conversation } = await margaret.conversations.create();
      const { request } = await margaret.requests.create({
        conversationId: conversation.id,
        serviceCategoryId: "MOVING_ASSISTANCE",
        description: "Move a dresser",
        location: "123 Main Street, Atlanta, GA",
        requestedDate: date,
        requestedStartTime: time,
      });
      const offer = (await james.jobs.available()).find((o) => o.requestId === request.id)!;
      return james.jobs.acceptOffer(offer.id);
    }

    it("reminds everyone the day before and an hour before, once each", async () => {
      const margaret = await login("margaret@handy.demo");
      const james = await login("james@handy.demo");
      const susan = await login("susan@handy.demo");
      const date = addDays(todayIn("America/New_York"), 2);
      const job = await bookJames(margaret, james, date, "10:00");
      const code = (await margaret.jobs.get(job.id)).arrivalCode;
      const start = zonedDateTimeToDate(date, "10:00", "America/New_York").getTime();
      const at = (ms: number) => server.services.jobs.sendReminders(new Date(start - ms));
      const HOUR = 60 * 60 * 1000;

      expect(await at(30 * HOUR)).toBe(0); // too early

      expect(await at(23 * HOUR)).toBe(1);
      expect((await reminders(margaret))[0]).toMatchObject({
        title: "Reminder: James is coming tomorrow at 10 AM.",
        body: `Moving help: Move a dresser. Your arrival code is ${code}.`,
      });
      expect((await reminders(james))[0]!.title).toBe("Reminder: Moving help for Margaret T. tomorrow at 10 AM.");
      expect((await reminders(susan))[0]!.title).toBe("James is helping Margaret tomorrow at 10 AM.");

      expect(await at(22 * HOUR)).toBe(0); // no repeats

      expect(await at(50 * 60 * 1000)).toBe(1);
      expect((await reminders(margaret))[0]!.title).toBe("James is coming in about an hour.");
      expect((await reminders(james))[0]!.title).toBe("Your moving help job for Margaret T. starts in about an hour.");
      expect(await reminders(susan)).toHaveLength(1); // caregivers only get the day-before one
      expect(await reminders(margaret)).toHaveLength(2);
    });

    it("skips a reminder the acceptance already covered", async () => {
      const margaret = await login("margaret@handy.demo");
      const james = await login("james@handy.demo");
      const date = addDays(todayIn("America/New_York"), 2);
      const job = await bookJames(margaret, james, date, "14:00");
      const start = zonedDateTimeToDate(date, "14:00", "America/New_York").getTime();

      // Pretend James only accepted 30 minutes before the job.
      await handle.db.update(jobs).set({ acceptedAt: new Date(start - 30 * 60 * 1000) }).where(eq(jobs.id, job.id));
      const before = (await reminders(margaret)).length;
      expect(await server.services.jobs.sendReminders(new Date(start - 20 * 60 * 1000))).toBe(0);
      expect(await reminders(margaret)).toHaveLength(before);

      const [row] = await handle.db.select().from(jobs).where(eq(jobs.id, job.id));
      expect(row!.dayReminderSentAt).not.toBeNull();
      expect(row!.hourReminderSentAt).not.toBeNull();
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
    expect((await james.workers.getProfile()).completedJobs).toBeGreaterThan(87);
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
    const susan = client();
    await susan.auth.login({ email: "susan@handy.demo", password: DEMO_PASSWORD });
    expect((await susan.caregivers.people()).map((p) => p.customer.firstName)).toEqual(["Margaret"]);
  });

  it("refuses to reset when demo reset is turned off", async () => {
    const locked = await buildApp({
      config: loadConfig({ seedOnStart: false, jwtSecret: "client-test", aiServiceModule: "", matchingServiceModule: "", rateLimitEnabled: false, allowDemoReset: false }),
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
