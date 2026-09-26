# The Handy API

This is everything you need to talk to the backend. Everything lives under `http://localhost:4000/api/v1`, and every type I mention here comes from `@handy/contracts`. If you ever want to know exactly what an endpoint sends back, look at `ApiResponses` in [packages/contracts/src/api.ts](../packages/contracts/src/api.ts). It lists every response type in one spot.

## A few ground rules

- **Logging in.** Once you sign up or log in, you get a token. Send it on every request as `Authorization: Bearer <token>`.
- **Errors.** Whenever something goes wrong, the body always looks like `{ "error": { "code", "message", "details?" } }`. I wrote every `message` in plain English on purpose, so you can show it straight to the user without translating anything. The full list of codes is in `ApiErrorCode`.
- **Dates and times.** Dates are `YYYY-MM-DD` and times are 24-hour `HH:mm`, both in `APP_TIMEZONE` (Eastern by default). Timestamps are ISO 8601.
- **Money.** It's always in cents. So `3500` means $35.00. I know it's slightly annoying, but it keeps us from dealing with weird decimal rounding.
- **Validation.** The backend checks every request body with the zod schemas in `@handy/contracts`. You can use those exact same schemas to validate your forms, so the frontend and backend never disagree about what's allowed.

## Roles

There are three: `CUSTOMER`, `WORKER`, and `ADMIN`. You pick customer or worker when you sign up, and that's permanent. Admin accounts only come from the seed data. If you call something your role isn't allowed to use, you'll get a 403 `FORBIDDEN`.

## Endpoints

### Accounts

| Endpoint | Who can call it | What it does |
| --- | --- | --- |
| `POST /auth/signup` | anyone | Body is `signupSchema`, and `role` has to be `CUSTOMER` or `WORKER`. New workers start out `PENDING` verification. Returns `AuthResponse`. |
| `POST /auth/login` | anyone | `{ email, password }` gets you an `AuthResponse` |
| `POST /auth/logout` | logged in | Kills the token right away. Returns 204. |
| `GET /auth/me` | logged in | `MeResponse`, which is the user plus their customer or worker profile |
| `PATCH /users/me` | logged in | `{ firstName?, lastName?, phone? }` |
| `GET /service-categories` | anyone | `ServiceCategoryDTO[]`. Each category's `id` is just its code, like `MOVING_ASSISTANCE`. |

### Customers

| Endpoint | What it does |
| --- | --- |
| `GET /customers/me/profile` | `CustomerProfileDTO` |
| `PUT /customers/me/profile` | Address, coordinates, accessibility and communication preferences, and an emergency contact |
| `GET /customers/me/history` | `CustomerHistoryItemDTO[]`, which has the service, worker, date, status, price, and rating for each job. It's basically the whole history screen. |

### The AI conversation

The frontend should never call an AI model directly. Everything goes through these three endpoints, and the backend deals with the rest.

| Endpoint | What it does |
| --- | --- |
| `POST /ai/conversations` | Starts a new conversation and gives you back the assistant's greeting |
| `GET /ai/conversations/:id` | The conversation, what the AI has figured out so far, and every message |
| `POST /ai/conversations/:id/messages` | Send `{ content }` and you get back a `SendConversationMessageResponse` |

While the customer is chatting, `conversation.draft` fills up with whatever the AI has pieced together. When `conversation.readyToSubmit` turns `true`, that means nothing's missing anymore, and it's time to show the confirmation card built from `draft`.

If `emergency` ever comes back as something other than null, please make it impossible to miss. It tells the person to call 911, and the backend won't let that request go through no matter what. We're not sending a gig worker to someone who might be having a heart attack.

### Service requests

| Endpoint | Who | What it does |
| --- | --- | --- |
| `POST /requests` | customer | This is the **Confirm Request** button. Send `{ conversationId, ...overrides }`. Anything you put in there replaces what's in the draft, which is how the **Edit** button works. It creates the request as `SEARCHING` and sends it to the best-matched workers right away. If info is missing, you get a 422 `REQUEST_INCOMPLETE` with `details.missingInformation`. If it looks like an emergency, you get a 422 `POTENTIAL_EMERGENCY`. |
| `GET /requests` | customer, admin | Customers only see their own, while admins see everything. You can add `?status=` to filter. |
| `GET /requests/:id` | the customer, the assigned worker, admin | `ServiceRequestDTO`. It tells you how many workers are currently looking at it (`pendingOfferCount`), and once someone accepts, it includes the `jobId`. |
| `POST /requests/:id/cancel` | the customer, admin | Only works while it's still `SEARCHING` |
| `GET /requests/:id/matches` | the customer, admin | Every eligible worker, ranked, with their scores and the reasons behind them. This one's mainly for the admin dashboard, and it's great for showing judges how matching works. |

A request goes `SEARCHING → MATCHED → COMPLETED`, or it ends up `CANCELLED`.

### Jobs (the worker side)

| Endpoint | Who | What it does |
| --- | --- | --- |
| `GET /jobs/available` | worker | The jobs offered to this worker (`JobOfferDTO[]`). These only show a rough area, not the street address. Workers get the full address once they accept, since nobody's home address should get sent out to people who haven't even taken the job. |
| `POST /jobs/offers/:offerId/accept` | worker | First one to accept gets it, and everyone after that gets a 409 `JOB_NO_LONGER_AVAILABLE`. Returns `JobDetailDTO`. |
| `POST /jobs/offers/:offerId/decline` | worker | |
| `GET /jobs` | logged in | Workers see their own jobs, customers see theirs, and admins see all of them. You can filter with `?status=`. |
| `GET /jobs/:jobId` | the job's customer, the job's worker, admin | `JobDetailDTO`, which has the job, the request, the worker's public profile, the customer's first name and last initial, the distance, and the rating |
| `PATCH /jobs/:jobId/status` | depends, see below | `{ status, reason? }` |
| `GET /jobs/:jobId/messages` | the job's customer, the job's worker, admin | `JobMessageDTO[]` |
| `POST /jobs/:jobId/messages` | the job's customer or worker | `{ content }`. Chat closes once the job is finished or cancelled. |
| `POST /jobs/:jobId/rating` | the job's customer | `{ score: 1-5, comment? }`. You only get one rating per job, and only after it's done. It gets averaged into the worker's rating. |

**How a job moves along.** The backend won't let a job skip steps, so there's no jumping from "accepted" straight to "done." The rules are exported as `JOB_STATUS_TRANSITIONS` and `canTransitionJob()` if you want to check them yourself:

```
ACCEPTED ─► EN_ROUTE ─► ARRIVED ─► IN_PROGRESS ─► COMPLETED     (worker, admin)
   │           │           │
   └───────────┴───────────┴─► CANCELLED
```

- The customer can cancel while the job is `ACCEPTED` or `EN_ROUTE`.
- The worker or an admin can cancel any time before `IN_PROGRESS`.
- If the **worker** is the one who cancels, the request doesn't just die. It goes back to `SEARCHING` and gets sent to other workers, so the customer isn't left stuck.

For the worker app, `nextWorkerJobStatus(status)` tells you what the one big button should do next ("I'm On My Way" → "I've Arrived" → "Start Job" → "Complete Job"). For the customer app, `JOB_STATUS_LABELS` has friendly text for every status.

### Worker profiles

| Endpoint | What it does |
| --- | --- |
| `GET /workers/me/profile` | `WorkerProfileDTO` |
| `PUT /workers/me/profile` | `{ bio?, serviceRadius?, address?, latitude?, longitude? }` |
| `PUT /workers/me/qualifications` | `{ qualifications: [{ serviceCategoryId, qualificationLevel }] }`. This replaces the whole list, it doesn't add to it. |
| `PUT /workers/me/availability` | `{ availabilityStatus?, slots?: [{ dayOfWeek, startTime, endTime }] }`, where `dayOfWeek` 0 is Sunday. Sending `slots` replaces the entire weekly schedule. |
| `GET /workers/me/earnings` | `WorkerEarningsDTO` |
| `GET /workers/:id` | `WorkerPublicDTO`. It's safe to show customers, since it only has a first name and last initial. |
| `GET /workers/:id/ratings` | `RatingDTO[]` |

### Notifications

These are the short messages like "James is on the way." They get saved, so even if someone refreshes the page or closes the app, they can still see what happened.

| Endpoint | What it does |
| --- | --- |
| `GET /notifications` | The latest 50. Add `?unread=true` if you only want the unread ones. |
| `POST /notifications/:id/read` | Marks one as read |
| `POST /notifications/read-all` | Marks all of them as read |

### Admin

`GET /admin/stats`, `GET /admin/requests`, `GET /admin/jobs`, `GET /admin/workers`, `GET /admin/customers`, and `PATCH /admin/workers/:id/verification` with `{ verificationStatus }`. Only `VERIFIED` workers get job offers, so this is how a new worker gets approved.

## Live updates

This is what makes the tracking screen feel alive instead of making people hit refresh. Browsers won't let you set headers on these kinds of connections, so pass the token in the URL. You've got two options, and they send the exact same stuff, so just pick whichever one you like more:

- **Server-Sent Events:** `new EventSource("http://localhost:4000/api/v1/events?token=" + token)`. Listen with `onmessage`, and each `event.data` is a JSON `RealtimeEvent`.
- **WebSocket:** `new WebSocket("ws://localhost:4000/api/v1/ws?token=" + token)`. Each message is a JSON `RealtimeEvent`. If the token's bad, the socket closes with code 4401.

The first thing you'll get either way is `{ type: "CONNECTED", userId }`. After that, every event looks like `{ type, at, data }`, and the full types are in [events.ts](../packages/contracts/src/events.ts).

| Event | Who gets it | When |
| --- | --- | --- |
| `REQUEST_CREATED` | customer | They confirmed a request |
| `WORKER_MATCHED` | customer | The request went out to `notifiedWorkerCount` workers |
| `JOB_OFFERED` | worker | There's a new job for them (`data.offer`) |
| `JOB_ACCEPTED` | customer, worker | Someone took the job |
| `JOB_NO_LONGER_AVAILABLE` | the other workers who got offered it | Someone else got there first, or the customer cancelled. Take it off their list. |
| `WORKER_EN_ROUTE`, `WORKER_ARRIVED`, `JOB_STARTED`, `JOB_COMPLETED` | customer, worker | The job moved to its next step |
| `JOB_CANCELLED` | customer, worker | Includes `cancelledBy` so you know who did it |
| `REQUEST_CANCELLED` | customer | |
| `MESSAGE_RECEIVED` | both people in the chat | `data.message` |
| `RATING_SUBMITTED` | worker | |
| `NOTIFICATION` | whoever it's for | A new saved notification showed up (`data.notification`) |

Admins get every single event, which is nice for a live dashboard.

## Plugging in the AI and matching (Aditya, this part's for you)

The backend only talks to your services through the interfaces in [ai.ts](../packages/contracts/src/ai.ts) and [matching.ts](../packages/contracts/src/matching.ts). Neither of them needs to touch the database at all. I load everything you need, hand it to you, and save whatever you give back.

- **`@handy/ai`** needs to export `createAIService(): AIService`. I'll call `processMessage(conversationId, message, context)`. The `context` has the conversation history, the draft so far, the customer's first name and home address, today's date and timezone, and the list of service categories. Send back an `AIResponse`. One thing to watch in `extractedData`: `undefined` means "leave this field alone," while `null` means "clear it out."
- **`@handy/matching`** needs to export `createMatchingService(): MatchingService`. I'll call `findMatches(request, candidates)`, and the candidates will already have their qualifications, weekly schedules, booked time slots, and job experience loaded in. Send back `WorkerMatch[]` with the best match first. I send the request to the top `MATCH_INITIAL_OFFERS` workers first. If nobody accepts within `MATCH_EXPAND_AFTER_SECONDS`, I send it to everyone else who qualifies.

When yours are ready, add `"@handy/ai": "workspace:*"` and `"@handy/matching": "workspace:*"` to `apps/api/package.json` (just tell me and I'll do it), then restart. The startup log will tell you which version it's using.

Until then, the backend has stand-ins so the rest of us aren't blocked. There's a simple rule-based assistant in `apps/api/src/integrations/fallback-ai.ts` and a matcher that uses the weights from the spec in `fallback-matching.ts`. They work well enough for the demo, but yours are going to be a lot smarter, especially the AI.

One more thing: the backend runs its own emergency check on every message and every submitted request, completely separate from the AI. Even if the model misses something, a possible emergency still never turns into a job. I didn't want that to depend on the model getting it right every time.

## Corners we cut (for now)

It's a hackathon, so a few things are simpler than they'd be in real life:

- **No real address lookup.** A request uses the customer's home coordinates for distance, even if they asked for help at a different address.
- **Payments are fake.** The price is just the category's base price, plus $10 if it's marked urgent. The platform fee comes from `PLATFORM_FEE_CENTS`.
- **Everything runs on one server.** Live updates and logouts are tracked in the server's memory, which is fine for one API instance. If we ever ran more than one, we'd need to move that to something like Redis.
