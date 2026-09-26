# @handy/matching

Finds who can do a confirmed request. Request + candidates in, eligible workers out, best first. Also suggests other times when no one is free, and estimates price.

```
request → qualified? → available? → in range? → score → sort → all eligible workers
```

Implements `MatchingService` from `packages/contracts/src/matching.ts`. Read-only: backend loads candidates, offers the job, creates the `Job` on first accept.

## How the backend uses it

`apps/api` loads this package automatically (`MATCHING_SERVICE_MODULE=@handy/matching`) and calls `createMatchingService()`. Startup log says `Loaded @handy/matching`. Until it loads, the backend's fallback matcher is used.

```ts
const matches = await matching.findMatches(serviceRequest, candidates);
// [{ workerId, score, distance, qualificationMatch, availabilityMatch, rating, reasons, breakdown }, ...]
```

Returns **every** eligible worker, sorted. Backend offers the top `MATCH_INITIAL_OFFERS` first, then the rest after `MATCH_EXPAND_AFTER_SECONDS`. Declined workers and 1–2 star workers for this customer are removed by the backend before the call.

## Rules

**Eligible only if:** qualified for the category, `VERIFIED`, not `OFFLINE`, no overlapping `bookedWindows`, has a `weeklyAvailability` slot overlapping the time that day (empty schedule = free whenever not booked), within `serviceRadius`. Slot only partly covers the time → kept, `availabilityMatch: false`, availability 70.

Missing coordinates on either side → `distance: null`, radius not enforced, distance score 50.

**Score (0–100):**

| part | weight | how |
|---|---|---|
| qualification | 30% | BASIC 70, EXPERIENCED 85, CERTIFIED 100 |
| availability | 25% | 100 schedule covers it, 70 partly, 80 no schedule, −20 if busy now |
| distance | 20% | 100 at the door → 40 at radius edge; 50 if unknown |
| rating | 15% | rating / 5 × 100; `ratingCount` 0 = 80 so new workers aren't buried |
| experience | 10% | `completedJobsInCategory`, leveling off (34 jobs ≈ 90) |

Weights from `MATCH_WEIGHTS` in contracts. Helped this customer before (`withCustomer`): +5 if last rating 4–5, else +2. Ties → closer wins. `availabilityMatch` = false only for partial schedule overlap. Each match includes `breakdown` + display `reasons` ("2.4 miles away", "Has helped this customer before").

Spec example score 94.5 is off by 0.25; correct value 94.25, used in tests.

```sh
pnpm --filter @handy/matching test
pnpm --filter @handy/matching typecheck
```

## Extras (not wired into the backend yet)

Exported and tested, but backend doesn't call them. Backend has its own pricing (`apps/api/src/lib/pricing.ts`) and offer timing.

**Alternative times.** No one free → nearest times someone is. Fits the customer's "pick another time" screen after `REQUEST_EXPIRED`.

```ts
suggestAlternativeTimes(request, candidates, { now: { date: "2026-09-26", time: "14:45" } });
// [{ requestedDate, requestedStartTime, requestedEndTime, availableWorkers, topScore }, ...]
```

- Same job length, same eligibility rules
- Order: same day first, then nearest time of day, then earlier
- Defaults: 3 suggestions, 3 days ahead, 08:00–20:00, 30-minute steps

**Price estimate.** `estimatePrice({ serviceCategoryId, requestedStartTime, requestedEndTime, urgency })` → `{ servicePrice, platformFee, total, billedHours }`, whole dollars. First hour flat, then hourly per half hour; `HIGH` urgency +20%; $5 fee. Moving $35 → $40 total.

**Broadcast tiers.** `broadcastTierFor(elapsedMs)` / `workersToNotify(...)`: top 3 → 10 after 2 min → radius ×1.5 after 5 min.

## Needed from Engineer 2

- Optional: an endpoint for alternative times (e.g. `GET /requests/:id/alternatives`) calling `suggestAlternativeTimes`, if Darsh's "pick another time" screen should show real options
