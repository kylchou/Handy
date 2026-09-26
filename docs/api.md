# API docs

Base URL is `http://localhost:4000/api/v1`. All the types mentioned here come from `@handy/contracts`. If you want the exact response type for an endpoint, check `ApiResponses` in [packages/contracts/src/api.ts](../packages/contracts/src/api.ts).

## Basics

- **Auth:** signup/login gives you a token. Send it as `Authorization: Bearer <token>`.
- **Errors:** always look like `{ "error": { "code", "message", "details?" } }`. The `message` is fine to show to users. Codes are in `ApiErrorCode`.
- **Dates/times:** dates are `YYYY-MM-DD`, times are 24h `HH:mm`, in `APP_TIMEZONE` (Eastern by default). Timestamps are ISO strings.
- **Money:** in cents, so `3500` = $35.00.
- **Validation:** request bodies are checked with the zod schemas in `@handy/contracts`. You can use the same schemas for your forms.

## Roles

`CUSTOMER`, `WORKER`, `ADMIN`. You pick customer or worker at signup. Admin only comes from the seed data. Wrong role = 403.

## Endpoints

### Accounts

| Endpoint | Who | Notes |
| --- | --- | --- |
| `POST /auth/signup` | anyone | Body is `signupSchema`. `role` is `CUSTOMER` or `WORKER`. New workers start as `PENDING` verification. |
| `POST /auth/login` | anyone | `{ email, password }` |
| `POST /auth/logout` | logged in | Invalidates the token. Returns 204. |
| `GET /auth/me` | logged in | User + their customer or worker profile |
| `PATCH /users/me` | logged in | `{ firstName?, lastName?, phone? }` |
| `GET /service-categories` | anyone | List of categories. The `id` is the code, e.g. `MOVING_ASSISTANCE`. |

### Customers

| Endpoint | Notes |
| --- | --- |
| `GET /customers/me/profile` | |
| `PUT /customers/me/profile` | Address, coordinates, accessibility/communication preferences, emergency contact |
| `GET /customers/me/history` | Everything for the history screen (service, worker, date, status, price, rating) |

### AI chat

The frontend never calls the AI directly, it all goes through these.

| Endpoint | Notes |
| --- | --- |
| `POST /ai/conversations` | Starts a conversation, returns the greeting message |
| `GET /ai/conversations/:id` | Conversation, current draft, and messages |
| `POST /ai/conversations/:id/messages` | Send `{ content }`, get back the AI's reply and the updated conversation |

`conversation.draft` is what the AI has figured out so far. When `conversation.readyToSubmit` is `true`, show the confirmation card using `draft`.

If `emergency` isn't null, show it clearly. It tells the user to call 911, and the request can't be submitted.

### Requests

| Endpoint | Who | Notes |
| --- | --- | --- |
| `POST /requests` | customer | The Confirm Request button. Send `{ conversationId, ...overrides }`. Any fields you include override the draft (that's how Edit works). Creates the request and sends it to matched workers. Returns 422 `REQUEST_INCOMPLETE` (with `details.missingInformation`) or 422 `POTENTIAL_EMERGENCY` if it can't go through. |
| `GET /requests` | customer, admin | Customers get their own, admins get all. Optional `?status=`. |
| `GET /requests/:id` | customer, assigned worker, admin | Includes `pendingOfferCount` and `jobId` once someone accepts. |
| `POST /requests/:id/cancel` | customer, admin | Only while `SEARCHING` |
| `GET /requests/:id/matches` | customer, admin | Ranked workers with scores and reasons. Mostly for the admin dashboard. |

Request statuses: `SEARCHING → MATCHED → COMPLETED`, or `CANCELLED`.

### Jobs

| Endpoint | Who | Notes |
| --- | --- | --- |
| `GET /jobs/available` | worker | Jobs offered to this worker. Only shows a general area, the full address shows up after accepting. |
| `POST /jobs/offers/:offerId/accept` | worker | First to accept gets it. Anyone after that gets 409 `JOB_NO_LONGER_AVAILABLE`. |
| `POST /jobs/offers/:offerId/decline` | worker | |
| `GET /jobs` | logged in | Your jobs (admins get all). Optional `?status=`. |
| `GET /jobs/:jobId` | job's customer/worker, admin | Job + request + worker profile + customer name + distance + rating |
| `PATCH /jobs/:jobId/status` | see below | `{ status, reason? }` |
| `GET /jobs/:jobId/messages` | job's customer/worker, admin | |
| `POST /jobs/:jobId/messages` | job's customer/worker | `{ content }`. Closed after the job is done or cancelled. |
| `POST /jobs/:jobId/rating` | job's customer | `{ score: 1-5, comment? }`. Once per job, after it's completed. |

Job status order (can't skip steps):

```
ACCEPTED ─► EN_ROUTE ─► ARRIVED ─► IN_PROGRESS ─► COMPLETED     (worker, admin)
   │           │           │
   └───────────┴───────────┴─► CANCELLED
```

- Customer can cancel while `ACCEPTED` or `EN_ROUTE`.
- Worker or admin can cancel any time before `IN_PROGRESS`.
- If the worker cancels, the request goes back to `SEARCHING` and gets sent to other workers.

Helpers in contracts: `canTransitionJob()` checks if a change is allowed, `nextWorkerJobStatus()` gives the next step for the worker's button, and `JOB_STATUS_LABELS` has display text for each status.

### Worker profile

| Endpoint | Notes |
| --- | --- |
| `GET /workers/me/profile` | |
| `PUT /workers/me/profile` | `{ bio?, serviceRadius?, address?, latitude?, longitude? }` |
| `PUT /workers/me/qualifications` | `{ qualifications: [{ serviceCategoryId, qualificationLevel }] }`. Replaces the whole list. |
| `PUT /workers/me/availability` | `{ availabilityStatus?, slots?: [{ dayOfWeek, startTime, endTime }] }`. `dayOfWeek` 0 is Sunday. `slots` replaces the whole schedule. |
| `GET /workers/me/earnings` | |
| `GET /workers/:id` | Public profile (first name + last initial only) |
| `GET /workers/:id/ratings` | |

### Notifications

Saved messages like "James is on the way." so they're still there after a refresh.

| Endpoint | Notes |
| --- | --- |
| `GET /notifications` | Latest 50. `?unread=true` for unread only. |
| `POST /notifications/:id/read` | |
| `POST /notifications/read-all` | |

### Admin

`GET /admin/stats`, `/admin/requests`, `/admin/jobs`, `/admin/workers`, `/admin/customers`, and `PATCH /admin/workers/:id/verification` with `{ verificationStatus }`. Only `VERIFIED` workers get job offers.

## Live updates

Pass the token in the URL since you can't set headers on these. Use whichever one you want, they send the same thing:

- **SSE:** `new EventSource("http://localhost:4000/api/v1/events?token=" + token)`, then use `onmessage`. Each `event.data` is JSON.
- **WebSocket:** `new WebSocket("ws://localhost:4000/api/v1/ws?token=" + token)`. Each message is JSON. Bad token closes with code 4401.

First message is `{ type: "CONNECTED", userId }`. After that every event is `{ type, at, data }`. Types are in [events.ts](../packages/contracts/src/events.ts).

| Event | Sent to | When |
| --- | --- | --- |
| `REQUEST_CREATED` | customer | Request confirmed |
| `WORKER_MATCHED` | customer | Request was sent to `notifiedWorkerCount` workers |
| `JOB_OFFERED` | worker | New job for them (`data.offer`) |
| `JOB_ACCEPTED` | customer, worker | A worker accepted |
| `JOB_NO_LONGER_AVAILABLE` | other offered workers | Someone else accepted or it got cancelled, remove it from the list |
| `WORKER_EN_ROUTE`, `WORKER_ARRIVED`, `JOB_STARTED`, `JOB_COMPLETED` | customer, worker | Status changed |
| `JOB_CANCELLED` | customer, worker | Includes `cancelledBy` |
| `REQUEST_CANCELLED` | customer | |
| `MESSAGE_RECEIVED` | both chat users | `data.message` |
| `RATING_SUBMITTED` | worker | |
| `NOTIFICATION` | recipient | New saved notification (`data.notification`) |

Admins get every event.

## AI and matching (for Aditya)

The backend uses the interfaces in [ai.ts](../packages/contracts/src/ai.ts) and [matching.ts](../packages/contracts/src/matching.ts). Your services don't need to touch the database, the backend passes in everything and saves the results.

- `@handy/ai` should export `createAIService()`. The backend calls `processMessage(conversationId, message, context)`, where `context` has the chat history, current draft, customer's name and home address, today's date, and the categories. Return an `AIResponse`. In `extractedData`, `undefined` means don't change the field and `null` means clear it.
- `@handy/matching` should export `createMatchingService()`. The backend calls `findMatches(request, candidates)` with workers that already have their qualifications, schedules, bookings, and experience loaded. Return `WorkerMatch[]` sorted best first. The top `MATCH_INITIAL_OFFERS` workers get the job first, and if nobody accepts after `MATCH_EXPAND_AFTER_SECONDS` it goes to everyone else who qualifies.

When they're ready, add `"@handy/ai": "workspace:*"` and `"@handy/matching": "workspace:*"` to `apps/api/package.json` and restart. The startup log says which one is being used.

Until then there are placeholder versions in `apps/api/src/integrations/` (`fallback-ai.ts` and `fallback-matching.ts`) so everything still works.

The backend also has its own emergency check on every message and request, separate from the AI.

## Known limitations

- No geocoding, so distance uses the customer's home location even if the job is somewhere else.
- Payments are fake. Price is the category's base price, +$10 if urgent. Platform fee is `PLATFORM_FEE_CENTS`.
- Live updates and logout tracking are stored in memory, so it only works with one API server running.
