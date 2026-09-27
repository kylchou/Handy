# Worker App

This is `apps/worker`: the app a worker uses to find jobs near them, do them, and get paid. Arjun planned the screens and how jobs are shown to workers, and Kyler built it.

## Running it

From the repo root, with the API already running (`pnpm dev:api`):

```bash
pnpm dev:worker   # http://localhost:3001
```

Log in as `james@handy.demo` / `password123`. Then book something from the customer app as Margaret, and it shows up on James's screen right away.

If the backend is somewhere else, copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_API_URL`.

## Screens

| Route | What it does |
|---|---|
| `/login`, `/signup` | Worker accounts. Customers who try to log in here get pointed to the customer app |
| `/dashboard` | Available jobs near you. New offers show up live with a countdown, and ones someone else took disappear. Also has the "taking jobs" on/off switch |
| `/jobs/[id]?offer=1` | Offer details: service, distance, time, what the customer asked for, and pay, with Accept and Decline. The exact address only shows after accepting |
| `/jobs/[id]` | A job you've accepted: address with directions, then I'm On My Way, I've Arrived (needs the customer's 4-digit code), Start Job, Complete Job. Chat with the customer, and cancel if needed |
| `/jobs` | Your upcoming jobs |
| `/history` | Finished jobs, earnings for the last 7 days and all time, and your rating |
| `/profile` | Kinds of jobs you do (and how experienced you are), how far you'll travel, where you work from, and a short bio |
| `/availability` | Your weekly hours. You only get jobs that fit inside them |

New workers go signup, then profile, then hours, then the dashboard. They see an "account being reviewed" note until an admin verifies them, since unverified workers never get jobs.

Every status change goes through the backend (`PATCH /api/v1/jobs/:jobId/status`), which checks the move is allowed. All calls use the typed client from `@handy/contracts` in `lib/api.ts`.
