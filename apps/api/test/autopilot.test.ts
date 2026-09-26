import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApiClient, type ApiClient } from "@handy/contracts";
import { DEMO_PASSWORD, type DbHandle } from "@handy/db";
import { buildApp, type App } from "../src/app";
import { loadConfig } from "../src/config";
import { addDays, todayIn } from "../src/lib/time";
import { createTestDb } from "./helpers";

describe("demo autopilot", () => {
  let server: App;
  let handle: DbHandle;
  let baseUrl: string;

  beforeAll(async () => {
    handle = await createTestDb();
    server = await buildApp({
      config: loadConfig({ seedOnStart: false, jwtSecret: "autopilot-test", aiServiceModule: "", matchingServiceModule: "", rateLimitEnabled: false, geocoder: "off" }),
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

  const login = async (email: string) => {
    const api = createApiClient({ baseUrl });
    await api.auth.login({ email, password: DEMO_PASSWORD });
    return api;
  };
  async function makeRequest(margaret: ApiClient, time: string) {
    const { conversation } = await margaret.conversations.create();
    return (
      await margaret.requests.create({
        conversationId: conversation.id,
        serviceCategoryId: "LAWN_CARE",
        description: "Mow the front yard",
        location: "123 Main St, Atlanta",
        requestedDate: addDays(todayIn("America/New_York"), 2),
        requestedStartTime: time,
      })
    ).request;
  }
  // Steps are 60s apart, so the real timer never fires during the test; each tick pretends a minute passed.
  const step = () => server.services.autopilot.tick(new Date(Date.now() + 61_000));

  it("is admin only", async () => {
    const margaret = await login("margaret@handy.demo");
    await expect(margaret.admin.setAutopilot({ enabled: true })).rejects.toMatchObject({ status: 403 });
  });

  it("accepts new requests and walks them through to done", async () => {
    const admin = await login("admin@handy.demo");
    const margaret = await login("margaret@handy.demo");
    const before = await makeRequest(margaret, "09:00");

    expect(await admin.admin.setAutopilot({ enabled: true, stepSeconds: 60 })).toMatchObject({ enabled: true, stepSeconds: 60, activeJobIds: [] });
    const request = await makeRequest(margaret, "13:00");

    await server.services.autopilot.tick(); // offers are brand new, nobody accepts yet
    expect((await margaret.requests.get(request.id)).status).toBe("SEARCHING");

    await step();
    const matched = await margaret.requests.get(request.id);
    expect(matched.status).toBe("MATCHED");
    expect((await margaret.requests.get(before.id)).status).toBe("SEARCHING"); // made before it was turned on
    expect((await admin.admin.autopilot()).activeJobIds).toEqual([matched.jobId]);

    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      await step();
      seen.push((await margaret.jobs.get(matched.jobId!)).status);
    }
    expect(seen).toEqual(["EN_ROUTE", "ARRIVED", "IN_PROGRESS", "COMPLETED"]);

    await step();
    expect((await admin.admin.autopilot()).activeJobIds).toEqual([]);
    const types = (await margaret.notifications.list()).map((n) => n.type);
    expect(types).toContain("JOB_COMPLETED");

    expect(await admin.admin.setAutopilot({ enabled: false })).toMatchObject({ enabled: false });
    const after = await makeRequest(margaret, "16:00");
    await step();
    expect((await margaret.requests.get(after.id)).status).toBe("SEARCHING");
  });

  it("is off when demo tools are turned off", async () => {
    const locked = await buildApp({
      config: loadConfig({ seedOnStart: false, jwtSecret: "autopilot-test", aiServiceModule: "", matchingServiceModule: "", allowDemoReset: false, rateLimitEnabled: false, geocoder: "off" }),
      dbHandle: handle,
      logger: false,
      backgroundJobs: false,
    });
    const url = await locked.app.listen({ port: 0, host: "127.0.0.1" });
    const admin = createApiClient({ baseUrl: url });
    await admin.auth.login({ email: "admin@handy.demo", password: DEMO_PASSWORD });
    await expect(admin.admin.setAutopilot({ enabled: true })).rejects.toMatchObject({ status: 403 });
    await locked.app.close();
  });
});
