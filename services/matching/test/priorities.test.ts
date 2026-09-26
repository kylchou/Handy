import type { WorkerCandidate } from "@handy/contracts";
import { describe, expect, it } from "vitest";
import { rankWorkers } from "../src/matchingService.js";
import { needsFor, requirementFit } from "../src/requirements.js";
import { URGENT_WEIGHTS, WEIGHTS } from "../src/scoring.js";
import type { MatchableRequest } from "../src/types.js";

const HOME = { latitude: 33.749, longitude: -84.388 }; // Atlanta
const north = (miles: number) => ({ latitude: HOME.latitude + miles / 69.09, longitude: HOME.longitude });

// 2026-09-26 is a Saturday.
const request: MatchableRequest = {
  serviceCategoryId: "MOVING_ASSISTANCE",
  ...HOME,
  requestedDate: "2026-09-26",
  requestedStartTime: "15:00",
  requestedEndTime: "16:00",
};

function worker(id: string, overrides: Partial<WorkerCandidate> = {}): WorkerCandidate {
  return {
    workerId: id,
    displayName: `${id} R.`,
    ...north(2),
    serviceRadius: 15,
    rating: 4.8,
    ratingCount: 30,
    completedJobs: 40,
    completedJobsInCategory: 40,
    availabilityStatus: "AVAILABLE",
    verificationStatus: "VERIFIED",
    qualifications: [{ serviceCategoryId: "MOVING_ASSISTANCE", qualificationLevel: "EXPERIENCED" }],
    weeklyAvailability: [],
    bookedWindows: [],
    ...overrides,
  };
}

const level = (l: "BASIC" | "EXPERIENCED" | "CERTIFIED", category = "MOVING_ASSISTANCE" as const) => ({
  qualifications: [{ serviceCategoryId: category, qualificationLevel: l }],
});

describe("urgency", () => {
  it("urgent weights still sum to 1", () => {
    const sum = (w: typeof WEIGHTS) => Object.values(w).reduce((a, b) => a + b, 0);
    expect(sum(WEIGHTS)).toBeCloseTo(1, 10);
    expect(sum(URGENT_WEIGHTS)).toBeCloseTo(1, 10);
  });

  // near ≈ 86.0 vs far ≈ 86.3 normally; HIGH: near ≈ 87.1 vs far ≈ 82.4
  const near = worker("near", { ...north(1), rating: 4.0 });
  const far = worker("far", { ...north(10), rating: 5.0, ...level("CERTIFIED") });

  it("NORMAL: the better-qualified worker a bit farther away wins", () => {
    expect(rankWorkers({ ...request, urgency: "NORMAL" }, [near, far])[0]!.workerId).toBe("far");
  });

  it("HIGH: the closest worker wins", () => {
    expect(rankWorkers({ ...request, urgency: "HIGH" }, [near, far])[0]!.workerId).toBe("near");
  });
});

describe("special requirements", () => {
  it("finds needs only for categories where they matter", () => {
    expect(needsFor("MOVING_ASSISTANCE", ["Requires lifting assistance"]).map((r) => r.label)).toEqual(["heavy lifting"]);
    expect(needsFor("TECH_SUPPORT", ["Requires lifting assistance"])).toEqual([]);
    expect(needsFor("HOME_MAINTENANCE", ["Customer cannot safely use a ladder"]).map((r) => r.label)).toEqual(["ladder work"]);
    expect(needsFor("TRANSPORTATION", ["Customer uses a wheelchair"]).map((r) => r.label)).toEqual(["mobility help"]);
    expect(needsFor("MOVING_ASSISTANCE", [])).toEqual([]);
  });

  it("penalizes levels below the need, credits levels at or above it", () => {
    const needs = needsFor("MOVING_ASSISTANCE", ["Requires lifting assistance"]);
    expect(requirementFit("BASIC", needs)).toEqual({ penalty: 15, met: [] });
    expect(requirementFit("EXPERIENCED", needs)).toEqual({ penalty: 0, met: ["heavy lifting"] });
    expect(requirementFit("CERTIFIED", needs)).toEqual({ penalty: 0, met: ["heavy lifting"] });
  });

  // Without the need: basic ≈ 84.9 beats experienced ≈ 84.3. With it: basic drops to ≈ 80.4.
  const basic = worker("basic", { ...north(0.5), rating: 5.0, ...level("BASIC") });
  const experienced = worker("experienced", { ...north(5), rating: 4.5 });

  it("no requirement: the closer, better-rated basic worker wins", () => {
    expect(rankWorkers(request, [basic, experienced])[0]!.workerId).toBe("basic");
  });

  it("heavy lifting: the experienced worker wins, basic stays eligible", () => {
    const result = rankWorkers({ ...request, specialRequirements: ["Requires lifting assistance"] }, [basic, experienced]);
    expect(result.map((m) => m.workerId)).toEqual(["experienced", "basic"]);
    expect(result[0]!.reasons).toContain("Experienced with heavy lifting");
    expect(result[1]!.breakdown.qualification).toBe(55);
  });
});
