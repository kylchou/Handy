import { describe, expect, it } from "vitest";
import { broadcastTierFor, workersToNotify } from "../src/broadcast.js";
import { haversineMiles } from "../src/geo.js";
import { DeterministicMatchingService, MatchingInputError, rankWorkers } from "../src/matchingService.js";
import { experienceScore, totalScore } from "../src/scoring.js";
import type { MatchableRequest, WorkerCandidate, WorkerMatch } from "../src/types.js";

const HOME = { latitude: 33.749, longitude: -84.388 }; // Atlanta
const MILES_PER_DEGREE_LAT = 69.09;

/** A point `miles` due north of HOME. */
const north = (miles: number) => ({ latitude: HOME.latitude + miles / MILES_PER_DEGREE_LAT, longitude: HOME.longitude });

// 2026-09-26 is a Saturday.
const request: MatchableRequest = {
  id: "req-1",
  serviceCategoryId: "MOVING_ASSISTANCE",
  ...HOME,
  requestedDate: "2026-09-26",
  requestedStartTime: "15:00",
  requestedEndTime: "16:00",
};

function worker(id: string, overrides: Partial<WorkerCandidate> = {}): WorkerCandidate {
  return {
    workerId: id,
    ...north(2),
    serviceRadiusMiles: 15,
    rating: 4.8,
    completedJobs: 40,
    availabilityStatus: "AVAILABLE",
    verificationStatus: "VERIFIED",
    qualifications: [{ serviceCategoryId: "MOVING_ASSISTANCE", qualificationLevel: "INTERMEDIATE" }],
    ...overrides,
  };
}

describe("haversineMiles", () => {
  it("measures one degree of latitude as ~69 miles", () => {
    expect(haversineMiles(33, -84, 34, -84)).toBeCloseTo(69.09, 0);
  });
});

describe("scoring", () => {
  it("applies the spec weights (30/25/20/15/10)", () => {
    // 30 + 25 + 16 + 14.25 + 9 = 94.25 (the spec's worked example says 94.5; its arithmetic is off by 0.25).
    const score = totalScore({ qualification: 100, availability: 100, distance: 80, rating: 95, experience: 90 });
    expect(score).toBeGreaterThanOrEqual(94.2);
    expect(score).toBeLessThanOrEqual(94.3);
  });

  it("gives ~90 experience for 34 similar jobs", () => {
    expect(experienceScore(34)).toBeGreaterThan(88);
    expect(experienceScore(34)).toBeLessThan(92);
    expect(experienceScore(0)).toBe(0);
  });
});

describe("rankWorkers filters", () => {
  const ids = (matches: WorkerMatch[]) => matches.map((m) => m.workerId);

  it("requires the qualification for the requested category", () => {
    const lawnOnly = worker("lawn", {
      qualifications: [{ serviceCategoryId: "LAWN_CARE", qualificationLevel: "EXPERT" }],
    });
    expect(ids(rankWorkers(request, [worker("mover"), lawnOnly]))).toEqual(["mover"]);
  });

  it("excludes unverified and offline workers", () => {
    const result = rankWorkers(request, [
      worker("ok"),
      worker("pending", { verificationStatus: "PENDING" }),
      worker("offline", { availabilityStatus: "OFFLINE" }),
    ]);
    expect(ids(result)).toEqual(["ok"]);
    expect(ids(rankWorkers(request, [worker("pending", { verificationStatus: "PENDING" })], { requireVerified: false }))).toEqual([
      "pending",
    ]);
  });

  it("excludes workers outside their service radius, unless the radius is widened", () => {
    const far = worker("far", { ...north(12), serviceRadiusMiles: 10 });
    expect(rankWorkers(request, [far])).toEqual([]);
    expect(ids(rankWorkers(request, [far], { radiusMultiplier: 1.5 }))).toEqual(["far"]);
  });

  it("excludes workers already booked for an overlapping time", () => {
    const booked = worker("booked", { bookedSlots: [{ date: "2026-09-26", start: "14:30", end: "15:30" }] });
    const bookedEarlier = worker("free", { bookedSlots: [{ date: "2026-09-26", start: "13:00", end: "15:00" }] });
    expect(ids(rankWorkers(request, [booked, bookedEarlier]))).toEqual(["free"]);
  });

  it("respects weekly schedules", () => {
    const weekdaysOnly = worker("weekdays", {
      weeklyAvailability: [1, 2, 3, 4, 5].map((d) => ({ dayOfWeek: d, start: "15:00", end: "21:00" })),
    });
    const saturday = worker("saturday", { weeklyAvailability: [{ dayOfWeek: 6, start: "09:00", end: "17:00" }] });
    expect(ids(rankWorkers(request, [weekdaysOnly, saturday]))).toEqual(["saturday"]);
  });

  it("skips excluded workers (already declined / already notified)", () => {
    expect(ids(rankWorkers(request, [worker("a"), worker("b")], { excludeWorkerIds: ["a"] }))).toEqual(["b"]);
  });
});

describe("rankWorkers ranking", () => {
  it("ranks closer, better-rated, more experienced experts first", () => {
    const james = worker("james", {
      ...north(2.4),
      rating: 4.9,
      completedJobs: 87,
      completedJobsByCategory: { MOVING_ASSISTANCE: 34 },
      qualifications: [{ serviceCategoryId: "MOVING_ASSISTANCE", qualificationLevel: "EXPERT" }],
      weeklyAvailability: [{ dayOfWeek: 6, start: "12:00", end: "18:00" }],
    });
    const newbie = worker("newbie", { ...north(1), rating: 0, completedJobs: 0, qualifications: [{ serviceCategoryId: "MOVING_ASSISTANCE", qualificationLevel: "BASIC" }] });
    const far = worker("far", { ...north(13) });

    // Expected: james ≈ 96.7, far ≈ 78.8, newbie ≈ 72.2
    const result = rankWorkers(request, [far, newbie, james]);
    expect(result.map((m) => m.workerId)).toEqual(["james", "far", "newbie"]);
    expect(result[0]!.distance).toBeCloseTo(2.4, 1);
    expect(result[0]!.score).toBeGreaterThan(90);
    expect(result[0]!.reasons).toEqual(
      expect.arrayContaining(["2.4 miles away", "4.9-star rating", "34 similar jobs completed"]),
    );
  });

  it("returns scores in descending order and honours the limit", () => {
    const workers = Array.from({ length: 8 }, (_, i) => worker(`w${i}`, { ...north(i + 1) }));
    const result = rankWorkers(request, workers, { limit: 3 });
    expect(result).toHaveLength(3);
    expect(result.map((m) => m.workerId)).toEqual(["w0", "w1", "w2"]);
    expect(result[0]!.score).toBeGreaterThanOrEqual(result[1]!.score);
  });

  it("boosts workers the customer has used before", () => {
    const a = worker("a", { ...north(1) });
    const b = worker("b", { ...north(2) });
    expect(rankWorkers(request, [a, b], { preferredWorkerIds: ["b"] })[0]!.workerId).toBe("b");
  });

  it("reports BUSY workers as available but scores them lower", () => {
    const [free, busy] = [worker("free"), worker("busy", { availabilityStatus: "BUSY" })];
    const result = rankWorkers(request, [busy, free]);
    expect(result.map((m) => m.workerId)).toEqual(["free", "busy"]);
    expect(result[1]!.breakdown.availability).toBe(60);
  });
});

describe("input validation", () => {
  it("rejects requests without coordinates or with a bad time window", () => {
    expect(() => rankWorkers({ ...request, latitude: Number.NaN }, [])).toThrow(MatchingInputError);
    expect(() => rankWorkers({ ...request, requestedEndTime: "14:00" }, [])).toThrow(MatchingInputError);
    expect(() => rankWorkers({ ...request, requestedStartTime: "3pm" }, [])).toThrow(MatchingInputError);
  });
});

describe("DeterministicMatchingService", () => {
  it("loads candidates for the request's category from the WorkerSource", async () => {
    const asked: string[] = [];
    const service = new DeterministicMatchingService({
      findCandidates: async (categoryId) => {
        asked.push(categoryId);
        return [worker("james")];
      },
    });
    const result = await service.findMatches(request);
    expect(asked).toEqual(["MOVING_ASSISTANCE"]);
    expect(result[0]).toMatchObject({ workerId: "james", qualificationMatch: true, availabilityMatch: true });
  });
});

describe("broadcast tiers", () => {
  const matches = Array.from({ length: 12 }, (_, i) => ({ workerId: `w${i}` }) as WorkerMatch);

  it("widens over time: top 3, then 10, then a larger radius", () => {
    expect(broadcastTierFor(0).maxWorkers).toBe(3);
    expect(broadcastTierFor(2 * 60_000).maxWorkers).toBe(10);
    const late = broadcastTierFor(6 * 60_000);
    expect(late.radiusMultiplier).toBe(1.5);
    expect(late.suggestAlternativeTime).toBe(true);
  });

  it("only notifies new workers up to the tier's cap", () => {
    const first = workersToNotify(matches, 0, new Set());
    expect(first.map((m) => m.workerId)).toEqual(["w0", "w1", "w2"]);
    const notified = new Set(first.map((m) => m.workerId));
    expect(workersToNotify(matches, 30_000, notified)).toEqual([]);
    expect(workersToNotify(matches, 3 * 60_000, notified)).toHaveLength(7);
  });
});
