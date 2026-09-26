import { rankWorkers } from "./matchingService.js";
import { addDays, fromMinutes, toMinutes } from "./time.js";
import type { WorkerCandidate } from "@handy/contracts";
import type { FindMatchesOptions, MatchableRequest } from "./types.js";

export interface AlternativeTime {
  /** YYYY-MM-DD */
  requestedDate: string;
  /** HH:MM, 24-hour */
  requestedStartTime: string;
  /** HH:MM, 24-hour. Same length as the original request. */
  requestedEndTime: string;
  /** Eligible workers for this slot. */
  availableWorkers: number;
  /** Best match score for this slot, 0–100. */
  topScore: number;
}

export interface AlternativeTimeOptions extends Pick<FindMatchesOptions, "radiusMultiplier" | "requireVerified" | "excludeWorkerIds"> {
  /** Max suggestions. Default 3. */
  maxSuggestions?: number;
  /** Days after the requested date to search. Default 3. */
  daysAhead?: number;
  /** Earliest start of day. Default "08:00". */
  dayStart?: string;
  /** Latest end of day. Default "20:00". */
  dayEnd?: string;
  /** Slot spacing, minutes. Default 30. */
  stepMinutes?: number;
  /** Customer's local now. Slots before it are skipped. */
  now?: { date: string; time: string };
}

/**
 * No one available at the requested time → nearest times someone is.
 * Closest first: same day beats later days, then nearest time of day, then earlier.
 * Use when a request EXPIRES (backend sends REQUEST_EXPIRED) or findMatches returns nothing.
 */
export function suggestAlternativeTimes(
  request: MatchableRequest,
  candidates: WorkerCandidate[],
  options: AlternativeTimeOptions = {},
): AlternativeTime[] {
  const maxSuggestions = options.maxSuggestions ?? 3;
  const daysAhead = options.daysAhead ?? 3;
  const dayStart = toMinutes(options.dayStart ?? "08:00");
  const dayEnd = toMinutes(options.dayEnd ?? "20:00");
  const step = options.stepMinutes ?? 30;

  const originalStart = toMinutes(request.requestedStartTime);
  const duration = toMinutes(request.requestedEndTime) - originalStart;
  const matchOptions: FindMatchesOptions = {
    radiusMultiplier: options.radiusMultiplier,
    requireVerified: options.requireVerified,
    excludeWorkerIds: options.excludeWorkerIds ? [...options.excludeWorkerIds] : undefined,
  };

  const found: Array<AlternativeTime & { dayOffset: number; timeDiff: number }> = [];

  for (let dayOffset = 0; dayOffset <= daysAhead; dayOffset++) {
    const date = addDays(request.requestedDate, dayOffset);
    if (options.now && date < options.now.date) continue;

    for (let start = dayStart; start + duration <= dayEnd; start += step) {
      if (dayOffset === 0 && start === originalStart) continue;
      const startTime = fromMinutes(start);
      if (options.now && date === options.now.date && startTime < options.now.time) continue;

      const slot = { ...request, requestedDate: date, requestedStartTime: startTime, requestedEndTime: fromMinutes(start + duration) };
      const matches = rankWorkers(slot, candidates, matchOptions);
      if (matches.length === 0) continue;

      found.push({
        requestedDate: slot.requestedDate,
        requestedStartTime: slot.requestedStartTime,
        requestedEndTime: slot.requestedEndTime,
        availableWorkers: matches.length,
        topScore: matches[0]!.score,
        dayOffset,
        timeDiff: Math.abs(start - originalStart),
      });
    }
  }

  found.sort((a, b) => a.dayOffset - b.dayOffset || a.timeDiff - b.timeDiff || a.requestedStartTime.localeCompare(b.requestedStartTime));
  return found.slice(0, maxSuggestions).map(({ dayOffset: _d, timeDiff: _t, ...slot }) => slot);
}
