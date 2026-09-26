import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import type { AIConversationContext, AIService, MatchingService, ServiceRequestDTO, WorkerCandidate } from "@handy/contracts";
import { loadIntegrations } from "../src/integrations";
import { FallbackAIService } from "../src/integrations/fallback-ai";
import { FallbackMatchingService } from "../src/integrations/fallback-matching";
import { GuardedAIService, GuardedMatchingService } from "../src/integrations/guarded";

const quietLog = () => {
  const warnings: string[] = [];
  return { warnings, info: () => {}, warn: (msg: string) => void warnings.push(msg) };
};

describe("loading teammates' packages", () => {
  const dir = mkdtempSync(join(tmpdir(), "handy-integrations-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const fakeModule = (name: string, source: string) => {
    const file = join(dir, `${name}.mjs`);
    writeFileSync(file, source);
    return pathToFileURL(file).href;
  };

  it("still starts if the AI package throws on setup", async () => {
    const log = quietLog();
    const ai = fakeModule("throws", `export function createAIService() { throw new Error("ANTHROPIC_API_KEY is not set"); }`);
    const loaded = await loadIntegrations({ ai, matching: "" }, log);
    expect(loaded.ai).toBeInstanceOf(FallbackAIService);
    expect(log.warnings.join()).toContain("ANTHROPIC_API_KEY is not set");
  });

  it("falls back when the factory returns the wrong thing", async () => {
    const log = quietLog();
    const matching = fakeModule("wrong-shape", `export function createMatchingService() { return { rank() {} }; }`);
    const loaded = await loadIntegrations({ ai: "", matching }, log);
    expect(loaded.matching).toBeInstanceOf(FallbackMatchingService);
    expect(log.warnings.join()).toContain("findMatches");
  });

  it("wraps packages that load fine", async () => {
    const ai = fakeModule("ok-ai", `export async function createAIService() { return { processMessage: async () => ({}) }; }`);
    const loaded = await loadIntegrations({ ai, matching: "" }, quietLog());
    expect(loaded.ai).toBeInstanceOf(GuardedAIService);
  });
});

const context: AIConversationContext = {
  history: [],
  currentDraft: {},
  customer: { firstName: "Margaret", homeAddress: "123 Main St, Atlanta" },
  now: "2026-09-26T16:00:00.000Z",
  today: "2026-09-26",
  timezone: "America/New_York",
  serviceCategories: [{ id: "LAWN_CARE", name: "Lawn Care", description: "", requiresQualification: false, basePriceCents: 4000 }],
  pastWorkers: [{ workerId: "w-james", firstName: "James", displayName: "James R.", lastServiceCategoryId: "LAWN_CARE", yourLastRating: 5 }],
};

describe("GuardedAIService", () => {
  const guard = (processMessage: AIService["processMessage"]) => {
    const log = quietLog();
    return { log, ai: new GuardedAIService({ processMessage }, new FallbackAIService(), log) };
  };

  it("answers with the built-in assistant when the real one crashes", async () => {
    const { ai, log } = guard(async () => {
      throw new Error("rate limited");
    });
    const res = await ai.processMessage("c1", "I need my lawn mowed", context);
    expect(res.message.length).toBeGreaterThan(0);
    expect(res.extractedData.serviceCategoryId).toBe("LAWN_CARE");
    expect(log.warnings.join()).toContain("rate limited");
  });

  it("cleans up fields the backend can't use", async () => {
    const { ai } = guard(async () => ({
      message: " Got it! ",
      extractedData: {
        serviceCategoryId: "GARDENING" as never,
        urgency: "high" as never,
        requestedDate: "tomorrow",
        requestedStartTime: "9:30",
        location: null,
        preferredWorkerId: "someone-else",
        repeat: "DAILY" as never,
      },
      missingInformation: ["serviceCategory", "requestedDate"],
      readyToSubmit: "yes" as never,
      safetyStatus: "normal_service" as never,
    }));
    const res = await ai.processMessage("c1", "hi", context);
    expect(res).toEqual({
      message: "Got it!",
      extractedData: { urgency: "HIGH", requestedStartTime: "09:30", location: null },
      missingInformation: ["requestedDate"],
      readyToSubmit: false,
      safetyStatus: "NORMAL_SERVICE",
    });
  });

  it("keeps a past helper the customer asked for", async () => {
    const { ai } = guard(async () => ({
      message: "I'll ask James first.",
      extractedData: { preferredWorkerId: "w-james", repeat: "WEEKLY" },
      missingInformation: [],
      readyToSubmit: false,
      safetyStatus: "NORMAL_SERVICE",
    }));
    const res = await ai.processMessage("c1", "can James come back every week", context);
    expect(res.extractedData).toEqual({ preferredWorkerId: "w-james", repeat: "WEEKLY" });
  });

  it("falls back when the answer has no message", async () => {
    const { ai, log } = guard(async () => ({ extractedData: {} }) as never);
    const res = await ai.processMessage("c1", "I need my lawn mowed", context);
    expect(res.message.length).toBeGreaterThan(0);
    expect(log.warnings.join()).toContain("no message");
  });
});

describe("GuardedMatchingService", () => {
  const request = { id: "r1" } as ServiceRequestDTO;
  const candidate = (workerId: string, rating = 4.5) => ({ workerId, rating }) as WorkerCandidate;
  const fallback: MatchingService = { findMatches: async () => [{ workerId: "backup", score: 1, distance: null, qualificationMatch: true, availabilityMatch: true, rating: 4 }] };

  it("uses the backup matcher when the real one crashes", async () => {
    const log = quietLog();
    const matching = new GuardedMatchingService({ findMatches: async () => Promise.reject(new Error("boom")) }, fallback, log);
    expect((await matching.findMatches(request, [candidate("a")]))[0]!.workerId).toBe("backup");
    expect(log.warnings.join()).toContain("boom");
  });

  it("drops unknown or repeated workers, clamps scores, and sorts best first", async () => {
    const matching = new GuardedMatchingService(
      {
        findMatches: async () => [
          { workerId: "a", score: 40, distance: 2, qualificationMatch: true, availabilityMatch: true, rating: 4.5 },
          { workerId: "stranger", score: 99, distance: 1, qualificationMatch: true, availabilityMatch: true, rating: 5 },
          { workerId: "b", score: 250, distance: null, qualificationMatch: true, availabilityMatch: true, rating: 4.9 },
          { workerId: "a", score: 90, distance: 2, qualificationMatch: true, availabilityMatch: true, rating: 4.5 },
        ],
      },
      fallback,
      quietLog(),
    );
    const matches = await matching.findMatches(request, [candidate("a"), candidate("b")]);
    expect(matches.map((m) => [m.workerId, m.score])).toEqual([
      ["b", 100],
      ["a", 40],
    ]);
  });
});
