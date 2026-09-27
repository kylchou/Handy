# Handy

Our HackGT project. It's an app where older adults can get help with everyday stuff (errands, rides, small repairs around the house, etc.) just by typing or saying what they need. An AI turns that into a job and sends it to nearby workers who can do it.

## How it works

1. The customer chats with the AI (typing or voice) about what they need.
2. The AI figures out the type of job, date, time, and location, and asks for anything missing.
3. The customer confirms, and the job gets sent to the best nearby workers who are qualified, verified, and free at that time.
4. The first worker to accept gets it. Everyone else's offer goes away.
5. The worker updates the status (on the way, arrived, started, done) and the customer sees it live. To mark "arrived," the worker has to enter a code the customer reads to them at the door.
6. The customer rates the worker when it's done.

## What the backend handles

- AI chat that turns a conversation into a job request
- Matching workers by qualifications, schedule, distance, rating, and experience. Addresses get looked up on a map (OpenStreetMap), so "2.4 miles away" is real even when the job isn't at the customer's house
- Only verified workers get jobs
- "Can James come back?": customers can ask for someone who helped before (in the chat or with a button), and that person gets asked first. People they rated 1–2 stars never get their jobs again
- Workers can't accept two jobs at the same time
- Arrival code: the customer gets a 4-digit code and the worker has to enter it to mark that they've arrived, so the customer knows the right person is at the door
- Offers expire after 5 minutes if the worker doesn't respond, and the job goes to the next person
- If nobody takes a request before its time passes, it's closed and the customer is asked to pick another time
- If a worker cancels, the job goes back out to other workers
- Anything that sounds like an emergency is blocked and the user is told to call 911
- Reminders the day before and an hour before each job, for both the customer and the worker
- Repeating requests ("mow my lawn every Saturday"): each visit gets posted a few days ahead, and the same helper gets asked first if the last visit went well
- No-show alerts: if a worker hasn't headed out 10 minutes after the start time, the customer, their family, and admins all get told
- Workers only see a general area until they accept, then they get the full address
- Customer and worker chat, so nobody has to share phone numbers. Once a job is accepted they can type or send voice messages (up to a minute, tap the mic to record). Worker messages that look like a scam (pay me on Venmo, gift cards, asking for your card number) get flagged and the customer and their family are warned, and nobody can send a card or Social Security number
- Caregiver mode: family members can link to someone with an invite code, see their jobs, and get updates when a worker arrives or finishes. They also get alerted if the person describes an emergency to the AI.
- Live updates over SSE or WebSockets, plus saved notifications. If the connection drops, it catches up on what it missed when it reconnects.
- Ratings, job history, worker earnings, and admin stats
- A typed API client in `@handy/contracts` for the frontends
- The customer sees the full price (service, urgent add-on, Handy fee, and an optional tip of 10/15/20% or a custom % or amount) and has to agree to it before a request is sent, and the worker sees what they'll earn, tip included, before accepting
- Written reviews: customers can add a few words with their star rating, and anyone can read a worker's reviews on their card
- A demo reset so we can start the demo fresh for each judge
- If the AI or matching service crashes, hangs, or sends back junk, the backend quietly uses its built-in version for that message instead of breaking the demo
- Rate limits on login, signup, and the AI chat, so nobody can brute force passwords or run up our AI bill

## Setup

You need Node 20+ and pnpm 10 (`npm i -g pnpm`).

```bash
pnpm install
cp .env.example .env
pnpm dev:api
```

The API runs on http://localhost:4000, and you can try every endpoint in the browser at http://localhost:4000/docs.

Then, in other terminals:

```bash
pnpm dev:customer   # customer app on http://localhost:3000
pnpm dev:worker     # worker app on http://localhost:3001
pnpm dev:admin      # admin dashboard on http://localhost:3002
```

Log in to the customer app as Margaret and the worker app as James (below) in two browser windows, and you can do a whole job from both sides.

You don't need to install Postgres. By default it uses PGlite, which is basically Postgres running inside Node, and it saves to a `.data/` folder. The first time you start the API it creates the tables and adds demo data. If you want to use a real Postgres database instead, change `DATABASE_URL` in `.env`.

## Demo logins

Password for all of them is `password123`.

- `margaret@handy.demo` - customer
- `james@handy.demo` - worker. He's the only one in the demo and does every kind of job, so whatever Margaret asks for goes to him
- `susan@handy.demo` - caregiver (Margaret's daughter), already linked to Margaret. Log into the customer app as her to see the family view
- `admin@handy.demo` - admin

## Who's working on what

| Folder | Person |
| --- | --- |
| `apps/customer`, `packages/ui` | Darsh |
| `apps/api`, `packages/contracts`, `packages/db` | Kyler |
| `services/ai`, `services/matching` | Aditya |
| `apps/worker`, `apps/admin`, `infrastructure` | Arjun |

Try not to edit someone else's folder without checking with them first so we don't get merge conflicts. If you need to change a root file (`package.json`, `pnpm-workspace.yaml`, `.env.example`), let Kyler know.

## Commands

```bash
pnpm dev:api        # start the API
pnpm dev:customer   # start the customer app on http://localhost:3000 (start the API first)
pnpm dev:worker     # start the worker app on http://localhost:3001
pnpm dev:admin      # start the admin dashboard on http://localhost:3002
pnpm demo reset     # put the demo data back to the start (the admin dashboard has a button for this too)
pnpm test           # run the API tests
pnpm typecheck      # typecheck everything
pnpm db:generate    # make a new migration after changing packages/db/src/schema.ts
pnpm db:reset       # wipe the database and reseed it
```

Every push to `main` and every PR runs typecheck and the tests on GitHub (once with the embedded database and once with a real Postgres). It also fails if someone changes `packages/db/src/schema.ts` without running `pnpm db:generate`. If your PR goes red, click into the check to see what broke.

## Notes

- All the endpoints and live events are documented in [docs/api.md](docs/api.md), and there are interactive docs at `/docs` while the API is running.
- The demo script, checklist, and what to do if something breaks are in [docs/demo.md](docs/demo.md).
- To put everything online (we use Railway), see [docs/deploy.md](docs/deploy.md). The Dockerfiles are in `infrastructure/`.
- Between demo runs, log in as admin and call `POST /api/v1/admin/demo/reset` (or `api.admin.resetDemo()`) to put everything back to the starting data without logging anyone out.
- Use `createApiClient` from `@handy/contracts` to call the backend instead of writing fetch calls (see the top of [docs/api.md](docs/api.md)).
- Import shared types from `@handy/contracts` instead of making your own, so everyone stays in sync.
- If you're using the shared packages in a Next.js app, add `transpilePackages: ["@handy/contracts"]` to `next.config.js`.
