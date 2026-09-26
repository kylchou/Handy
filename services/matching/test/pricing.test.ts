import { describe, expect, it } from "vitest";
import { MatchingInputError } from "../src/matchingService.js";
import { estimatePrice } from "../src/pricing.js";

const job = (category: string, start: string, end: string, urgency?: "LOW" | "NORMAL" | "HIGH") => ({
  serviceCategoryId: category,
  requestedStartTime: start,
  requestedEndTime: end,
  urgency,
});

describe("estimatePrice", () => {
  it("matches the spec example: $35 service + $5 fee = $40", () => {
    expect(estimatePrice(job("MOVING_ASSISTANCE", "15:00", "16:00"))).toEqual({
      servicePrice: 35,
      platformFee: 5,
      total: 40,
      billedHours: 1,
      currency: "USD",
    });
  });

  it("charges the first hour flat, then hourly per half hour", () => {
    expect(estimatePrice(job("MOVING_ASSISTANCE", "14:00", "16:30")).servicePrice).toBe(80); // 35 + 30 × 1.5
    expect(estimatePrice(job("MOVING_ASSISTANCE", "14:00", "15:10")).billedHours).toBe(1.5);
  });

  it("bills at least one hour", () => {
    expect(estimatePrice(job("ERRANDS", "15:00", "15:20")).servicePrice).toBe(25);
  });

  it("adds 20% for urgent jobs", () => {
    expect(estimatePrice(job("MOVING_ASSISTANCE", "15:00", "16:00", "HIGH")).servicePrice).toBe(42);
  });

  it("uses the default rate for unknown categories", () => {
    expect(estimatePrice(job("some-db-id", "15:00", "16:00")).servicePrice).toBe(30);
  });

  it("rejects bad time windows", () => {
    expect(() => estimatePrice(job("ERRANDS", "16:00", "15:00"))).toThrow(MatchingInputError);
    expect(() => estimatePrice(job("ERRANDS", "3pm", "4pm"))).toThrow(MatchingInputError);
  });
});
