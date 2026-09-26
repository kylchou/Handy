# @handy/ai

Front desk of Handy. Plain-language conversation in, structured service request out. No categories to pick, no forms. Also helps customers write messages to their worker.

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

## Safety

Users may be vulnerable, so safety runs first. Fixed patterns in `src/safety.ts` check every message before the model:
- Emergencies (medical, fire/gas, break-in, self-harm) → call 911, or 988 for self-harm
- Unsupported (medicine, bank passwords) → polite no

Neither becomes a job. Model also judges safety; stricter result wins. Model flags emergency without mentioning 911 → canned message swapped in. Message help runs the same check.

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
