import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApiClient, type ApiClient } from "@handy/contracts";
import { DEMO_PASSWORD, type DbHandle } from "@handy/db";
import { buildApp, type App } from "../src/app";
import { loadConfig } from "../src/config";
import { addDays, todayIn } from "../src/lib/time";
import { createTestDb } from "./helpers";

describe("voice messages", () => {
  let server: App;
  let handle: DbHandle;
  let baseUrl: string;
  let margaret: ApiClient;
  let james: ApiClient;
  let jobId: string;
  // Any bytes will do; the server stores them as-is.
  const clip = Buffer.from("pretend this is a short recording").toString("base64");

  const login = async (email: string) => {
    const api = createApiClient({ baseUrl });
    await api.auth.login({ email, password: DEMO_PASSWORD });
    return api;
  };

  beforeAll(async () => {
    handle = await createTestDb();
    server = await buildApp({
      config: loadConfig({ seedOnStart: false, jwtSecret: "voice-test", aiServiceModule: "", matchingServiceModule: "", rateLimitEnabled: false, geocoder: "off" }),
      dbHandle: handle,
      logger: false,
      backgroundJobs: false,
    });
    baseUrl = await server.app.listen({ port: 0, host: "127.0.0.1" });
    margaret = await login("margaret@handy.demo");
    james = await login("james@handy.demo");
    const { conversation } = await margaret.conversations.create();
    const { request } = await margaret.requests.create({
      conversationId: conversation.id,
      serviceCategoryId: "MOVING_ASSISTANCE",
      description: "Move a couch",
      location: "123 Main Street, Atlanta, GA",
      requestedDate: addDays(todayIn("America/New_York"), 2),
      requestedStartTime: "10:00",
    });
    const offer = (await james.jobs.available()).find((o) => o.requestId === request.id)!;
    jobId = (await james.jobs.acceptOffer(offer.id)).id;
  });

  afterAll(async () => {
    await server.app.close();
    await handle.close();
  });

  it("both sides can send one and play it back", async () => {
    const fromMargaret = await margaret.jobs.sendVoiceMessage(jobId, { audioBase64: clip, mimeType: "audio/webm;codecs=opus", durationSeconds: 4.4 });
    expect(fromMargaret).toMatchObject({ voiceSeconds: 4, senderName: "Margaret T.", content: "Voice message", flags: [] });
    const fromJames = await james.jobs.sendVoiceMessage(jobId, { audioBase64: clip, mimeType: "audio/mp4", durationSeconds: 12 });

    const list = await james.jobs.messages(jobId);
    expect(list.map((m) => m.voiceSeconds)).toEqual([4, 12]);
    expect(await james.jobs.voiceAudio(jobId, fromMargaret.id)).toEqual({ mimeType: "audio/webm;codecs=opus", audioBase64: clip });
    expect((await margaret.jobs.voiceAudio(jobId, fromJames.id)).mimeType).toBe("audio/mp4");
    const admin = await login("admin@handy.demo");
    expect((await admin.jobs.voiceAudio(jobId, fromJames.id)).audioBase64).toBe(clip);
  });

  it("keeps recordings private to the job", async () => {
    const [message] = await margaret.jobs.messages(jobId);
    const tom = await login("tom@handy.demo");
    await expect(tom.jobs.voiceAudio(jobId, message!.id)).rejects.toMatchObject({ status: 403 });
    const susan = await login("susan@handy.demo");
    await expect(susan.jobs.voiceAudio(jobId, message!.id)).rejects.toMatchObject({ status: 403 });
    await expect(margaret.jobs.voiceAudio(jobId, "00000000-0000-4000-8000-000000000000")).rejects.toMatchObject({ status: 404 });
  });

  it("turns away things that aren't a short recording", async () => {
    await expect(margaret.jobs.sendVoiceMessage(jobId, { audioBase64: clip, mimeType: "image/png", durationSeconds: 3 })).rejects.toMatchObject({ status: 400 });
    await expect(margaret.jobs.sendVoiceMessage(jobId, { audioBase64: clip, mimeType: "audio/webm", durationSeconds: 300 })).rejects.toMatchObject({ status: 400 });
    await expect(margaret.jobs.sendVoiceMessage(jobId, { audioBase64: "not base64!!", mimeType: "audio/webm", durationSeconds: 3 })).rejects.toMatchObject({ status: 400 });
    const tooBig = Buffer.alloc(1_100_000, 1).toString("base64");
    await expect(margaret.jobs.sendVoiceMessage(jobId, { audioBase64: tooBig, mimeType: "audio/webm", durationSeconds: 30 })).rejects.toMatchObject({ status: 400 });
  });

  it("closes along with the chat once the job is done", async () => {
    await james.jobs.updateStatus(jobId, "EN_ROUTE");
    await james.jobs.arrive(jobId, (await margaret.jobs.get(jobId)).arrivalCode!);
    await james.jobs.updateStatus(jobId, "IN_PROGRESS");
    await james.jobs.updateStatus(jobId, "COMPLETED");
    await expect(margaret.jobs.sendVoiceMessage(jobId, { audioBase64: clip, mimeType: "audio/webm", durationSeconds: 3 })).rejects.toMatchObject({ status: 409 });
    // Old recordings can still be played.
    const [message] = await margaret.jobs.messages(jobId);
    expect((await margaret.jobs.voiceAudio(jobId, message!.id)).audioBase64).toBe(clip);
  });
});
