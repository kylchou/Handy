# @handy/ai

Front desk of Handy. Plain-language conversation in, structured service request out. No categories to pick, no forms. Also helps customers write messages to their worker, screens job chat for scams, and builds privacy-safe job cards for workers.

```
Customer → Backend API → processMessage → safety check → Muse Spark → validation → AIResponse
```

Runs on Meta's Muse Spark through the Meta Model API.

Implements `AIService` from `packages/contracts/src/ai.ts`. Stateless, no database access: backend passes history + current draft each turn and saves the result.

## How the backend uses it

`apps/api` loads this package automatically (`AI_SERVICE_MODULE=@handy/ai`) and calls `createAIService()`. Startup log says `Loaded @handy/ai`. Until it loads, the backend's rule-based fallback is used.

```ts
const res = await ai.processMessage(conversationId, content, {
  history, currentDraft, customer: { firstName, homeAddress }, now, today, timezone, serviceCategories, pastWorkers,
});
```

| field | meaning |
|---|---|
| `message` | Reply for the customer. Short enough to read aloud. |
| `extractedData` | Only what changed this turn. `undefined` = leave alone, `null` = clear. |
| `missingInformation` | Any of `serviceCategoryId`, `description`, `location`, `requestedDate`, `requestedStartTime`. |
| `readyToSubmit` | Only after a summary + "yes": draft was already complete, customer said yes, nothing changed that turn. Request is still only created by the Confirm Request button. |
| `safetyStatus` | `NORMAL_SERVICE`, `NEEDS_CLARIFICATION`, `UNSUPPORTED_SERVICE`, `POTENTIAL_EMERGENCY` |

What gets extracted: category, description, location (home address if "at my house"), date, start/end time (end defaults to start + 1 hour), urgency (`LOW | NORMAL | HIGH`), special requirements, `preferredWorkerId` ("Can James come back?", only ids from `pastWorkers`), `repeat` (`WEEKLY` / `BIWEEKLY` for "every Saturday").

Merge rules:
- Model forgets a field → kept (never wiped by accident)
- Model gives a bad value (past date, "3pm" instead of `15:00`, unknown worker) → cleared, AI asks again
- Backend's greeting at the start of history is skipped (the model needs a customer turn first)

- Category must be in `context.serviceCategories` (all contract codes if that list is empty)

Model call fails (network, auth, out of credits) → throws. Bad JSON → one retry, then throws. Backend answers that one message with its built-in assistant, conversation keeps going. "Could you say that again" only comes from the model itself, when it worked but didn't understand.

## Safety

Users may be vulnerable, so safety runs first. Fixed patterns in `src/safety.ts` check every message before the model:
- Emergencies (medical, fire/gas, break-in, self-harm) → call 911, or 988 for self-harm
- Unsupported (medicine, bank passwords) → polite no

Neither becomes a job. Model also judges safety; stricter result wins. Model flags emergency without mentioning 911 → canned message swapped in.

Backend also runs its own emergency check on every message and request, and alerts caregivers. Backend also rate limits chat to 20 messages/minute per user, so no limiting needed here.

## Extras (not wired into the backend yet)

Exported and tested, but backend doesn't call them. Backend already has its own scam screening (`apps/api/src/lib/scam.ts`) and hides addresses from workers until they accept, so these two are optional.

**Message help** (spec section 13). Loose instruction → clear message for the worker. "Can you tell James where the washing machine is?" → "The washing machine is in the basement, on the left."

```ts
const res = await createJobMessageDrafter().draft(
  { workerFirstName: "James", serviceDescription: "Look at a washing machine", recentMessages },
  instruction,
  history, // earlier turns if the last result was "clarify"
);
```

| `res.kind` | meaning |
|---|---|
| `draft` | `res.message` ready. Show for approval, never auto-send. |
| `clarify` | Missing fact. Show `res.question`; send the answer back with earlier turns as `history`. |
| `emergency` | `res.message` + `res.emergency`. Nothing goes to the worker. |
| `unsupported` | Polite no in `res.message`. |

**Chat screening.** `screenJobMessage(text, "worker" | "customer")` → `allow` / `warn` / `block`, a `notice`, and `flagForAdmin`. Stricter than the backend's (blocks worker scam messages instead of warning).

**Worker job card.** `toWorkerJobCard(request, { accepted })` → display-ready card. Before accept: area only, no name, no health details. Never shows phone, email, card numbers, gate codes.

## Setup

The real key goes in the root `.env` only, never committed. It's empty in `.env.example`.

| env (root `.env`) | meaning |
|---|---|
| `MODEL_API_KEY` | Meta Model API key for Muse Spark. Required. |
| `AI_MODEL` | Optional. Default `muse-spark-1.2`, which was about twice as fast as `muse-spark-1.3` in testing with the same accuracy. |
| `AI_SERVICE_MODULE` | `@handy/ai`. Set empty to use the backend's rule-based fallback (no key needed). |

No key → `createAIService()` throws `MODEL_API_KEY is not set`, backend starts with its built-in assistant.

**Muse** (`src/muse.ts`): `openai` SDK (`~7.23.0`) pointed at `https://api.meta.ai/v1`. System prompt sent as the first message. JSON schema output with `strict: true`; if Meta rejects the schema, switches to `strict: false` for good and zod still checks every reply. `refusal` → handled like any other refusal. Cut off (`finish_reason: "length"`) or bad JSON → one retry, then throws.

The SDK version is pinned so an update can't break the demo.

```sh
pnpm --filter @handy/ai test       # stub model, no key needed
pnpm --filter @handy/ai typecheck
pnpm --filter @handy/ai chat       # terminal chat, reads the root .env, needs a key
```

## Needed from Engineer 2

- Optional: routes for message help (`POST /api/v1/jobs/:jobId/messages/draft`) if the team wants it in the demo
