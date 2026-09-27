# Admin Dashboard

This is `apps/admin`: the screen the Handy team uses to keep an eye on things. Arjun planned what it shows, and Kyler built it. It's laid out for a laptop but works on a phone too.

## Running it

From the repo root, with the API running (`pnpm dev:api`):

```bash
pnpm dev:admin   # http://localhost:3002
```

Log in as `admin@handy.demo` / `password123`. Other accounts get turned away.

## Screens

| Route | What it shows |
|---|---|
| `/dashboard` | Active requests, active jobs, available workers, completed today. A "needs attention" list (requests still searching after 10 minutes, possible no-shows, workers waiting to be verified), a live activity feed, and demo controls: autopilot on/off, Go, and reset |
| `/requests` | Every request with a status filter. "See matches" shows how the matching engine ranked workers for it, with scores and reasons. Requests still searching can be cancelled |
| `/jobs` | Every job with its customer, worker, status, pay, and rating. Possible no-shows are flagged |
| `/workers` | Workers waiting on a decision come first. Verify, reject, or suspend them, and see their skills, availability, rating, and reviews |
| `/customers` | Customers with their address, emergency contact, and how many requests they've made |

Everything updates live, since admins get every event from the backend. All calls go through the typed client from `@handy/contracts` in `lib/api.ts`.
