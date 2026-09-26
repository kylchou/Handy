import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApiClient, type ApiClient } from "@handy/contracts";
import { DEMO_PASSWORD, type DbHandle } from "@handy/db";
import { buildApp, type App } from "../src/app";
import { loadConfig } from "../src/config";
import { NominatimGeocoder, type Geocoder } from "../src/lib/geocoder";
import { addDays, todayIn } from "../src/lib/time";
import { createTestDb } from "./helpers";

describe("NominatimGeocoder", () => {
  function fakeFetch(respond: (url: string) => unknown) {
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    const fetch = async (url: string, init: { headers: Record<string, string> }) => {
      calls.push({ url, headers: init.headers });
      const body = respond(url);
      if (body instanceof Error) throw body;
      return { ok: true, json: async () => body };
    };
    return { fetch, calls };
  }

  it("looks up an address, identifies itself, and caches the answer", async () => {
    const { fetch, calls } = fakeFetch(() => [{ lat: "33.7710", lon: "-84.3994" }]);
    const geo = new NominatimGeocoder({ contact: "team@example.com", fetch, minIntervalMs: 0 });

    expect(await geo.geocode("North Ave NW, Atlanta, GA")).toEqual({ latitude: 33.771, longitude: -84.3994 });
    expect(await geo.geocode("  north ave nw,  atlanta, ga ")).toEqual({ latitude: 33.771, longitude: -84.3994 });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.headers["User-Agent"]).toBe("Handy (team@example.com)");
    expect(calls[0]!.url).toContain("countrycodes=us");
  });

  it("returns null for unknown addresses, and retries after a failure", async () => {
    let fail = true;
    const { fetch, calls } = fakeFetch((url) => (url.includes("Nowhere") ? [] : fail ? new Error("network down") : [{ lat: "1", lon: "2" }]));
    const geo = new NominatimGeocoder({ contact: "x", fetch, minIntervalMs: 0 });

    expect(await geo.geocode("Nowhere Lane")).toBeNull();
    expect(await geo.geocode("Somewhere St")).toBeNull(); // failed
    fail = false;
    expect(await geo.geocode("Somewhere St")).toEqual({ latitude: 1, longitude: 2 }); // tried again
    expect(calls).toHaveLength(3);
  });

  it("spaces requests out to respect the rate limit", async () => {
    const { fetch } = fakeFetch(() => [{ lat: "1", lon: "1" }]);
    const geo = new NominatimGeocoder({ contact: "x", fetch, minIntervalMs: 150 });
    const started = Date.now();
    await Promise.all([geo.geocode("A St"), geo.geocode("B St"), geo.geocode("C St")]);
    expect(Date.now() - started).toBeGreaterThanOrEqual(290);
  });
});

describe("using real job locations", () => {
  let server: App;
  let handle: DbHandle;
  let baseUrl: string;
  const lookedUp: string[] = [];

  // Macon, GA is about 80 miles from the demo workers in Atlanta.
  const places: Record<string, { latitude: number; longitude: number }> = {
    "500 cherry street, macon, ga": { latitude: 32.8407, longitude: -83.6324 },
    "10 peachtree st, atlanta, ga": { latitude: 33.7537, longitude: -84.3901 },
  };
  const fakeGeocoder: Geocoder = {
    geocode: async (address) => {
      lookedUp.push(address);
      return places[address.toLowerCase()] ?? null;
    },
  };

  beforeAll(async () => {
    handle = await createTestDb();
    server = await buildApp({
      config: loadConfig({ seedOnStart: false, jwtSecret: "geo-test", aiServiceModule: "", matchingServiceModule: "", rateLimitEnabled: false }),
      dbHandle: handle,
      geocoder: fakeGeocoder,
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
  async function requestAt(margaret: ApiClient, location: string, time: string) {
    const { conversation } = await margaret.conversations.create();
    return (
      await margaret.requests.create({
        conversationId: conversation.id,
        serviceCategoryId: "MOVING_ASSISTANCE",
        description: "Move a table",
        location,
        requestedDate: addDays(todayIn("America/New_York"), 1),
        requestedStartTime: time,
      })
    ).request;
  }

  it("uses the real address, so faraway jobs don't go to local workers", async () => {
    const margaret = await login("margaret@handy.demo");
    const james = await login("james@handy.demo");

    const macon = await requestAt(margaret, "500 Cherry Street, Macon, GA", "10:00");
    expect(macon).toMatchObject({ latitude: 32.8407, longitude: -83.6324 });
    expect(macon.pendingOfferCount).toBe(0); // nobody within their service radius
    expect((await james.jobs.available()).some((o) => o.requestId === macon.id)).toBe(false);

    const downtown = await requestAt(margaret, "10 Peachtree St, Atlanta, GA", "12:00");
    const offer = (await james.jobs.available()).find((o) => o.requestId === downtown.id)!;
    expect(offer.distanceMiles).toBeGreaterThan(0);
  });

  it("skips the lookup at home, and falls back to home if the address can't be found", async () => {
    const margaret = await login("margaret@handy.demo");
    lookedUp.length = 0;
    const home = await requestAt(margaret, "123 Main St, Atlanta", "14:00");
    expect(lookedUp).toEqual([]);
    expect(home).toMatchObject({ latitude: 33.7756, longitude: -84.3963 });

    const unknown = await requestAt(margaret, "The big blue house by the park", "16:00");
    expect(lookedUp).toEqual(["The big blue house by the park"]);
    expect(unknown).toMatchObject({ latitude: 33.7756, longitude: -84.3963 });
  });

  it("fills in coordinates when someone saves an address", async () => {
    const margaret = await login("margaret@handy.demo");
    const profile = await margaret.customers.updateProfile({ address: "10 Peachtree St, Atlanta, GA" });
    expect(profile).toMatchObject({ latitude: 33.7537, longitude: -84.3901 });

    const newWorker = createApiClient({ baseUrl });
    await newWorker.auth.signup({
      role: "WORKER",
      firstName: "Rosa",
      lastName: "Diaz",
      email: "rosa@example.com",
      password: "longenough1",
      address: "500 Cherry Street, Macon, GA",
    });
    expect(await newWorker.workers.getProfile()).toMatchObject({ latitude: 32.8407, longitude: -83.6324 });
  });
});
