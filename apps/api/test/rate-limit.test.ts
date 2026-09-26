import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApiClient, type ApiClient } from "@handy/contracts";
import { DEMO_PASSWORD, type DbHandle } from "@handy/db";
import { buildApp, type App } from "../src/app";
import { loadConfig } from "../src/config";
import { createTestDb } from "./helpers";

let server: App;
let handle: DbHandle;
let baseUrl: string;

beforeAll(async () => {
  handle = await createTestDb();
  server = await buildApp({
    config: loadConfig({ seedOnStart: false, jwtSecret: "rl-test", aiServiceModule: "", matchingServiceModule: "", geocoder: "off", rateLimitEnabled: true }),
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

describe("rate limits", () => {
  it("limits login attempts per email, without locking out other people", async () => {
    const api = createApiClient({ baseUrl });
    for (let i = 0; i < 10; i++) {
      await expect(api.auth.login({ email: "maria@handy.demo", password: "wrong" })).rejects.toMatchObject({ status: 401 });
    }
    const blocked = await api.auth.login({ email: "maria@handy.demo", password: DEMO_PASSWORD }).catch((e) => e);
    expect(blocked).toMatchObject({ status: 429, code: "RATE_LIMITED" });
    expect(blocked.message).toMatch(/wait a moment/);
    expect(blocked.details.retryAfterSeconds).toBeGreaterThan(0);

    // Someone else on the same connection can still log in.
    await expect(api.auth.login({ email: "tom@handy.demo", password: DEMO_PASSWORD })).resolves.toBeDefined();
  });

  it("sends a Retry-After header", async () => {
    let res: Response | undefined;
    for (let i = 0; i < 11; i++) {
      res = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "grace@handy.demo", password: "wrong" }),
      });
    }
    expect(res!.status).toBe(429);
    expect(Number(res!.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("limits AI chat messages per user", async () => {
    const login = async (email: string) => {
      const api = createApiClient({ baseUrl });
      await api.auth.login({ email, password: DEMO_PASSWORD });
      return api;
    };
    const margaret: ApiClient = await login("margaret@handy.demo");
    const { conversation } = await margaret.conversations.create();
    for (let i = 0; i < 20; i++) await margaret.conversations.sendMessage(conversation.id, "hello");
    await expect(margaret.conversations.sendMessage(conversation.id, "hello")).rejects.toMatchObject({ status: 429, code: "RATE_LIMITED" });

    // Other endpoints for the same user aren't affected.
    await expect(margaret.customers.history()).resolves.toBeDefined();
  });
});
