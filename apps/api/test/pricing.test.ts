import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ApiRequestError, createApiClient, type ApiClient } from "@handy/contracts";
import { DEMO_PASSWORD, type DbHandle } from "@handy/db";
import { buildApp, type App } from "../src/app";
import { loadConfig } from "../src/config";
import { addDays, todayIn } from "../src/lib/time";
import { createTestDb } from "./helpers";

describe("the customer sees and agrees to the price", () => {
  let server: App;
  let handle: DbHandle;
  let baseUrl: string;

  beforeAll(async () => {
    handle = await createTestDb();
    server = await buildApp({
      config: loadConfig({ seedOnStart: false, jwtSecret: "price-test", aiServiceModule: "", matchingServiceModule: "", rateLimitEnabled: false, geocoder: "off" }),
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

  const margaret = async () => {
    const api = createApiClient({ baseUrl });
    await api.auth.login({ email: "margaret@handy.demo", password: DEMO_PASSWORD });
    return api;
  };
  const tomorrow = () => addDays(todayIn("America/New_York"), 1);
  async function couchChat(api: ApiClient) {
    const { conversation } = await api.conversations.create();
    expect(conversation.priceQuote).toBeNull(); // nothing to price yet
    const turn = await api.conversations.sendMessage(conversation.id, "I need someone to help me move a couch tomorrow afternoon.");
    return { id: conversation.id, quote: turn.conversation.priceQuote };
  }

  it("shows the price in the chat as soon as the kind of job is known", async () => {
    const api = await margaret();
    const { id, quote } = await couchChat(api);
    // Moving help is $35, plus Handy's $5 fee.
    expect(quote).toEqual({ servicePriceCents: 3500, urgentSurchargeCents: 0, platformFeeCents: 500, totalCents: 4000 });
    expect((await api.conversations.get(id)).conversation.priceQuote?.totalCents).toBe(4000);
  });

  it("books at the price they agreed to, and history shows what they paid", async () => {
    const api = await margaret();
    const { id } = await couchChat(api);
    const { request } = await api.requests.create({ conversationId: id, requestedDate: tomorrow(), requestedStartTime: "14:00", location: "123 Main Street, Atlanta, GA", agreedTotalCents: 4000 });
    expect(request).toMatchObject({ estimatedPriceCents: 3500, platformFeeCents: 500, totalPriceCents: 4000 });
    expect((await api.customers.history()).find((h) => h.requestId === request.id)?.priceCents).toBe(4000);
  });

  it("refuses if the price changed from what they agreed to", async () => {
    const api = await margaret();
    const { id } = await couchChat(api);
    const err = await api.requests
      .create({ conversationId: id, requestedDate: tomorrow(), requestedStartTime: "15:00", location: "123 Main Street, Atlanta, GA", urgency: "HIGH", agreedTotalCents: 4000 })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err).toMatchObject({ status: 409, code: "PRICE_CHANGED" });
    // Urgent adds $10, and they're told the new total so the card can show it.
    expect((err as ApiRequestError).details).toMatchObject({ priceQuote: { urgentSurchargeCents: 1000, totalCents: 5000 } });
    expect((err as ApiRequestError).message).toContain("$50.00");
  });
});
