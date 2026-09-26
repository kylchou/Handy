import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import type {
  AuthResponse,
  CreateConversationResponse,
  CreateServiceRequestResponse,
  JobDetailDTO,
  JobOfferDTO,
  RealtimeEvent,
  SendConversationMessageResponse,
} from "@handy/contracts";
import { DEMO_PASSWORD, type DbHandle } from "@handy/db";
import { buildApp, type App } from "../src/app";
import { loadConfig } from "../src/config";
import { createTestDb } from "./helpers";
import { addDays, todayIn } from "../src/lib/time";

let ctx: App;
let handle: DbHandle;
const tokens: Record<string, string> = {};
const ids: Record<string, string> = {};

async function call<T = unknown>(method: string, url: string, who?: string, body?: unknown) {
  const res = await ctx.app.inject({
    method: method as "GET",
    url: `/api/v1${url}`,
    headers: who ? { authorization: `Bearer ${tokens[who]}` } : {},
    ...(body !== undefined && { payload: body as object }),
  });
  return { status: res.statusCode, body: (res.body ? res.json() : null) as T };
}

async function chat(who: string, conversationId: string, content: string) {
  const res = await call<SendConversationMessageResponse>("POST", `/ai/conversations/${conversationId}/messages`, who, { content });
  expect(res.status).toBe(200);
  return res.body;
}

beforeAll(async () => {
  handle = await createTestDb();
  ctx = await buildApp({
    config: loadConfig({ seedOnStart: false, jwtSecret: "test-secret", aiServiceModule: "", matchingServiceModule: "", rateLimitEnabled: false }),
    dbHandle: handle,
    logger: false,
    backgroundJobs: false,
  });
  for (const name of ["margaret", "james", "tom", "maria", "admin"]) {
    const res = await call<AuthResponse>("POST", "/auth/login", undefined, { email: `${name}@handy.demo`, password: DEMO_PASSWORD });
    expect(res.status).toBe(200);
    tokens[name] = res.body.token;
    ids[name] = res.body.user.id;
  }
});

afterAll(async () => {
  await ctx.app.close();
  await handle.close();
});

describe("auth and access control", () => {
  it("rejects bad credentials and missing tokens", async () => {
    expect((await call("POST", "/auth/login", undefined, { email: "margaret@handy.demo", password: "nope" })).status).toBe(401);
    expect((await call("GET", "/auth/me")).status).toBe(401);
  });

  it("enforces roles", async () => {
    expect((await call("GET", "/jobs/available", "margaret")).status).toBe(403);
    expect((await call("POST", "/ai/conversations", "james")).status).toBe(403);
    expect((await call("GET", "/admin/stats", "james")).status).toBe(403);
    expect((await call("GET", "/admin/stats", "admin")).status).toBe(200);
  });

  it("signs up a new worker as pending verification and supports logout", async () => {
    const res = await call<AuthResponse>("POST", "/auth/signup", undefined, {
      role: "WORKER",
      firstName: "Nia",
      lastName: "Green",
      email: "nia@example.com",
      password: "longenough1",
    });
    expect(res.status).toBe(201);
    tokens.nia = res.body.token;
    const me = await call<{ workerProfile: { verificationStatus: string } }>("GET", "/auth/me", "nia");
    expect(me.body.workerProfile.verificationStatus).toBe("PENDING");
    expect((await call("POST", "/auth/signup", undefined, { role: "WORKER", firstName: "N", lastName: "G", email: "nia@example.com", password: "longenough1" })).status).toBe(409);
    expect((await call("POST", "/auth/logout", "nia")).status).toBe(204);
    expect((await call("GET", "/auth/me", "nia")).status).toBe(401);
  });

  it("validates bodies", async () => {
    const res = await call<{ error: { code: string } }>("POST", "/auth/signup", undefined, { role: "ADMIN", email: "x" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
  });
});

describe("end-to-end demo flow", () => {
  const customerEvents: RealtimeEvent[] = [];
  let conversationId: string;
  let requestId: string;
  let jobId: string;

  it("turns a conversation into a confirmed request", async () => {
    ctx.bus.subscribe(ids.margaret!, (e) => customerEvents.push(e));

    const created = await call<CreateConversationResponse>("POST", "/ai/conversations", "margaret");
    expect(created.status).toBe(201);
    conversationId = created.body.conversation.id;
    expect(created.body.messages[0]!.senderType).toBe("AI");

    const today = todayIn("America/New_York");
    let turn = await chat("margaret", conversationId, "I need someone to help me move a couch tomorrow afternoon.");
    expect(turn.conversation.draft.serviceCategoryId).toBe("MOVING_ASSISTANCE");
    expect(turn.conversation.draft.requestedDate).toBe(addDays(today, 1));
    expect(turn.conversation.missingInformation).toEqual(["location"]);
    expect(turn.conversation.readyToSubmit).toBe(false);

    turn = await chat("margaret", conversationId, "Around 3.");
    expect(turn.conversation.draft.requestedStartTime).toBe("15:00");
    expect(turn.conversation.draft.location ?? null).toBeNull();

    turn = await chat("margaret", conversationId, "Yes, at my home please.");
    expect(turn.conversation.draft.location).toBe("123 Main Street, Atlanta, GA");
    expect(turn.conversation.readyToSubmit).toBe(true);
    expect(turn.assistantMessage.content).toMatch(/Would you like me to find someone/);

    const submitted = await call<CreateServiceRequestResponse>("POST", "/requests", "margaret", { conversationId });
    expect(submitted.status).toBe(201);
    requestId = submitted.body.request.id;
    expect(submitted.body.request.status).toBe("SEARCHING");
    expect(submitted.body.request.estimatedPriceCents).toBe(3500);
    expect(submitted.body.notifiedWorkerCount).toBeGreaterThanOrEqual(2);

    // Submitting the same conversation twice is rejected.
    expect((await call("POST", "/requests", "margaret", { conversationId })).status).toBe(409);
  });

  it("ranks qualified workers with James first and hides the street address in offers", async () => {
    const matches = await call<{ matches: Array<{ displayName: string; score: number; offered: boolean }> }>(
      "GET",
      `/requests/${requestId}/matches`,
      "admin",
    );
    expect(matches.body.matches[0]!.displayName).toBe("James R.");
    expect(matches.body.matches.every((m) => m.offered)).toBe(true);

    const offers = await call<JobOfferDTO[]>("GET", "/jobs/available", "james");
    const offer = offers.body.find((o) => o.requestId === requestId)!;
    expect(offer.estimatedPayCents).toBe(3500);
    expect(offer.approximateLocation).not.toContain("123 Main");
    expect(offer.customer.displayName).toBe("Margaret T.");

    // Maria does not do moving, so she gets no offer.
    const maria = await call<JobOfferDTO[]>("GET", "/jobs/available", "maria");
    expect(maria.body.some((o) => o.requestId === requestId)).toBe(false);
  });

  it("gives the job to the first worker who accepts", async () => {
    const jamesOffer = (await call<JobOfferDTO[]>("GET", "/jobs/available", "james")).body.find((o) => o.requestId === requestId)!;
    const tomOffer = (await call<JobOfferDTO[]>("GET", "/jobs/available", "tom")).body.find((o) => o.requestId === requestId)!;

    const accepted = await call<JobDetailDTO>("POST", `/jobs/offers/${jamesOffer.id}/accept`, "james");
    expect(accepted.status).toBe(200);
    jobId = accepted.body.id;
    expect(accepted.body.status).toBe("ACCEPTED");
    expect(accepted.body.worker.displayName).toBe("James R.");

    const late = await call<{ error: { code: string } }>("POST", `/jobs/offers/${tomOffer.id}/accept`, "tom");
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe("JOB_NO_LONGER_AVAILABLE");
    expect((await call<JobOfferDTO[]>("GET", "/jobs/available", "tom")).body.some((o) => o.requestId === requestId)).toBe(false);

    const req = await call<{ status: string; jobId: string }>("GET", `/requests/${requestId}`, "margaret");
    expect(req.body.status).toBe("MATCHED");
    expect(req.body.jobId).toBe(jobId);
    // Tom may not look at a job that isn't his.
    expect((await call("GET", `/jobs/${jobId}`, "tom")).status).toBe(403);
  });

  it("validates status transitions and supports chat", async () => {
    expect((await call("PATCH", `/jobs/${jobId}/status`, "james", { status: "COMPLETED" })).status).toBe(409);
    expect((await call("PATCH", `/jobs/${jobId}/status`, "margaret", { status: "EN_ROUTE" })).status).toBe(409);

    expect((await call("POST", `/jobs/${jobId}/messages`, "margaret", { content: "The front door is unlocked. Please come around to the back." })).status).toBe(201);
    expect((await call("POST", `/jobs/${jobId}/messages`, "james", { content: "Sounds good. I'll be there in about 10 minutes." })).status).toBe(201);
    const msgs = await call<Array<{ senderName: string }>>("GET", `/jobs/${jobId}/messages`, "margaret");
    expect(msgs.body.map((m) => m.senderName)).toEqual(["Margaret T.", "James R."]);
    expect((await call("GET", `/jobs/${jobId}/messages`, "tom")).status).toBe(403);

    // Only Margaret can see the arrival code.
    const code = (await call<JobDetailDTO>("GET", `/jobs/${jobId}`, "margaret")).body.arrivalCode!;
    expect(code).toMatch(/^\d{4}$/);
    expect((await call<JobDetailDTO>("GET", `/jobs/${jobId}`, "james")).body.arrivalCode).toBeNull();
    expect((await call<JobDetailDTO[]>("GET", "/jobs", "james")).body.every((j) => j.arrivalCode === null)).toBe(true);
    expect((await call<JobDetailDTO>("GET", `/jobs/${jobId}`, "admin")).body.arrivalCode).toBe(code);
    const notes = await call<Array<{ body: string | null }>>("GET", "/notifications", "margaret");
    expect(notes.body.some((n) => n.body?.includes(`Your arrival code is ${code}`))).toBe(true);

    expect((await call("PATCH", `/jobs/${jobId}/status`, "james", { status: "EN_ROUTE" })).status).toBe(200);
    const noCode = await call<{ error: { code: string } }>("PATCH", `/jobs/${jobId}/status`, "james", { status: "ARRIVED" });
    expect(noCode.body.error.code).toBe("INVALID_ARRIVAL_CODE");
    const wrong = code === "0000" ? "1111" : "0000";
    const bad = await call<{ error: { code: string } }>("PATCH", `/jobs/${jobId}/status`, "james", { status: "ARRIVED", arrivalCode: wrong });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("INVALID_ARRIVAL_CODE");

    for (const [status, extra] of [["ARRIVED", { arrivalCode: code }], ["IN_PROGRESS", {}], ["COMPLETED", {}]] as const) {
      const res = await call<JobDetailDTO>("PATCH", `/jobs/${jobId}/status`, "james", { status, ...extra });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe(status);
    }
    const job = await call<JobDetailDTO>("GET", `/jobs/${jobId}`, "margaret");
    expect(job.body.finalPriceCents).toBe(3500);
    expect(job.body.request.status).toBe("COMPLETED");
    expect((await call("POST", `/jobs/${jobId}/messages`, "margaret", { content: "thanks" })).status).toBe(409);
  });

  it("pushes realtime events and plain-language notifications to the customer", async () => {
    const types = customerEvents.map((e) => e.type);
    for (const t of ["REQUEST_CREATED", "WORKER_MATCHED", "JOB_ACCEPTED", "MESSAGE_RECEIVED", "WORKER_EN_ROUTE", "WORKER_ARRIVED", "JOB_STARTED", "JOB_COMPLETED"]) {
      expect(types).toContain(t);
    }
    const notes = await call<Array<{ title: string }>>("GET", "/notifications", "margaret");
    const titles = notes.body.map((n) => n.title);
    expect(titles).toContain("James is on the way.");
    expect(titles).toContain("James has arrived.");
    expect(titles.some((t) => t.startsWith("James is helping you tomorrow"))).toBe(true);
  });

  it("records the rating on the worker profile, once", async () => {
    const res = await call("POST", `/jobs/${jobId}/rating`, "margaret", { score: 5, comment: "Very helpful and arrived on time." });
    expect(res.status).toBe(201);
    expect((await call("POST", `/jobs/${jobId}/rating`, "margaret", { score: 4 })).status).toBe(409);

    const james = await call<{ rating: number; ratingCount: number; completedJobs: number }>("GET", `/workers/${ids.james}`, "margaret");
    expect(james.body.ratingCount).toBe(81);
    expect(james.body.completedJobs).toBe(88);
    expect(james.body.rating).toBeCloseTo((4.9 * 80 + 5) / 81, 2);

    const history = await call<Array<{ requestId: string; rating: number; worker: { displayName: string } }>>("GET", "/customers/me/history", "margaret");
    const row = history.body.find((h) => h.requestId === requestId)!;
    expect(row.rating).toBe(5);
    expect(row.worker.displayName).toBe("James R.");

    const earnings = await call<{ totalEarnedCents: number }>("GET", "/workers/me/earnings", "james");
    expect(earnings.body.totalEarnedCents).toBe(3500);
  });
});

describe("safety and re-matching", () => {
  it("never turns a possible emergency into a job", async () => {
    const conv = (await call<CreateConversationResponse>("POST", "/ai/conversations", "margaret")).body.conversation;
    const turn = await chat("margaret", conv.id, "My dad collapsed and isn't responding.");
    expect(turn.conversation.safetyStatus).toBe("POTENTIAL_EMERGENCY");
    expect(turn.emergency?.callNumber).toBe("911");
    const res = await call<{ error: { code: string } }>("POST", "/requests", "margaret", {
      conversationId: conv.id,
      serviceCategoryId: "COMPANIONSHIP",
      description: "check on dad",
      location: "home",
      requestedDate: addDays(todayIn("America/New_York"), 1),
      requestedStartTime: "10:00",
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("POTENTIAL_EMERGENCY");
  });

  it("refuses to submit an incomplete request", async () => {
    const conv = (await call<CreateConversationResponse>("POST", "/ai/conversations", "margaret")).body.conversation;
    await chat("margaret", conv.id, "My sink is leaking");
    const res = await call<{ error: { code: string; details: { missingInformation: string[] } } }>("POST", "/requests", "margaret", { conversationId: conv.id });
    expect(res.status).toBe(422);
    expect(res.body.error.details.missingInformation).toContain("requestedDate");
  });

  it("puts a request back on the market when the worker cancels", async () => {
    const conv = (await call<CreateConversationResponse>("POST", "/ai/conversations", "margaret")).body.conversation;
    const submitted = await call<CreateServiceRequestResponse>("POST", "/requests", "margaret", {
      conversationId: conv.id,
      serviceCategoryId: "MOVING_ASSISTANCE",
      description: "Move boxes to the attic",
      location: "123 Main Street, Atlanta, GA",
      requestedDate: addDays(todayIn("America/New_York"), 2),
      requestedStartTime: "10:00",
    });
    expect(submitted.status).toBe(201);
    const requestId = submitted.body.request.id;

    const offer = (await call<JobOfferDTO[]>("GET", "/jobs/available", "james")).body.find((o) => o.requestId === requestId)!;
    const job = (await call<JobDetailDTO>("POST", `/jobs/offers/${offer.id}/accept`, "james")).body;
    expect((await call<JobOfferDTO[]>("GET", "/jobs/available", "tom")).body.some((o) => o.requestId === requestId)).toBe(false);

    const cancelled = await call<JobDetailDTO>("PATCH", `/jobs/${job.id}/status`, "james", { status: "CANCELLED", reason: "Car trouble" });
    expect(cancelled.status).toBe(200);
    const req = await call<{ status: string; jobId: string | null }>("GET", `/requests/${requestId}`, "margaret");
    expect(req.body.status).toBe("SEARCHING");
    expect(req.body.jobId).toBeNull();
    // Tom's withdrawn offer is re-opened; James is not offered it again.
    expect((await call<JobOfferDTO[]>("GET", "/jobs/available", "tom")).body.some((o) => o.requestId === requestId)).toBe(true);
    expect((await call<JobOfferDTO[]>("GET", "/jobs/available", "james")).body.some((o) => o.requestId === requestId)).toBe(false);

    // The customer can then cancel the search entirely.
    const c = await call<{ status: string }>("POST", `/requests/${requestId}/cancel`, "margaret");
    expect(c.body.status).toBe("CANCELLED");
    expect((await call<JobOfferDTO[]>("GET", "/jobs/available", "tom")).body.some((o) => o.requestId === requestId)).toBe(false);
  });

  it("stops a worker from double-booking themselves", async () => {
    const day = addDays(todayIn("America/New_York"), 4);
    const submit = async (description: string) => {
      const conv = (await call<CreateConversationResponse>("POST", "/ai/conversations", "margaret")).body.conversation;
      const r = await call<CreateServiceRequestResponse>("POST", "/requests", "margaret", {
        conversationId: conv.id,
        serviceCategoryId: "MOVING_ASSISTANCE",
        description,
        location: "123 Main Street, Atlanta, GA",
        requestedDate: day,
        requestedStartTime: "14:00",
      });
      return r.body.request.id;
    };
    const first = await submit("Move a dresser");
    const second = await submit("Move a bookshelf");
    const jamesOffers = (await call<JobOfferDTO[]>("GET", "/jobs/available", "james")).body;
    const offerFor = (id: string) => jamesOffers.find((o) => o.requestId === id)!;
    expect(offerFor(first)).toBeDefined();
    expect(offerFor(second)).toBeDefined();

    expect((await call("POST", `/jobs/offers/${offerFor(first).id}/accept`, "james")).status).toBe(200);

    // His overlapping offer is pulled, and Tom is still offered the second job.
    expect((await call<JobOfferDTO[]>("GET", "/jobs/available", "james")).body.some((o) => o.requestId === second)).toBe(false);
    expect((await call<JobOfferDTO[]>("GET", "/jobs/available", "tom")).body.some((o) => o.requestId === second)).toBe(true);
    const late = await call<{ error: { code: string } }>("POST", `/jobs/offers/${offerFor(second).id}/accept`, "james");
    expect(late.status).toBe(409);

    // Even if an overlapping offer slips through (e.g. two taps at once), the accept is refused.
    const { offersRepo } = await import("../src/repositories/offers");
    const third = await submit("Move a mattress");
    const [sneaky] = await offersRepo.createMany(handle.db, [{ requestId: third, workerId: ids.james!, score: 50 }]);
    const conflict = await call<{ error: { code: string } }>("POST", `/jobs/offers/${sneaky!.id}/accept`, "james");
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe("SCHEDULE_CONFLICT");
  });

  it("locks arriving after too many wrong arrival codes", async () => {
    const conv = (await call<CreateConversationResponse>("POST", "/ai/conversations", "margaret")).body.conversation;
    const submitted = await call<CreateServiceRequestResponse>("POST", "/requests", "margaret", {
      conversationId: conv.id,
      serviceCategoryId: "ERRANDS",
      description: "Return a package",
      location: "123 Main Street, Atlanta, GA",
      requestedDate: addDays(todayIn("America/New_York"), 1),
      requestedStartTime: "09:00",
    });
    const requestId = submitted.body.request.id;
    const offer = (await call<JobOfferDTO[]>("GET", "/jobs/available", "maria")).body.find((o) => o.requestId === requestId)!;
    const job = (await call<JobDetailDTO>("POST", `/jobs/offers/${offer.id}/accept`, "maria")).body;
    const code = (await call<JobDetailDTO>("GET", `/jobs/${job.id}`, "margaret")).body.arrivalCode!;
    const wrong = code === "0000" ? "1111" : "0000";
    await call("PATCH", `/jobs/${job.id}/status`, "maria", { status: "EN_ROUTE" });

    const codes: string[] = [];
    for (let i = 0; i < 5; i++) {
      codes.push((await call<{ error: { code: string } }>("PATCH", `/jobs/${job.id}/status`, "maria", { status: "ARRIVED", arrivalCode: wrong })).body.error.code);
    }
    expect(codes).toEqual(["INVALID_ARRIVAL_CODE", "INVALID_ARRIVAL_CODE", "INVALID_ARRIVAL_CODE", "INVALID_ARRIVAL_CODE", "TOO_MANY_ATTEMPTS"]);

    // Even the right code is refused now, but an admin can still mark it arrived.
    const locked = await call("PATCH", `/jobs/${job.id}/status`, "maria", { status: "ARRIVED", arrivalCode: code });
    expect(locked.status).toBe(429);
    const byAdmin = await call<JobDetailDTO>("PATCH", `/jobs/${job.id}/status`, "admin", { status: "ARRIVED" });
    expect(byAdmin.body.status).toBe("ARRIVED");
  });

  it("expires offers nobody answers and passes the job to the next worker", async () => {
    // A second app on the same database that only offers each request to one worker at a time.
    const oneAtATime = await buildApp({
      config: loadConfig({ seedOnStart: false, jwtSecret: "test-secret", aiServiceModule: "", matchingServiceModule: "", rateLimitEnabled: false, matchInitialOffers: 1 }),
      dbHandle: handle,
      logger: false,
      backgroundJobs: false,
    });
    const call2 = async <T,>(method: string, url: string, who: string, body?: unknown) => {
      const res = await oneAtATime.app.inject({
        method: method as "GET",
        url: `/api/v1${url}`,
        headers: { authorization: `Bearer ${tokens[who]}` },
        ...(body !== undefined && { payload: body as object }),
      });
      return { status: res.statusCode, body: res.json() as T };
    };

    const conv = (await call2<CreateConversationResponse>("POST", "/ai/conversations", "margaret")).body.conversation;
    const submitted = await call2<CreateServiceRequestResponse>("POST", "/requests", "margaret", {
      conversationId: conv.id,
      serviceCategoryId: "MOVING_ASSISTANCE",
      description: "Move a table",
      location: "123 Main Street, Atlanta, GA",
      requestedDate: addDays(todayIn("America/New_York"), 5),
      requestedStartTime: "10:00",
    });
    const requestId = submitted.body.request.id;
    expect(submitted.body.notifiedWorkerCount).toBe(1);

    const jamesOffer = (await call2<JobOfferDTO[]>("GET", "/jobs/available", "james")).body.find((o) => o.requestId === requestId)!;
    expect(Date.parse(jamesOffer.expiresAt) - Date.parse(jamesOffer.createdAt)).toBe(300_000);
    expect((await call2<JobOfferDTO[]>("GET", "/jobs/available", "tom")).body.some((o) => o.requestId === requestId)).toBe(false);

    // Jump past the 5 minute window.
    const events: RealtimeEvent[] = [];
    const unsubscribe = oneAtATime.bus.subscribe(ids.james!, (e) => events.push(e));
    const expired = await oneAtATime.services.matching.expireOffers(new Date(Date.now() + 301_000));
    unsubscribe();
    expect(expired).toBeGreaterThanOrEqual(1);
    expect(events.some((e) => e.type === "JOB_NO_LONGER_AVAILABLE" && e.data.requestId === requestId)).toBe(true);

    expect((await call2<JobOfferDTO[]>("GET", "/jobs/available", "james")).body.some((o) => o.requestId === requestId)).toBe(false);
    const tooLate = await call2<{ error: { code: string } }>("POST", `/jobs/offers/${jamesOffer.id}/accept`, "james");
    expect(tooLate.body.error.code).toBe("JOB_NO_LONGER_AVAILABLE");

    // Tom is next in line and can take it.
    const tomOffer = (await call2<JobOfferDTO[]>("GET", "/jobs/available", "tom")).body.find((o) => o.requestId === requestId)!;
    expect(tomOffer).toBeDefined();
    expect((await call2("POST", `/jobs/offers/${tomOffer.id}/accept`, "tom")).status).toBe(200);

    await oneAtATime.app.close();
  });

  it("does not offer jobs to unverified workers until an admin verifies them", async () => {
    const workers = await call<Array<{ id: string; firstName: string }>>("GET", "/admin/workers", "admin");
    const linda = workers.body.find((w) => w.firstName === "Linda")!;
    const loginLinda = await call<AuthResponse>("POST", "/auth/login", undefined, { email: "linda@handy.demo", password: DEMO_PASSWORD });
    tokens.linda = loginLinda.body.token;

    const submit = async () => {
      const conv = (await call<CreateConversationResponse>("POST", "/ai/conversations", "margaret")).body.conversation;
      const r = await call<CreateServiceRequestResponse>("POST", "/requests", "margaret", {
        conversationId: conv.id,
        serviceCategoryId: "COMPANIONSHIP",
        description: "Friendly visit",
        location: "123 Main Street, Atlanta, GA",
        requestedDate: addDays(todayIn("America/New_York"), 3),
        requestedStartTime: "11:00",
      });
      return r.body.request.id;
    };
    const first = await submit();
    expect((await call<JobOfferDTO[]>("GET", "/jobs/available", "linda")).body.some((o) => o.requestId === first)).toBe(false);

    expect((await call("PATCH", `/admin/workers/${linda.id}/verification`, "admin", { verificationStatus: "VERIFIED" })).status).toBe(200);
    const second = await submit();
    expect((await call<JobOfferDTO[]>("GET", "/jobs/available", "linda")).body.some((o) => o.requestId === second)).toBe(true);
  });

  it("reports admin stats", async () => {
    const stats = await call<{ activeRequests: number; completedToday: number; totalWorkers: number }>("GET", "/admin/stats", "admin");
    expect(stats.body.completedToday).toBeGreaterThanOrEqual(1);
    expect(stats.body.activeRequests).toBeGreaterThanOrEqual(2);
    expect(stats.body.totalWorkers).toBe(9);
  });
});

describe("realtime transport", () => {
  it("authenticates WebSocket connections and delivers events", async () => {
    const address = await ctx.app.listen({ port: 0, host: "127.0.0.1" });
    const wsUrl = address.replace("http", "ws") + "/api/v1/ws";

    const rejected = await new Promise<number>((resolve) => {
      const ws = new WebSocket(`${wsUrl}?token=bogus`);
      ws.on("close", (code) => resolve(code));
    });
    expect(rejected).toBe(4401);

    const ws = new WebSocket(`${wsUrl}?token=${tokens.margaret}`);
    const received: Array<{ type: string }> = [];
    await new Promise<void>((resolve) => {
      ws.on("message", (raw) => {
        received.push(JSON.parse(raw.toString()));
        if (received.length === 2) resolve();
      });
      ws.on("open", async () => {
        // Wait for the hello, then trigger an event for Margaret.
        setTimeout(() => void call("POST", "/ai/conversations", "margaret").then(async (r) => {
          const convId = (r.body as CreateConversationResponse).conversation.id;
          await call("POST", "/requests", "margaret", {
            conversationId: convId,
            serviceCategoryId: "ERRANDS",
            description: "Pick up prescriptions",
            location: "123 Main Street, Atlanta, GA",
            requestedDate: addDays(todayIn("America/New_York"), 1),
            requestedStartTime: "12:00",
          });
        }), 50);
      });
    });
    ws.close();
    expect(received[0]!.type).toBe("CONNECTED");
    expect(received[1]!.type).toBe("REQUEST_CREATED");
  });
});

// Runs last: it jumps ahead in time, which expires every request still searching.
describe("request expiry", () => {
  it("closes requests nobody accepted before their time passed", async () => {
    const conv = (await call<CreateConversationResponse>("POST", "/ai/conversations", "margaret")).body.conversation;
    const date = addDays(todayIn("America/New_York"), 6);
    const submitted = await call<CreateServiceRequestResponse>("POST", "/requests", "margaret", {
      conversationId: conv.id,
      serviceCategoryId: "MOVING_ASSISTANCE",
      description: "Move a rug",
      location: "123 Main Street, Atlanta, GA",
      requestedDate: date,
      requestedStartTime: "10:00",
    });
    const requestId = submitted.body.request.id;
    expect((await call<JobOfferDTO[]>("GET", "/jobs/available", "james")).body.some((o) => o.requestId === requestId)).toBe(true);

    // The day before, this request is left alone (earlier requests from other tests do expire).
    await ctx.services.requests.expirePastRequests(new Date(`${addDays(date, -1)}T16:00:00Z`));
    expect((await call<{ status: string }>("GET", `/requests/${requestId}`, "margaret")).body.status).toBe("SEARCHING");

    const events: RealtimeEvent[] = [];
    const unsubscribe = ctx.bus.subscribe(ids.margaret!, (e) => events.push(e));
    // 11:30 AM Eastern on the requested day, after the 10-11 window.
    expect(await ctx.services.requests.expirePastRequests(new Date(`${date}T15:30:00Z`))).toBeGreaterThanOrEqual(1);
    unsubscribe();

    const req = await call<{ status: string; pendingOfferCount: number }>("GET", `/requests/${requestId}`, "margaret");
    expect(req.body.status).toBe("EXPIRED");
    expect(req.body.pendingOfferCount).toBe(0);
    expect(events.some((e) => e.type === "REQUEST_EXPIRED" && e.data.requestId === requestId)).toBe(true);
    expect((await call<JobOfferDTO[]>("GET", "/jobs/available", "james")).body.some((o) => o.requestId === requestId)).toBe(false);

    const notes = await call<Array<{ title: string }>>("GET", "/notifications", "margaret");
    expect(notes.body[0]!.title).toMatch(/^We couldn't find anyone for your moving help on/);
    expect((await call("POST", `/requests/${requestId}/cancel`, "margaret")).status).toBe(409);
  });

  it("rejects dates that already passed", async () => {
    const conv = (await call<CreateConversationResponse>("POST", "/ai/conversations", "margaret")).body.conversation;
    const res = await call<{ error: { code: string } }>("POST", "/requests", "margaret", {
      conversationId: conv.id,
      serviceCategoryId: "ERRANDS",
      description: "Pick up mail",
      location: "123 Main Street, Atlanta, GA",
      requestedDate: addDays(todayIn("America/New_York"), -1),
      requestedStartTime: "10:00",
    });
    expect(res.status).toBe(400);
  });
});
