# Handy

The whole idea behind Handy is pretty simple. Somebody's grandma needs her porch light fixed, but she can't get on a ladder anymore, and she definitely doesn't want to dig through fifteen menus in an app to find help. So instead, she just says what she needs, like she's talking to a person. The AI figures out what kind of job it is, asks whatever it's missing, and sends it to workers nearby who are actually qualified to do it. Someone accepts, shows up, does the job, and she rates them after. That's the loop, and honestly, that loop is the entire product.

## Who owns what

We split the repo up so the four of us can work at the same time without stepping on each other's files. If a folder isn't yours, please don't edit it without asking first. It'll save us a lot of merge conflicts at 3 AM.

| Folder | Who | What's in it |
| --- | --- | --- |
| `apps/customer` | Darsh | The customer web app (Next.js) |
| `packages/ui` | Darsh | Shared UI components |
| `apps/api` | Kyler | The backend API (Fastify + TypeScript) |
| `packages/contracts` | Kyler | Shared types and request schemas. This is the single source of truth. |
| `packages/db` | Kyler | Database schema, migrations, and seed data (Drizzle + PostgreSQL) |
| `services/ai` | Aditya | The AI assistant (`@handy/ai`) |
| `services/matching` | Aditya | The matching engine (`@handy/matching`) |
| `apps/worker`, `apps/admin` | Arjun | The worker app and the admin dashboard |
| `infrastructure` | Arjun | Docker and deployment |

The root files (`package.json`, `pnpm-workspace.yaml`, this README, `.env.example`) are mine, but if you need something changed in them, just tell me and we'll figure it out.

## Getting it running

You'll need Node 20 or newer and pnpm 10. If you don't have pnpm, either run `npm i -g pnpm` or just stick `npx pnpm@10` in front of every command.

```bash
pnpm install
cp .env.example .env
pnpm dev:api          # runs on http://localhost:4000
```

That's it. You don't need to install Postgres or Docker. By default, `DATABASE_URL=pglite://.data/handy` runs an embedded version of Postgres (PGlite) that just lives in a `.data/` folder. The first time the API starts, it sets up the tables and fills them with demo data on its own. If you'd rather use a real Postgres server, change `DATABASE_URL` to something like `postgres://user:pass@host:5432/db`.

### Demo accounts

Every demo account uses the password `password123`.

| Email | Role | What's worth knowing |
| --- | --- | --- |
| `margaret@handy.demo` | Customer | Lives at 123 Main Street in Atlanta. She already has one finished job in her history, so that screen isn't empty. |
| `james@handy.demo` | Worker | Home maintenance and moving, 4.9 stars, 87 jobs. He's the top match for the couch demo, which is on purpose. |
| `tom@handy.demo` | Worker | Moving, lawn care, and some basic maintenance |
| `maria@handy.demo` | Worker | Errands, cleaning, and lawn care |
| `david@handy.demo` | Worker | Rides, companionship, and errands |
| `aisha@handy.demo` | Worker | Tech help |
| `grace@handy.demo` | Worker | Pets |
| `marcus@handy.demo` | Worker | Cleaning and moving, but only on weekdays |
| `linda@handy.demo` | Worker | Still waiting on verification, so she won't get any jobs until an admin approves her |
| `admin@handy.demo` | Admin | |

### Scripts you'll actually use

```bash
pnpm dev:api        # the API, restarts when you save
pnpm test           # the API's end-to-end tests (uses a throwaway in-memory database)
pnpm typecheck
pnpm db:generate    # run this after changing packages/db/src/schema.ts, it writes a new migration
pnpm db:migrate     # apply migrations
pnpm db:seed        # apply migrations and add the demo data if the database is empty
pnpm db:reset       # wipe everything and start fresh
```

## If you're building on top of the backend

Start with [docs/api.md](docs/api.md). It has every endpoint, the live events, and how the AI and matching services plug in.

One thing I'm going to keep repeating: please import types from `@handy/contracts` instead of writing your own versions of them.

```ts
import { type ServiceRequestDTO, JobStatus, createServiceRequestSchema } from "@handy/contracts";
```

If everyone makes their own `Job` type, they'll slowly drift apart, and we won't find out until demo day when something breaks. If you need a field that isn't there yet, ask me and I'll add it.

Also, the Next.js apps read our shared packages as raw TypeScript, so add this to your `next.config.js` or the build will complain:

```js
transpilePackages: ["@handy/contracts"]
```
