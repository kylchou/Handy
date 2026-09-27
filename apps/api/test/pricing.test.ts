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

  it("adds the tip to what she pays and what the worker earns", async () => {
    const api = await margaret();
    const james = createApiClient({ baseUrl });
    await james.auth.login({ email: "james@handy.demo", password: DEMO_PASSWORD });
    const { id } = await couchChat(api);

    // $40 order with a 15% tip of $6.
    const wrong = await api.requests
      .create({ conversationId: id, requestedDate: tomorrow(), requestedStartTime: "16:00", requestedEndTime: "17:00", location: "123 Main Street, Atlanta, GA", tipCents: 600, agreedTotalCents: 4000 })
      .catch((e: unknown) => e);
    expect(wrong).toMatchObject({ code: "PRICE_CHANGED" }); // the tip has to be in the total she agreed to

    const { request } = await api.requests.create({
      conversationId: id,
      requestedDate: tomorrow(),
      requestedStartTime: "16:00",
      requestedEndTime: "17:00",
      location: "123 Main Street, Atlanta, GA",
      tipCents: 600,
      agreedTotalCents: 4600,
    });
    expect(request).toMatchObject({ tipCents: 600, workerPayCents: 4100, totalPriceCents: 4600 });

    const offer = (await james.jobs.available()).find((o) => o.requestId === request.id)!;
    expect(offer).toMatchObject({ estimatedPayCents: 4100, tipCents: 600 });
    const before = (await james.workers.earnings()).totalEarnedCents;
    const job = await james.jobs.acceptOffer(offer.id);
    await james.jobs.updateStatus(job.id, "EN_ROUTE");
    await james.jobs.arrive(job.id, (await api.jobs.get(job.id)).arrivalCode!);
    await james.jobs.updateStatus(job.id, "IN_PROGRESS");
    const done = await james.jobs.updateStatus(job.id, "COMPLETED");
    expect(done.finalPriceCents).toBe(4100);
    expect((await james.workers.earnings()).totalEarnedCents - before).toBe(4100);
    expect((await api.customers.history()).find((h) => h.requestId === request.id)?.priceCents).toBe(4600);

    // A written review shows up on James's reviews for anyone to read.
    await api.jobs.rate(job.id, { score: 5, comment: "James was careful with my couch and very kind." });
    const [latest] = await james.workers.ratings(offer.workerId);
    expect(latest).toMatchObject({ score: 5, comment: "James was careful with my couch and very kind.", reviewerName: "Margaret T." });
  });
});
