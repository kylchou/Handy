# @handy/matching

Finds who can do a confirmed request. Request in, eligible workers out, best first. Also suggests other times when no one is free, and estimates price.

```
request → qualified? → available? → in range? → score → sort → top workers
```

Read-only. Backend handles notifying workers, creating the `Job` on first accept, and sending `JOB_NO_LONGER_AVAILABLE` to the rest. First-accept-wins must be enforced in backend (transaction or conditional update).

## Usage

```ts
import { DeterministicMatchingService, workersToNotify, broadcastTierFor } from "@handy/matching";

const matching = new DeterministicMatchingService({
  findCandidates: (categoryId) => workerRepository.candidatesFor(categoryId),
});

const tier = broadcastTierFor(elapsedMs);
const matches = await matching.findMatches(request, {
  radiusMultiplier: tier.radiusMultiplier,
  excludeWorkerIds: declinedWorkerIds,
});
const toNotify = workersToNotify(matches, elapsedMs, alreadyNotifiedIds);
```

Workers already loaded → call `rankWorkers(request, candidates, options)` directly.

## Rules

**Eligible only if:** qualified for the category, verified (unless `requireVerified: false`), not offline, not booked at that time, inside weekly schedule (if set), within service radius.

**Score (0–100):**

| part | weight | how |
|---|---|---|
| qualification | 30% | BASIC 70, INTERMEDIATE 85, EXPERT 100 |
| availability | 25% | 100 schedule covers it, 80 no schedule, −20 if busy now |
| distance | 20% | 100 at the door → 40 at radius edge |
| rating | 15% | rating / 5 × 100; unrated = 80 so new workers aren't buried |
| experience | 10% | similar jobs, leveling off (34 jobs ≈ 90) |

Previously used worker: +5. Ties → closer wins. Each match includes `breakdown` + display `reasons` ("2.4 miles away").

**Broadcast tiers:** 0–2 min top 3 → 2–5 min up to 10 → 5+ min radius ×1.5 + offer customer another time. Timers live in backend.

Spec example score 94.5 is off by 0.25; correct value 94.25, used in tests.

## Alternative times

No one free at the requested time → nearest times someone is. Use when a broadcast tier has `suggestAlternativeTime`, or when `findMatches` returns nothing.

```ts
import { suggestAlternativeTimes } from "@handy/matching";

const options = suggestAlternativeTimes(request, candidates, {
  now: { date: "2026-09-26", time: "14:45" }, // customer's local time
});
// [{ requestedDate, requestedStartTime, requestedEndTime, availableWorkers, topScore }, ...]
```

- Same job length as the original request
- Order: same day first, then nearest time of day, then earlier
- Defaults: 3 suggestions, 3 days ahead, 08:00–20:00, 30-minute steps (all options)
- Same eligibility rules as matching

Customer picks one → backend updates the request's date/time and matches again.

## Price estimate

Fills `ServiceRequest.estimatedPrice`. Deterministic, whole dollars.

```ts
import { estimatePrice } from "@handy/matching";

estimatePrice({ serviceCategoryId: "MOVING_ASSISTANCE", requestedStartTime: "15:00", requestedEndTime: "16:00" });
// { servicePrice: 35, platformFee: 5, total: 40, billedHours: 1, currency: "USD" }
```

- First hour flat, then hourly, billed per half hour, 1 hour minimum
- `urgency: "high"` → +20%
- `servicePrice` = worker pay ("$35 estimated"); `total` = customer pays
- Flat $5 platform fee
- Rates in `CATEGORY_RATES` (moving $35, errands $25, lawn $40, …); unknown category → $30 default. Custom table as second argument.

```sh
pnpm --filter @handy/matching test
pnpm --filter @handy/matching build
```

## Needed from Engineer 2

- `latitude`, `longitude`, and `HH:MM` start/end times on `ServiceRequestDTO`
- `WorkerQualification.qualificationLevel`: `BASIC | INTERMEDIATE | EXPERT`
- `WorkerProfile.availabilityStatus`: `AVAILABLE | BUSY | OFFLINE`; `verificationStatus`: `VERIFIED | PENDING | REJECTED`
- Optional, used if present: weekly availability table (`dayOfWeek`, `start`, `end`), completed jobs per category
- Call `estimatePrice` when creating a `ServiceRequest`; store `total` or `servicePrice` in `estimatedPrice` (pick one, tell Engineers 1 + 4 which)
