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
    for (const status of ["EN_ROUTE", "ARRIVED", "IN_PROGRESS", "COMPLETED"] as const) {
      await james.jobs.updateStatus(job.id, status);
    }
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

  it("passes query params through", async () => {
    const admin = client();
    await admin.auth.login({ email: "admin@handy.demo", password: DEMO_PASSWORD });
    const completed = await admin.admin.jobs("COMPLETED");
    expect(completed.length).toBeGreaterThanOrEqual(1);
    expect(completed.every((j) => j.status === "COMPLETED")).toBe(true);
  });
});
