import type { ServiceRequestDTO, WorkerCandidate } from "@handy/contracts";
import { describe, expect, it } from "vitest";
import { broadcastTierFor, workersToNotify } from "../src/broadcast.js";
import { haversineMiles } from "../src/geo.js";
import { createMatchingService } from "../src/index.js";
import { MatchingInputError, rankWorkers } from "../src/matchingService.js";
import { experienceScore, totalScore } from "../src/scoring.js";
import type { MatchableRequest, RankedWorkerMatch } from "../src/types.js";

const HOME = { latitude: 33.749, longitude: -84.388 }; // Atlanta
const MILES_PER_DEGREE_LAT = 69.09;

/** A point `miles` due north of HOME. */
const north = (miles: number) => ({ latitude: HOME.latitude + miles / MILES_PER_DEGREE_LAT, longitude: HOME.longitude });

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

const ids = (matches: RankedWorkerMatch[]) => matches.map((m) => m.workerId);

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
  it("requires the qualification for the requested category", () => {
    const lawnOnly = worker("lawn", { qualifications: [{ serviceCategoryId: "LAWN_CARE", qualificationLevel: "CERTIFIED" }] });
    expect(ids(rankWorkers(request, [worker("mover"), lawnOnly]))).toEqual(["mover"]);
  });

  it("excludes unverified and offline workers", () => {
    const result = rankWorkers(request, [
      worker("ok"),
      worker("pending", { verificationStatus: "PENDING" }),
      worker("unverified", { verificationStatus: "UNVERIFIED" }),
      worker("offline", { availabilityStatus: "OFFLINE" }),
    ]);
    expect(ids(result)).toEqual(["ok"]);
  });

  it("excludes workers outside their service radius, unless the radius is widened", () => {
    const far = worker("far", { ...north(12), serviceRadius: 10 });
    expect(rankWorkers(request, [far])).toEqual([]);
    expect(ids(rankWorkers(request, [far], { radiusMultiplier: 1.5 }))).toEqual(["far"]);
  });

  it("skips the radius check and returns distance null when coordinates are missing", () => {
    const noCoords = worker("nocoords", { latitude: null, longitude: null, serviceRadius: 1 });
    const [match] = rankWorkers(request, [noCoords]);
    expect(match?.distance).toBeNull();
    expect(match?.breakdown.distance).toBe(50);
  });

  it("excludes workers already booked for an overlapping time", () => {
    const booked = worker("booked", { bookedWindows: [{ date: "2026-09-26", startTime: "14:30", endTime: "15:30" }] });
    const bookedEarlier = worker("free", { bookedWindows: [{ date: "2026-09-26", startTime: "13:00", endTime: "15:00" }] });
    expect(ids(rankWorkers(request, [booked, bookedEarlier]))).toEqual(["free"]);
  });

  it("respects weekly schedules", () => {
    const weekdaysOnly = worker("weekdays", {
      weeklyAvailability: [1, 2, 3, 4, 5].map((d) => ({ dayOfWeek: d, startTime: "15:00", endTime: "21:00" })),
    });
    const saturday = worker("saturday", { weeklyAvailability: [{ dayOfWeek: 6, startTime: "09:00", endTime: "17:00" }] });
    const result = rankWorkers(request, [weekdaysOnly, saturday]);
    expect(ids(result)).toEqual(["saturday"]);
    expect(result[0]!.availabilityMatch).toBe(true);
  });

  it("keeps a partly available worker, ranked lower, with availabilityMatch false", () => {
    const full = worker("full", { weeklyAvailability: [{ dayOfWeek: 6, startTime: "12:00", endTime: "18:00" }] });
    const partly = worker("partly", { weeklyAvailability: [{ dayOfWeek: 6, startTime: "15:30", endTime: "18:00" }] });
    const result = rankWorkers(request, [partly, full]);
    expect(ids(result)).toEqual(["full", "partly"]);
    expect(result[1]).toMatchObject({ availabilityMatch: false, breakdown: { availability: 70 } });
    expect(result[1]!.reasons).toContain("Partly available at the requested time");
  });

  it("treats an empty schedule as free (availabilityMatch true, score 80)", () => {
    const [match] = rankWorkers(request, [worker("noschedule")]);
    expect(match).toMatchObject({ availabilityMatch: true, breakdown: { availability: 80 } });
  });

  it("skips excluded workers", () => {
    expect(ids(rankWorkers(request, [worker("a"), worker("b")], { excludeWorkerIds: ["a"] }))).toEqual(["b"]);
  });
});

describe("rankWorkers ranking", () => {
  it("ranks closer, better-rated, more experienced workers first", () => {
    const james = worker("james", {
      ...north(2.4),
      rating: 4.9,
      ratingCount: 60,
      completedJobs: 87,
      completedJobsInCategory: 34,
      qualifications: [{ serviceCategoryId: "MOVING_ASSISTANCE", qualificationLevel: "CERTIFIED" }],
      weeklyAvailability: [{ dayOfWeek: 6, startTime: "12:00", endTime: "18:00" }],
    });
    const newbie = worker("newbie", {
      ...north(1),
      rating: 0,
      ratingCount: 0,
      completedJobs: 0,
      completedJobsInCategory: 0,
      qualifications: [{ serviceCategoryId: "MOVING_ASSISTANCE", qualificationLevel: "BASIC" }],
    });
    const far = worker("far", { ...north(13) });

    // Expected: james ≈ 96.7, far ≈ 78.8, newbie ≈ 72.2
    const result = rankWorkers(request, [far, newbie, james]);
    expect(ids(result)).toEqual(["james", "far", "newbie"]);
    expect(result[0]!.distance).toBeCloseTo(2.4, 1);
    expect(result[0]!.score).toBeGreaterThan(90);
    expect(result[0]!.reasons).toEqual(expect.arrayContaining(["2.4 miles away", "4.9-star rating", "34 similar jobs completed"]));
  });

  it("returns every eligible worker by default, sorted", () => {
    const workers = Array.from({ length: 8 }, (_, i) => worker(`w${i}`, { ...north(i + 1) }));
    const all = rankWorkers(request, workers);
    expect(all).toHaveLength(8);
    expect(ids(all).slice(0, 3)).toEqual(["w0", "w1", "w2"]);
    expect(rankWorkers(request, workers, { limit: 3 })).toHaveLength(3);
  });

  it("boosts workers the customer liked before", () => {
    const a = worker("a", { ...north(1) });
    const b = worker("b", { ...north(2), withCustomer: { completedJobs: 2, lastRating: 5 } });
    const result = rankWorkers(request, [a, b]);
    expect(result[0]!.workerId).toBe("b");
    expect(result[0]!.reasons).toContain("Has helped this customer before");
  });

  it("reports BUSY workers as available but scores them lower", () => {
    const result = rankWorkers(request, [worker("busy", { availabilityStatus: "BUSY" }), worker("free")]);
    expect(ids(result)).toEqual(["free", "busy"]);
    expect(result[1]!.breakdown.availability).toBe(60);
  });
});

describe("input validation", () => {
  it("rejects a bad time window", () => {
    expect(() => rankWorkers({ ...request, requestedEndTime: "14:00" }, [])).toThrow(MatchingInputError);
    expect(() => rankWorkers({ ...request, requestedStartTime: "3pm" }, [])).toThrow(MatchingInputError);
  });
});

describe("createMatchingService", () => {
  it("implements the contract: findMatches(request, candidates)", async () => {
    const dto = { ...request, id: "req-1" } as unknown as ServiceRequestDTO;
    const result = await createMatchingService().findMatches(dto, [worker("james")]);
    expect(result[0]).toMatchObject({ workerId: "james", qualificationMatch: true });
  });
});

describe("broadcast tiers", () => {
  const matches = Array.from({ length: 12 }, (_, i) => ({ workerId: `w${i}` }) as RankedWorkerMatch);

  it("widens over time: top 3, then 10, then a larger radius", () => {
    expect(broadcastTierFor(0).maxWorkers).toBe(3);
    expect(broadcastTierFor(2 * 60_000).maxWorkers).toBe(10);
    const late = broadcastTierFor(6 * 60_000);
    expect(late.radiusMultiplier).toBe(1.5);
    expect(late.suggestAlternativeTime).toBe(true);
  });

  it("only notifies new workers up to the tier's cap", () => {
    const first = workersToNotify(matches, 0, new Set());
    expect(ids(first as RankedWorkerMatch[])).toEqual(["w0", "w1", "w2"]);
    const notified = new Set(first.map((m) => m.workerId));
    expect(workersToNotify(matches, 30_000, notified)).toEqual([]);
    expect(workersToNotify(matches, 3 * 60_000, notified)).toHaveLength(7);
  });
});
