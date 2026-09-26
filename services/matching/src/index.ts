import { DeterministicMatchingService } from "./matchingService.js";

export { suggestAlternativeTimes } from "./alternatives.js";
export type { AlternativeTime, AlternativeTimeOptions } from "./alternatives.js";
export { BROADCAST_TIERS, broadcastTierFor, workersToNotify } from "./broadcast.js";
export type { BroadcastTier } from "./broadcast.js";
export { haversineMiles } from "./geo.js";
export { checkAvailability, DeterministicMatchingService, MatchingInputError, rankWorkers } from "./matchingService.js";
export { CATEGORY_RATES, DEFAULT_RATE, estimatePrice, PLATFORM_FEE, URGENT_MULTIPLIER } from "./pricing.js";
export type { CategoryRate, PriceEstimate, PriceInput } from "./pricing.js";
export {
  distanceScore,
  experienceScore,
  qualificationScore,
  ratingScore,
  totalScore,
  WEIGHTS,
} from "./scoring.js";
export type * from "./types.js";

/** Factory the backend loads (apps/api/src/integrations). */
export function createMatchingService(): DeterministicMatchingService {
  return new DeterministicMatchingService();
}
