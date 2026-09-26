# Customer App — Engineer 1

This is `/apps/customer` from the project spec: the interface an older
adult uses to ask for help and track a job through to completion. It
owns this directory plus the customer-facing parts of `/packages/ui`
(currently inlined as `/components` until that package exists).

## Running it right now, with no backend

The app ships with a full in-memory mock of the AI service, the
matching engine, and the job lifecycle (`lib/mockBackend.ts`), so it
runs and demos completely standalone:

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. Try typing something like *"I need
someone to help me move a couch tomorrow afternoon"* — the mock AI
will ask a follow-up question or two, show a confirmation card, "find"
a worker (James R.), and walk the job through
matched → accepted → on the way → arrived → completed automatically,
so the whole loop from the spec is demoable today.

## Connecting to the real backend

`lib/api.ts` is the **only** file that knows whether it's talking to
the mock or to Engineer 2's real `/api/v1`. To switch over:

1. Set `NEXT_PUBLIC_USE_MOCK_API=false` and
   `NEXT_PUBLIC_API_BASE_URL=http://<api-host>/api/v1` in `.env.local`.
2. Nothing else in `/apps/customer` should need to change — every page
   already calls the functions exported from `lib/api.ts`, not `fetch`
   directly.

If a real response shape doesn't match `lib/types.ts`, that's a signal
to sync with Engineer 2 and update `/packages/contracts` (this repo's
`lib/types.ts` is a stand-in for that package and should be deleted
once it exists — see the comment at the top of the file).

## Routes implemented

| Route | Purpose |
|---|---|
| `/` | Redirects straight to `/chat` (the home screen *is* the chat) |
| `/login`, `/signup` | Auth |
| `/chat` | "What can we help you with?" — AI conversation → confirmation card |
| `/request/[requestId]` | "Looking for someone…" while matching runs |
| `/job/[jobId]` | Worker info, live status tracker, in-app messaging, rating |
| `/history` | Past and current services |
| `/profile` | Address, emergency contact, accessibility & communication preferences |
| `/settings` | Display options, caregiver invite, log out |

## Design decisions

- **One family, `Atkinson Hyperlegible`**, for everything. It's a
  typeface literally designed for low-vision and aging readers, which
  is a better fit here than a generic UI sans.
- **No service-category picker anywhere in the customer flow** — per
  the spec, the person only ever types or speaks in plain language;
  the AI (mocked here) does the categorizing.
- **Large tap targets (48px min), 2px borders, visible focus rings** —
  built for people who may have limited fine motor control or low
  vision, not just default browser styles.
- **A four-item bottom nav** (Get Help / My Services / Profile /
  Settings) is the entire information architecture. No hamburger
  menus, no nested settings.
- **Emergency detection is a hard branch in the UI**, not just a
  chat reply: if the AI ever returns `safetyStatus: POTENTIAL_EMERGENCY`,
  the confirmation flow is blocked and a 911 message is shown instead.

## Boundaries respected

This app never imports from `/apps/api`, `/apps/worker`, `/apps/admin`,
`/services/ai`, or `/services/matching`, and never touches Postgres,
Redis, or an LLM provider directly — everything goes through
`lib/api.ts` → the backend's `/api/v1` contract, exactly as the spec
requires.
