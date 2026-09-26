# Handy

Our HackGT project. It's an app where older adults can get help with everyday stuff (errands, rides, small repairs around the house, etc.) just by typing or saying what they need. An AI turns that into a job and sends it to nearby workers who can do it.

## Setup

You need Node 20+ and pnpm 10 (`npm i -g pnpm`).

```bash
pnpm install
cp .env.example .env
pnpm dev:api
```

The API runs on http://localhost:4000.

You don't need to install Postgres. By default it uses PGlite, which is basically Postgres running inside Node, and it saves to a `.data/` folder. The first time you start the API it creates the tables and adds demo data. If you want to use a real Postgres database instead, change `DATABASE_URL` in `.env`.

## Demo logins

Password for all of them is `password123`.

- `margaret@handy.demo` - customer
- `james@handy.demo` - worker (moving + home repairs, best match for the couch demo)
- `tom@handy.demo`, `maria@handy.demo`, `david@handy.demo`, `aisha@handy.demo`, `grace@handy.demo`, `marcus@handy.demo` - more workers
- `linda@handy.demo` - worker who isn't verified yet, so she won't get jobs until an admin approves her
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
pnpm test           # run the API tests
pnpm typecheck      # typecheck everything
pnpm db:generate    # make a new migration after changing packages/db/src/schema.ts
pnpm db:reset       # wipe the database and reseed it
```

## Notes

- All the endpoints and live events are documented in [docs/api.md](docs/api.md).
- Import shared types from `@handy/contracts` instead of making your own, so everyone stays in sync.
- If you're using the shared packages in a Next.js app, add `transpilePackages: ["@handy/contracts"]` to `next.config.js`.
