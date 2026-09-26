# API docs

Base URL is `http://localhost:4000/api/v1`. All the types mentioned here come from `@handy/contracts`. If you want the exact response type for an endpoint, check `ApiResponses` in [packages/contracts/src/api.ts](../packages/contracts/src/api.ts).

## Using the API client

You don't need to write fetch calls yourself. `@handy/contracts` has a typed client that covers every endpoint in this doc:

```ts
import { createApiClient, ApiRequestError } from "@handy/contracts";

const api = createApiClient({
  baseUrl: "http://localhost:4000",
  token: localStorage.getItem("token"),
  onTokenChange: (t) => (t ? localStorage.setItem("token", t) : localStorage.removeItem("token")),
  onUnauthorized: () => router.push("/login"),
});

await api.auth.login({ email, password }); // saves the token for you
const offers = await api.jobs.available();
await api.jobs.acceptOffer(offers[0].id);

try {
  await api.requests.create({ conversationId });
} catch (err) {
  if (err instanceof ApiRequestError) showError(err.message); // plain English, fine to show
}

// live updates, returns a function that disconnects
const stop = api.realtime.subscribe((event) => {
  if (event.type === "WORKER_EN_ROUTE") setStatus("On the way");
});
```

A few things to know:

- Login and signup save the token, logout clears it. Use `onTokenChange` to keep it in localStorage.
- Any error throws an `ApiRequestError` with `status`, `code`, and `message`. If the server can't be reached you get `code: "NETWORK_ERROR"` and `status: 0`.
- `realtime.subscribe` uses SSE by default. Pass `{ transport: "ws" }` for WebSocket. Either way it reconnects by itself and catches up on anything it missed. Pass `onResync` to refetch your screen in the rare case it can't catch up.
- The method names follow the endpoint tables below, e.g. `api.requests.cancel(id)` is `POST /requests/:id/cancel`.
- `api.jobs.updateStatus(jobId, status, { reason?, arrivalCode? })` takes options as the last argument, and `api.jobs.arrive(jobId, code)` is a shortcut for arriving.

## Basics

- **Auth:** signup/login gives you a token. Send it as `Authorization: Bearer <token>`.
- **Errors:** always look like `{ "error": { "code", "message", "details?" } }`. The `message` is fine to show to users. Codes are in `ApiErrorCode`.
- **Dates/times:** dates are `YYYY-MM-DD`, times are 24h `HH:mm`, in `APP_TIMEZONE` (Eastern by default). Timestamps are ISO strings.
- **Money:** in cents, so `3500` = $35.00.
- **Validation:** request bodies are checked with the zod schemas in `@handy/contracts`. You can use the same schemas for your forms.

## Roles

`CUSTOMER`, `WORKER`, `CAREGIVER`, `ADMIN`. You pick customer, worker, or caregiver at signup. Admin only comes from the seed data. Wrong role = 403.

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

Request statuses: `SEARCHING → MATCHED → COMPLETED`, or `CANCELLED`, or `EXPIRED` if nobody accepted before the requested time window ended. When a request expires, the customer gets a `REQUEST_EXPIRED` event and a notification asking if they want to pick another time. Requests for a time that's already passed get rejected with a 400.

### Jobs

| Endpoint | Who | Notes |
| --- | --- | --- |
| `GET /jobs/available` | worker | Jobs offered to this worker. Only shows a general area, the full address shows up after accepting. Each offer has an `expiresAt` (5 minutes by default, set with `MATCH_OFFER_TTL_SECONDS`). After that it can't be accepted and goes to the next worker. |
| `POST /jobs/offers/:offerId/accept` | worker | First to accept gets it. Anyone after that gets 409 `JOB_NO_LONGER_AVAILABLE`. If the worker already has a job at an overlapping time it's 409 `SCHEDULE_CONFLICT`. Accepting also removes the worker's other offers that overlap with it. |
| `POST /jobs/offers/:offerId/decline` | worker | |
| `GET /jobs` | logged in | Your jobs (admins get all). Optional `?status=`. |
| `GET /jobs/:jobId` | job's customer/worker, admin | Job + request + worker profile + customer name + distance + rating + `arrivalCode` (customer and admin only, always null for the worker) |
| `PATCH /jobs/:jobId/status` | see below | `{ status, reason?, arrivalCode? }` |
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

**Arrival code.** When a worker accepts, the customer gets a 4-digit `arrivalCode`. It's on their job and in the "James is helping you" notification. When the worker gets there, the customer reads it to them, and the worker has to send it to mark the job `ARRIVED` (`{ status: "ARRIVED", arrivalCode: "4821" }`, or `api.jobs.arrive(jobId, code)`). This proves the right person is at the door.

- Wrong or missing code: 400 `INVALID_ARRIVAL_CODE`.
- 5 wrong tries: 429 `TOO_MANY_ATTEMPTS`, and the worker can't mark that job arrived anymore. An admin can still do it without the code.

Darsh: show the code big on the job screen once someone accepts. Arjun: the "I've Arrived" button needs a 4-digit input.

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

### Caregivers

A caregiver is a family member who wants to keep an eye on things. They can see everything but can't change anything.

Linking works with an invite code so the older adult has to agree to it:

1. The customer makes a code with `POST /customers/me/caregivers/invite`. It's 6 characters, with no 0/O or 1/I so it's easy to read over the phone, and it's good for 24 hours.
2. The caregiver signs up with `role: "CAREGIVER"` and enters it with `POST /caregivers/me/links { code }`. Codes work once.

| Endpoint | Who | Notes |
| --- | --- | --- |
| `POST /customers/me/caregivers/invite` | customer | `{ code, expiresAt }` |
| `GET /customers/me/caregivers` | customer | Who's linked |
| `DELETE /customers/me/caregivers/:caregiverId` | customer | Remove someone |
| `POST /caregivers/me/links` | caregiver | `{ code }`. Wrong, used, or expired code is 400 `INVALID_INVITE`. |
| `GET /caregivers/me/people` | caregiver | The whole dashboard: for each person, their active jobs, requests still searching, and last 10 history items |
| `DELETE /caregivers/me/people/:customerId` | caregiver | Unlink yourself |

Caregivers get notifications for the stuff that matters, not every step:

- A worker accepted ("James R. will help Margaret tomorrow at 3 PM.")
- The worker arrived, or finished the job
- A job got cancelled, or nobody could be found in time
- **Emergency:** if the customer says something that sounds like an emergency to the AI, caregivers get "Margaret may need help right now." (only once per conversation)

Caregivers never see the arrival code, and they can't use `/jobs`, `/requests`, or the AI chat directly, only their dashboard.

### Notifications

Saved messages like "James is on the way." so they're still there after a refresh.

| Endpoint | Notes |
| --- | --- |
| `GET /notifications` | Latest 50. `?unread=true` for unread only. |
| `POST /notifications/:id/read` | |
| `POST /notifications/read-all` | |

### Admin

`GET /admin/stats`, `/admin/requests`, `/admin/jobs`, `/admin/workers`, `/admin/customers`, and `PATCH /admin/workers/:id/verification` with `{ verificationStatus }`. Only `VERIFIED` workers get job offers.

`POST /admin/demo/reset` puts everything back to the starting demo data: all requests, jobs, chats, and notifications are deleted, accounts made after seeding are removed, and the demo workers' ratings and stats go back to normal. The demo accounts keep the same ids, so nobody gets logged out. Everyone connected gets a `DEMO_RESET` event so the apps can reload. It's turned off when `NODE_ENV=production` unless `ALLOW_DEMO_RESET=true`.

## Live updates

Pass the token in the URL since you can't set headers on these. Use whichever one you want, they send the same thing:

- **SSE:** `new EventSource("http://localhost:4000/api/v1/events?token=" + token)`, then use `onmessage`. Each `event.data` is JSON.
- **WebSocket:** `new WebSocket("ws://localhost:4000/api/v1/ws?token=" + token)`. Each message is JSON. Bad token closes with code 4401.

First message is `{ type: "CONNECTED", userId, replayed }`. After that every event is `{ id, type, at, data }`. Types are in [events.ts](../packages/contracts/src/events.ts).

**Missed events.** Every event has an `id`, and the server keeps the last 1000. If a connection drops, reconnect with the last id you saw and you'll get everything you missed (in order) right after `CONNECTED`, then live events like normal:

- SSE: the browser does this for you with the `Last-Event-ID` header.
- WebSocket: add `&lastEventId=<id>` to the URL.

If the gap can't be filled (the server restarted, or you were gone for a really long time), you get `{ type: "RESYNC" }` after `CONNECTED`. That means refetch whatever's on screen. The API client handles all of this, so you only need to care if you're connecting yourself.

| Event | Sent to | When |
| --- | --- | --- |
| `REQUEST_CREATED` | customer | Request confirmed |
| `WORKER_MATCHED` | customer | Request was sent to `notifiedWorkerCount` workers |
| `JOB_OFFERED` | worker | New job for them (`data.offer`) |
| `JOB_ACCEPTED` | customer, worker | A worker accepted |
| `JOB_NO_LONGER_AVAILABLE` | offered workers | Someone else accepted, it got cancelled or expired, or the offer expired. Remove it from the list. |
| `WORKER_EN_ROUTE`, `WORKER_ARRIVED`, `JOB_STARTED`, `JOB_COMPLETED` | customer, worker | Status changed |
| `JOB_CANCELLED` | customer, worker | Includes `cancelledBy` |
| `REQUEST_CANCELLED` | customer | |
| `REQUEST_EXPIRED` | customer | Nobody accepted before the requested time passed |
| `MESSAGE_RECEIVED` | both chat users | `data.message` |
| `RATING_SUBMITTED` | worker | |
| `NOTIFICATION` | recipient | New saved notification (`data.notification`) |
| `DEMO_RESET` | everyone | An admin reset the demo data, reload the page |

Admins get every event.

## AI and matching (for Aditya)

The backend uses the interfaces in [ai.ts](../packages/contracts/src/ai.ts) and [matching.ts](../packages/contracts/src/matching.ts). Your services don't need to touch the database, the backend passes in everything and saves the results.

- `@handy/ai` should export `createAIService()`. The backend calls `processMessage(conversationId, message, context)`, where `context` has the chat history, current draft, customer's name and home address, today's date, and the categories. Return an `AIResponse`. In `extractedData`, `undefined` means don't change the field and `null` means clear it.
- `@handy/matching` should export `createMatchingService()`. The backend calls `findMatches(request, candidates)` with workers that already have their qualifications, schedules, bookings, and experience loaded. Return `WorkerMatch[]` sorted best first. The top `MATCH_INITIAL_OFFERS` workers get the job first. If their offers expire without anyone accepting, it goes to the next workers, and after `MATCH_EXPAND_AFTER_SECONDS` it goes to everyone else who qualifies.

When they're ready, add `"@handy/ai": "workspace:*"` and `"@handy/matching": "workspace:*"` to `apps/api/package.json` and restart. The startup log says which one is being used.

Until then there are placeholder versions in `apps/api/src/integrations/` (`fallback-ai.ts` and `fallback-matching.ts`) so everything still works.

The backend also has its own emergency check on every message and request, separate from the AI.

## Known limitations

- No geocoding, so distance uses the customer's home location even if the job is somewhere else.
- Payments are fake. Price is the category's base price, +$10 if urgent. Platform fee is `PLATFORM_FEE_CENTS`.
- Live updates and logout tracking are stored in memory, so it only works with one API server running.
