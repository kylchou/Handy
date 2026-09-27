# API docs

Base URL is `http://localhost:4000/api/v1`. When the API is running you can also open **http://localhost:4000/docs** to see every endpoint and try them in the browser: log in with `POST /auth/login`, copy the token, and click Authorize. All the types mentioned here come from `@handy/contracts`. If you want the exact response type for an endpoint, check `ApiResponses` in [packages/contracts/src/api.ts](../packages/contracts/src/api.ts).

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
- **Rate limits:** a few endpoints are limited. Going over gets a 429 `RATE_LIMITED` with a `Retry-After` header and `details.retryAfterSeconds`.

  | Endpoint | Limit |
  | --- | --- |
  | `POST /auth/login` | 10 tries per 15 min, per IP + email |
  | `POST /auth/signup` | 10 per hour, per IP |
  | `POST /ai/conversations/:id/messages` | 20 per minute, per user |
  | `POST /ai/conversations` | 30 per hour, per user |
  | `POST /caregivers/me/links` | 10 per 15 min, per user |

  Set `RATE_LIMIT_ENABLED=false` in `.env` if they get in your way while testing locally.

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
| `GET /customers/me/schedules` | Their repeating requests |
| `DELETE /customers/me/schedules/:scheduleId` | Stop a repeating request |
| `GET /customers/me/past-workers` | Everyone who's helped this customer before, with their last rating. For a "Book James again" button. |

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

**Where the job is.** If the request's `location` is the customer's home address, we use the coordinates on their profile. Anywhere else gets looked up with OpenStreetMap, so distances and service radius checks use the real place. Saving an address on a customer or worker profile (or at signup) fills in `latitude`/`longitude` the same way, so you don't need to send them. Set `GEOCODER_CONTACT` in `.env` to an email or URL, their usage policy asks for it.

**Repeating requests.** Send `repeat: "WEEKLY"` or `repeat: "BIWEEKLY"` with `POST /requests` (or the AI sets it when they say "every Saturday" or "every other week"). That request becomes the first visit, and each visit after that gets posted to workers 3 days ahead with the same day, time, and details. Whoever did the last visit and got 4 or 5 stars is asked first next time, so it tends to be the same helper each week. Visits have a `scheduleId`. `GET /customers/me/schedules` lists them and `DELETE /customers/me/schedules/:id` stops one (already-posted visits stay booked). Cancelling one visit doesn't stop the rest.

**Booking someone again.** Send `preferredWorkerId` when creating a request (or the AI sets it when the customer says "Can James come back?" or "same person as last time"). The request goes to that worker alone first. If they decline or don't answer in time, it goes to everyone like normal. If they can't do it at all (not available, doesn't do that kind of job), the customer gets told right away and it goes out to everyone. Workers the customer rated 4–5 stars also get a bump in matching, and workers they rated 1–2 stars never get their jobs again.

Request statuses: `SEARCHING -> MATCHED -> COMPLETED`, or `CANCELLED`, or `EXPIRED` if nobody accepted before the requested time window ended. When a request expires, the customer gets a `REQUEST_EXPIRED` event and a notification asking if they want to pick another time. Requests for a time that's already passed get rejected with a 400.

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
| `POST /jobs/:jobId/messages` | job's customer/worker | `{ content }`. Closed after the job is done or cancelled. Messages with a card or Social Security number are refused with 422 `SENSITIVE_INFO`. |
| `POST /jobs/:jobId/rating` | job's customer | `{ score: 1-5, comment? }`. Once per job, after it's completed. |

Job status order (can't skip steps):

```
ACCEPTED -> EN_ROUTE -> ARRIVED -> IN_PROGRESS -> COMPLETED
```

Only the worker (or an admin) moves it forward.

- Customer can cancel while `ACCEPTED` or `EN_ROUTE`.
- Worker or admin can cancel any time before `IN_PROGRESS`.
- If the worker cancels, the request goes back to `SEARCHING` and gets sent to other workers.

**Scam warnings in the chat.** Worker messages that look like a scam still get delivered, but they come with `flags` and a plain-language `warning` to show under the message:

- Asking to be paid outside the app (Venmo, Zelle, Cash App, "pay me directly", cash only)
- Asking for gift cards
- Asking for card, bank, Social Security, or Medicare details, or a password (Wi-Fi passwords are fine)

The first time each kind shows up in a job, the customer gets a `SCAM_WARNING` notification ("Be careful: James asked you to pay outside the app."), and so do their caregivers and every admin. Darsh: show `warning` under the message in red or yellow.

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

They also get the customer's request and job status events live (`REQUEST_CREATED`, `JOB_ACCEPTED`, `WORKER_EN_ROUTE`, `WORKER_ARRIVED`, `JOB_COMPLETED`, and so on) so a dashboard can refresh by itself. Chat messages and job offers are never sent to them.

Caregivers never see the arrival code, and they can't use `/jobs`, `/requests`, or the AI chat directly, only their dashboard.

### Notifications

Saved messages like "James is on the way." so they're still there after a refresh.

**Reminders** (type `JOB_REMINDER`) go out automatically for accepted jobs:

- About a day before: the customer gets "Reminder: James is coming tomorrow at 10 AM." with their arrival code, the worker gets "Reminder: Moving help for Margaret T. tomorrow at 10 AM." with the address, and caregivers get one too.
- About an hour before: the customer gets "James is coming in about an hour." and the worker gets a heads up. Caregivers don't get this one.

Each reminder only goes out once. It's skipped if the worker accepted after that point, since the "James is helping you" notification already covered it.

**No-shows** (type `NO_SHOW`): if a job is still `ACCEPTED` 10 minutes after its start time (the worker never tapped "I'm On My Way"), the customer gets "James hasn't started heading over yet.", their caregivers get told, the worker gets a nudge to head out or cancel, and every admin gets "Possible no-show: ...". It only happens once per job. The job's `noShowAlertedAt` gets set, so the admin dashboard can highlight it.

| Endpoint | Notes |
| --- | --- |
| `GET /notifications` | Latest 50. `?unread=true` for unread only. |
| `POST /notifications/:id/read` | |
| `POST /notifications/read-all` | |

### Admin

`GET /admin/stats`, `/admin/requests`, `/admin/jobs`, `/admin/workers`, `/admin/customers`, and `PATCH /admin/workers/:id/verification` with `{ verificationStatus }`. Only `VERIFIED` workers get job offers.

`POST /admin/demo/reset` puts everything back to the starting demo data: all requests, jobs, chats, and notifications are deleted, accounts made after seeding are removed, and the demo workers' ratings and stats go back to normal. The demo accounts keep the same ids, so nobody gets logged out. Everyone connected gets a `DEMO_RESET` event so the apps can reload. It's turned off when `NODE_ENV=production` unless `ALLOW_DEMO_RESET=true`.

**Demo autopilot.** `PUT /admin/demo/autopilot` with `{ "enabled": true, "stepSeconds": 8 }` turns on a fake worker, so one person can show the whole flow from the customer app without a second phone. While it's on, any new request gets accepted by the best matched worker after one step, then goes on the way, arrived, started, and done, one step at a time. It uses the same calls a real worker would (it even enters the arrival code), so the customer app sees the normal live updates and notifications. `stepSeconds` can be 2 to 60 and defaults to 8. Add `"hold": true` to have it accept jobs and then wait at "accepted" until you send `{ "enabled": true, "hold": false }`, so there's time to show the job page. `pnpm demo autopilot on` and `pnpm demo go` do this for you. Requests made before you turned it on are left alone. `GET /admin/demo/autopilot` shows whether it's on and which jobs it's moving along. It turns off if the server restarts, and it's blocked in production the same way demo reset is.

From the API client: `api.admin.setAutopilot({ enabled: true })`.

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

- `@handy/ai` should export `createAIService()`. The backend calls `processMessage(conversationId, message, context)`, where `context` has the chat history, current draft, customer's name and home address, today's date, the categories, and `pastWorkers` (people who've helped before, so you can set `preferredWorkerId` when they ask for someone by name). Return an `AIResponse`. In `extractedData`, `undefined` means don't change the field and `null` means clear it.
- `@handy/matching` should export `createMatchingService()`. The backend calls `findMatches(request, candidates)` with workers that already have their qualifications, schedules, bookings, experience, and `withCustomer` history loaded (workers the customer rated 1–2 stars are already removed). Return `WorkerMatch[]` sorted best first. The top `MATCH_INITIAL_OFFERS` workers get the job first. If their offers expire without anyone accepting, it goes to the next workers, and after `MATCH_EXPAND_AFTER_SECONDS` it goes to everyone else who qualifies.

When they're ready, add `"@handy/ai": "workspace:*"` and `"@handy/matching": "workspace:*"` to `apps/api/package.json` and restart. The startup log says which one is being used.

Until then there are placeholder versions in `apps/api/src/integrations/` (`fallback-ai.ts` and `fallback-matching.ts`) so everything still works.

Once your packages are plugged in, they still get backed up by the placeholders:

- If `createAIService()` or `createMatchingService()` throws (like when the API key isn't set), the server starts anyway and uses the placeholder.
- If a call throws or takes too long (45 seconds for the AI, which you can change with `AI_TIMEOUT_SECONDS`, and 5 for matching), that one call uses the placeholder and a warning gets logged.
- Answers get checked before they're saved. Bad fields are dropped: a category that doesn't exist, a date like "tomorrow" instead of `2026-09-27`, or a `preferredWorkerId` for someone who hasn't helped this customer. Lowercase urgency and safety status are fine, and `9:30` becomes `09:30`. For matching, workers that weren't in `candidates` and repeats are dropped, and scores are kept between 0 and 100.

So if your service seems to be ignoring something, check the API log for a warning.

The backend also has its own emergency check on every message and request, separate from the AI.

## Known limitations

- Address lookup uses OpenStreetMap's free service, which only allows 1 lookup per second. That's fine for a demo but a real launch would want a paid geocoder. If a lookup fails, the job falls back to the customer's home location.
- Payments are fake. Price is the category's base price, +$10 if urgent. Platform fee is `PLATFORM_FEE_CENTS`.
- Live updates, logout tracking, and the demo autopilot are stored in memory, so it only works with one API server running.
