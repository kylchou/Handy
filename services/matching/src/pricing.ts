import { MatchingInputError } from "./matchingService.js";
import { toMinutes } from "./time.js";

/** Whole USD. First hour flat, then hourly (billed per half hour). */
export interface CategoryRate {
  firstHour: number;
  perHourAfter: number;
}

/** Demo rates, keyed by category code. Tuned to the spec's examples (moving $35, errand $25, lawn $40). */
export const CATEGORY_RATES: Record<string, CategoryRate> = {
  HOME_MAINTENANCE: { firstHour: 35, perHourAfter: 30 },
  CLEANING: { firstHour: 40, perHourAfter: 30 },
  LAWN_CARE: { firstHour: 40, perHourAfter: 30 },
  ERRANDS: { firstHour: 25, perHourAfter: 20 },
  TRANSPORTATION: { firstHour: 25, perHourAfter: 20 },
  PET_ASSISTANCE: { firstHour: 20, perHourAfter: 15 },
  TECH_SUPPORT: { firstHour: 30, perHourAfter: 25 },
  COMPANIONSHIP: { firstHour: 25, perHourAfter: 20 },
  MOVING_ASSISTANCE: { firstHour: 35, perHourAfter: 30 },
};

/** Unknown category (e.g. DB id instead of code) → this rate. */
export const DEFAULT_RATE: CategoryRate = { firstHour: 30, perHourAfter: 25 };

/** Flat per-job fee, paid by customer, not taken from worker pay. */
export const PLATFORM_FEE = 5;

/** Same-day / urgent jobs pay the worker more. */
export const URGENT_MULTIPLIER = 1.2;

export interface PriceInput {
  serviceCategoryId: string;
  /** HH:MM, 24-hour */
  requestedStartTime: string;
  /** HH:MM, 24-hour */
  requestedEndTime: string;
  urgency?: "low" | "normal" | "high";
}

export interface PriceEstimate {
  /** What the worker earns. Show as "Estimated pay" in worker app. */
  servicePrice: number;
  platformFee: number;
  /** What the customer pays. */
  total: number;
  /** Billed hours after rounding up to the half hour. */
  billedHours: number;
  currency: "USD";
}

/** Deterministic estimate for ServiceRequest.estimatedPrice. Whole dollars. */
export function estimatePrice(input: PriceInput, rates: Record<string, CategoryRate> = CATEGORY_RATES): PriceEstimate {
  const minutes = toMinutes(input.requestedEndTime) - toMinutes(input.requestedStartTime);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    throw new MatchingInputError("requestedEndTime must be after requestedStartTime");
  }

  const rate = rates[input.serviceCategoryId] ?? DEFAULT_RATE;
  const billedHours = Math.max(1, Math.ceil(minutes / 30) / 2);
  let servicePrice = rate.firstHour + rate.perHourAfter * (billedHours - 1);
  if (input.urgency === "high") servicePrice *= URGENT_MULTIPLIER;
  servicePrice = Math.round(servicePrice);

  return {
    servicePrice,
    platformFee: PLATFORM_FEE,
    total: servicePrice + PLATFORM_FEE,
    billedHours,
    currency: "USD",
  };
}
