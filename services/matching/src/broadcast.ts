import type { WorkerMatch } from "./types.js";

/**
 * Top few workers notified first, more if no one accepts, then wider radius.
 * Timers live in backend; re-run findMatches with each tier's radiusMultiplier.
 */
export interface BroadcastTier {
  /** Tier start, ms after request created. */
  fromMs: number;
  /** Total workers notified by end of tier. */
  maxWorkers: number;
  radiusMultiplier: number;
  /** No accepts yet → offer customer another time. */
  suggestAlternativeTime: boolean;
}

export const BROADCAST_TIERS: readonly BroadcastTier[] = [
  { fromMs: 0, maxWorkers: 3, radiusMultiplier: 1, suggestAlternativeTime: false },
  { fromMs: 2 * 60_000, maxWorkers: 10, radiusMultiplier: 1, suggestAlternativeTime: false },
  { fromMs: 5 * 60_000, maxWorkers: 25, radiusMultiplier: 1.5, suggestAlternativeTime: true },
];

export function broadcastTierFor(elapsedMs: number): BroadcastTier {
  let current = BROADCAST_TIERS[0]!;
  for (const tier of BROADCAST_TIERS) if (elapsedMs >= tier.fromMs) current = tier;
  return current;
}

/** Ranked matches to notify now, minus already-notified. Call each tick with latest findMatches result. */
export function workersToNotify(
  matches: WorkerMatch[],
  elapsedMs: number,
  alreadyNotified: ReadonlySet<string>,
): WorkerMatch[] {
  const { maxWorkers } = broadcastTierFor(elapsedMs);
  const room = Math.max(0, maxWorkers - alreadyNotified.size);
  return matches.filter((m) => !alreadyNotified.has(m.workerId)).slice(0, room);
}
