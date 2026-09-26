# @handy/ai

Front desk of Handy. Plain-language conversation in, structured service request out. No categories to pick, no forms. Also helps customers write messages to their worker, screens job chat for scams, and builds privacy-safe job cards for workers.

```
Customer → Backend API → processMessage → safety check → Claude → validation → AIResponse
```

No database access. Conversation state goes through a `ConversationStore`: in-memory by default, Redis/Postgres pluggable by backend.

## Usage

```ts
import { createAIServiceFromEnv, AIServiceError } from "@handy/ai";

const ai = createAIServiceFromEnv();

// POST /api/v1/ai/conversations/:conversationId/messages
const res = await ai.processMessage(conversationId, body.message, {
  firstName: user.firstName,
  savedAddress: customerProfile.address,
});
```

| field | meaning |
|---|---|
| `message` | Reply for the customer. Short enough to read aloud. |
| `extractedData` | Fields collected so far, named like `ServiceRequestDTO`. `serviceCategoryId` = code, e.g. `MOVING_ASSISTANCE`. |
| `missingInformation` | Any of `serviceCategory`, `description`, `date`, `startTime`, `location`. |
| `readyToSubmit` | Nothing missing + safe → show confirmation card. |
| `userConfirmed` | Spoken "yes" to the summary. Only true when `readyToSubmit` is. |
| `safetyStatus` | `NORMAL_SERVICE`, `NEEDS_CLARIFICATION`, `UNSUPPORTED_SERVICE`, `POTENTIAL_EMERGENCY` |
| `emergency` | `{ kind, callNumber: "911" \| "988" }`, emergencies only. Show a big call button. |

Create a `ServiceRequest` only when `readyToSubmit` is true and customer confirmed (button or `userConfirmed`). Never for emergencies or unsupported requests.

Model down or bad output → `AIServiceError`. Catch it, show a friendly retry message.

## Message help

Loose instruction → clear message for the worker (spec section 13). "Can you tell James where the washing machine is?" → "The washing machine is in the basement, on the left."

```ts
import { createJobMessageDrafterFromEnv } from "@handy/ai";

const drafter = createJobMessageDrafterFromEnv();
const res = await drafter.draft(
  { workerFirstName: "James", serviceDescription: "Look at a washing machine", recentMessages },
  body.instruction,
  body.history, // earlier turns if the last result was "clarify"
);
```

| `res.kind` | meaning |
|---|---|
| `draft` | `res.message` ready. Show for approval, send via `POST /api/v1/jobs/:jobId/messages` only after customer confirms. Never auto-send. |
| `clarify` | Missing fact, e.g. where the machine is. Show `res.question`; send the answer back with the earlier turns as `history`. |
| `emergency` | Same as chat: `res.message` + `res.emergency`. Nothing goes to the worker. |
| `unsupported` | Polite no in `res.message`. |

Stateless: backend holds the `history` turns. Only facts from the instruction, job, and recent messages are used.

## Chat screening

Checks every job chat message before the backend saves it. No model call.

```ts
import { screenJobMessage } from "@handy/ai";

// POST /api/v1/jobs/:jobId/messages
const check = screenJobMessage(body.content, user.role === "WORKER" ? "worker" : "customer");
```

| `check.action` | backend does |
|---|---|
| `allow` | Save + deliver. |
| `warn` | Save + deliver. Show `check.notice` to `check.noticeFor` (`"sender"` or `"customer"`). |
| `block` | Don't save or deliver. Show `check.notice` to the sender. |

`check.flagForAdmin` → worth showing on the admin dashboard.

| sender | message | result |
|---|---|---|
| worker | gift card codes, Venmo/Zelle/cash, bank or card details, passwords/verification codes | block + admin |
| worker | phone number, email, "text me" | warn customer + admin |
| customer | real card number, SSN, password | block (protects them) |
| customer | paying outside the app, gift card codes | tip + admin |
| customer | phone number, email | tip |

Normal job talk passes: Wi-Fi passwords, gate/door codes, "pick up a gift card for my grandson", "store only takes credit card".

## Worker job card

What a worker sees about a job, with private info hidden. No model call.

```ts
import { toWorkerJobCard } from "@handy/ai";

const card = toWorkerJobCard(
  { ...serviceRequest, customerFirstName, distanceMiles: match.distance, estimatedPay: price.servicePrice },
  { accepted: job?.workerId === worker.id },
);
// { title: "Moving help", summary, when: "Sat, Sep 26 · 3–4 PM", location: "Atlanta, GA 30303",
//   distance: "2.4 miles away", pay: "$35", notes: [...] }
```

| | before accept | after accept |
|---|---|---|
| location | city/area only ("Atlanta, GA 30303") | full address |
| customer first name | hidden | shown |
| health details (dementia, medications, …) | hidden, replaced by "A few personal details are shared after you accept" | shown |
| job needs (ladder, wheelchair, lifting) | shown | shown |
| phone, email, card numbers, gate/door codes | hidden | hidden (share codes in chat) |

Build the card on the backend; never send the raw request to the worker app.

## Safety

Users may be vulnerable, so safety runs first. Fixed patterns in `src/safety.ts` check every message before the model:
- Emergencies (medical, fire/gas, break-in, self-harm) → call 911, or 988 for self-harm
- Unsupported (medicine, bank passwords) → polite no

Neither becomes a job. Model also judges safety; stricter result wins. Model flags emergency without mentioning 911 → canned message swapped in. Message help runs the same check.

Job chat → scam screening (`src/scam.ts`). Worker app → privacy-safe card (`src/workerCard.ts`). Shared privacy patterns in `src/patterns.ts`.

## Setup

| env | default |
|---|---|
| `ANTHROPIC_API_KEY` | required (or `ant auth login` profile) |
| `AI_MODEL` | `claude-opus-5` |
| `AI_EFFORT` | `medium` (`low` = faster) |
| `AI_TIMEZONE` | `America/New_York`, for resolving "tomorrow" |

Claude declines → automatic retry on a fallback model (`fallbacks: "default"`).

```sh
pnpm --filter @handy/ai test    # stub model, no key needed
pnpm --filter @handy/ai chat    # terminal chat, key needed
pnpm --filter @handy/ai build
```

## Needed from Engineer 2

- `urgency` (`low | normal | high`) and `specialRequirements: string[]` on `ServiceRequest` + DTO
- `ServiceCategory` seeded with codes from `src/categories.ts`; map code → id if ids differ
- Types in `src/types.ts` can move to `@handy/contracts` once it exists
- Route for message help, e.g. `POST /api/v1/jobs/:jobId/messages/draft`, calling `drafter.draft(...)`
- Call `screenJobMessage` in `POST /api/v1/jobs/:jobId/messages` before saving; return `notice` so Engineers 1 + 4 can show it
- Somewhere to keep `flagForAdmin` messages (e.g. a `flagged` field on `JobMessage`) for the admin dashboard
- Worker job endpoints return `toWorkerJobCard(...)` output, not the raw `ServiceRequest`
