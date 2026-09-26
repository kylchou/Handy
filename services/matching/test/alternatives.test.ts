import { describe, expect, it } from "vitest";
import { suggestAlternativeTimes } from "../src/alternatives.js";
import type { MatchableRequest, WorkerCandidate } from "../src/types.js";

// 2026-09-26 is a Saturday.
const request: MatchableRequest = {
  serviceCategoryId: "MOVING_ASSISTANCE",
  latitude: 33.749,
  longitude: -84.388,
  requestedDate: "2026-09-26",
  requestedStartTime: "15:00",
  requestedEndTime: "16:00",
};

function worker(id: string, overrides: Partial<WorkerCandidate> = {}): WorkerCandidate {
  return {
    workerId: id,
    latitude: 33.77,
    longitude: -84.388,
    serviceRadiusMiles: 15,
    rating: 4.8,
    completedJobs: 20,
    availabilityStatus: "AVAILABLE",
    verificationStatus: "VERIFIED",
    qualifications: [{ serviceCategoryId: "MOVING_ASSISTANCE", qualificationLevel: "EXPERT" }],
    ...overrides,
  };
}

const slots = (res: ReturnType<typeof suggestAlternativeTimes>) =>
  res.map((s) => `${s.requestedDate} ${s.requestedStartTime}-${s.requestedEndTime}`);

describe("suggestAlternativeTimes", () => {
  it("suggests the nearest free slots on the same day first", () => {
    const busyAt3 = worker("james", { bookedSlots: [{ date: "2026-09-26", start: "15:00", end: "16:00" }] });
    expect(slots(suggestAlternativeTimes(request, [busyAt3]))).toEqual([
      "2026-09-26 14:00-15:00",
      "2026-09-26 16:00-17:00",
      "2026-09-26 13:30-14:30",
    ]);
  });

  it("moves to later days when the requested day has nothing", () => {
    const sundaysOnly = worker("sam", { weeklyAvailability: [{ dayOfWeek: 0, start: "09:00", end: "17:00" }] });
    const res = suggestAlternativeTimes(request, [sundaysOnly], { maxSuggestions: 1 });
    expect(slots(res)).toEqual(["2026-09-27 15:00-16:00"]);
    expect(res[0]).toMatchObject({ availableWorkers: 1 });
    expect(res[0]!.topScore).toBeGreaterThan(0);
  });

  it("keeps the original job length", () => {
    const twoHours = { ...request, requestedEndTime: "17:00" };
    const busy = worker("james", { bookedSlots: [{ date: "2026-09-26", start: "15:00", end: "17:00" }] });
    expect(slots(suggestAlternativeTimes(twoHours, [busy], { maxSuggestions: 1 }))).toEqual(["2026-09-26 13:00-15:00"]);
  });

  it("skips slots before the customer's current time", () => {
    const busyAt3 = worker("james", { bookedSlots: [{ date: "2026-09-26", start: "15:00", end: "16:00" }] });
    const res = suggestAlternativeTimes(request, [busyAt3], { now: { date: "2026-09-26", time: "14:45" } });
    expect(slots(res)[0]).toBe("2026-09-26 16:00-17:00");
  });

  it("returns nothing when no qualified worker exists", () => {
    const lawnOnly = worker("pat", { qualifications: [{ serviceCategoryId: "LAWN_CARE", qualificationLevel: "EXPERT" }] });
    expect(suggestAlternativeTimes(request, [lawnOnly])).toEqual([]);
  });
});
