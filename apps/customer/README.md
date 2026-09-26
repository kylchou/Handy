# Customer App (Darsh)

This is `apps/customer`: the app an older adult uses to ask for help and follow a job through to the end.

## Running it

It talks to the real backend, so start that first. From the repo root:

```bash
pnpm install
pnpm dev:api        # backend on http://localhost:4000
pnpm dev:customer   # this app on http://localhost:3000
```

Log in as `margaret@handy.demo` / `password123`. No worker app handy? Log in as `admin@handy.demo` on http://localhost:4000/docs and turn on the demo autopilot (`PUT /admin/demo/autopilot`), and it'll play the worker's side for you.

If the backend is somewhere else (like a hosted one), copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_API_URL`.

## Talking to the backend

Everything goes through `lib/api.ts`, which is just the typed client from `@handy/contracts`. Pages call things like `api.conversations.sendMessage(...)` or `api.jobs.get(...)`, and the types come from the same package the backend uses, so if something changes on the backend, TypeScript will point at it here. Every endpoint is in [docs/api.md](../../docs/api.md).

Live updates (worker accepted, on the way, new messages) come from `api.realtime.subscribe`, which reconnects by itself.

## Routes implemented

| Route | Purpose |
|---|---|
| `/` | Redirects straight to `/chat` (the home screen *is* the chat) |
| `/login`, `/signup` | Auth |
| `/chat` | "What can we help you with?" AI conversation, then the confirmation card |
| `/request/[requestId]` | "Looking for someone…" while matching runs |
| `/job/[jobId]` | Worker info, arrival code, live status tracker, messaging (with scam warnings), rating |
| `/history` | Past and current services, with a "Book again" button |
| `/profile` | Address, emergency contact, accessibility & communication preferences |
| `/settings` | Display options, caregiver invite, log out |

## Design decisions

- **One family, `Atkinson Hyperlegible`**, for everything. It's a
  typeface literally designed for low-vision and aging readers, which
  is a better fit here than a generic UI sans.
- **No service-category picker anywhere in the customer flow**. Per
  the spec, the person only ever types or speaks in plain language;
  the AI does the categorizing.
- **Large tap targets (48px min), 2px borders, visible focus rings**,
  built for people who may have limited fine motor control or low
  vision, not just default browser styles.
- **A four-item bottom nav** (Get Help / My Services / Profile /
  Settings) is the entire information architecture. No hamburger
  menus, no nested settings.
- **Emergency detection is a hard branch in the UI**, not just a
  chat reply: if the AI ever returns `safetyStatus: POTENTIAL_EMERGENCY`,
  the confirmation flow is blocked and a big call button (911, or 988
  for a mental health crisis) is shown instead.

## Boundaries respected

This app never imports from `/apps/api`, `/apps/worker`, `/apps/admin`,
`/services/ai`, or `/services/matching`, and never touches Postgres,
Redis, or an LLM provider directly. Everything goes through
`lib/api.ts` and the backend's `/api/v1` contract.
