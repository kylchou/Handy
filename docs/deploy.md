# Deploying

This puts Handy online so the apps work on judges' phones, not just on localhost. We use **Railway**: it doesn't go to sleep like free Render does, and one project holds the database, the API, and the apps.

Everything is built from the Dockerfiles in [`infrastructure/`](../infrastructure):

- `api.Dockerfile` for the backend
- `web.Dockerfile` for the customer, worker, and admin apps (the `APP` variable picks which)

It takes about 20 minutes the first time. Merge everything into `main` first, since Railway deploys from `main`.

## 1. Make the project

1. Sign up at [railway.com](https://railway.com) with GitHub.
2. **New Project**, then **Deploy from GitHub repo**, and pick `Handy`. If it asks, give Railway access to the repo.
3. That creates one service. We'll turn it into the API in step 3.

## 2. Add the database

In the project, click **+ Create** (or **+ New**), then **Database**, then **PostgreSQL**. Nothing to set.

## 3. The API

Click the service from step 1. Rename it `api` (Settings, at the top) so the variable below works.

**Variables** tab, add:

| Variable | Value |
| --- | --- |
| `RAILWAY_DOCKERFILE_PATH` | `infrastructure/api.Dockerfile` |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (type it exactly, Railway fills it in) |
| `JWT_SECRET` | any long random string, like a password manager's generated one |
| `MODEL_API_KEY` | the Muse key |
| `ALLOW_DEMO_RESET` | `true` (so `pnpm demo` works) |
| `DOCS_ENABLED` | `true` if you want the `/docs` page online |

**Settings** tab:

- Under **Networking**, click **Generate Domain**. Copy it, something like `https://api-production-1234.up.railway.app`.
- Under **Deploy**, set the **Healthcheck Path** to `/health`.

It redeploys by itself. Check it worked: open `https://<api domain>/health` and you should see `{"ok":true,...}`. In the **Deployments** logs you should see `Loaded @handy/ai`.

The first start creates the tables and the demo accounts, so there's nothing to run by hand.

## 4. The customer app

**+ Create**, then **GitHub Repo**, pick `Handy` again. Rename it `customer`.

Variables:

| Variable | Value |
| --- | --- |
| `RAILWAY_DOCKERFILE_PATH` | `infrastructure/web.Dockerfile` |
| `APP` | `customer` |
| `NEXT_PUBLIC_API_URL` | the API domain from step 3, like `https://api-production-1234.up.railway.app` (no `/api/v1`, no slash at the end) |

Settings, Networking, **Generate Domain**. Copy it.

## 5. The worker app

Same as step 4, but name it `worker` and set `APP` to `worker`. Generate a domain and copy it.

(When the admin dashboard is merged, do it once more with `APP` set to `admin`.)

## 6. Let the apps talk to the API

Back in the `api` service's Variables, add:

| Variable | Value |
| --- | --- |
| `CORS_ORIGINS` | the app domains, comma separated, like `https://customer-production-1234.up.railway.app,https://worker-production-5678.up.railway.app` |

Without this the browser blocks the apps from calling the API.

## 7. Try it

Open the customer domain on your phone, log in as `margaret@handy.demo` / `password123`, and ask for help. Open the worker domain in another window as `james@handy.demo` and the job shows up.

To use the demo commands against the hosted API, run them with `DEMO_API_URL` set (PowerShell):

```
$env:DEMO_API_URL="https://api-production-1234.up.railway.app"; pnpm demo status
```

## After that

- **Every push to `main` redeploys everything.** Don't merge anything risky right before judging.
- **If the API's domain changes**, update `NEXT_PUBLIC_API_URL` on the apps. It's built into the app, so they need to redeploy (Railway does it when you change the variable).
- **If the browser console says CORS**, the app's domain isn't in `CORS_ORIGINS` exactly (it needs `https://`, no slash at the end).
- **Only run one copy of the API.** Live updates are kept in memory, so two copies wouldn't see each other's events.
- **Cost:** the trial credit easily covers a hackathon. Check the project's **Usage** page if you're worried.

## All the API settings

| Variable | What it's for |
| --- | --- |
| `JWT_SECRET` | Required in production. The server won't start without it |
| `DATABASE_URL` | Postgres URL. Without it the API uses an embedded database that gets wiped on every redeploy |
| `DATABASE_SSL` | `true` if an outside database needs SSL (Railway's doesn't) |
| `MODEL_API_KEY` | Muse key. Without it the chat uses the built-in assistant |
| `CORS_ORIGINS` | App domains allowed to call the API. `https://*.up.railway.app` style wildcards work too |
| `ALLOW_DEMO_RESET` | Turns on demo reset and the autopilot, which are off in production otherwise |
| `DOCS_ENABLED` | Turns on `/docs`, off in production otherwise |
| `AI_TIMEOUT_SECONDS` | How long the real AI gets per message before the built-in one answers. Default 45 |
| `GEOCODER_CONTACT` | A team email sent to OpenStreetMap with address lookups (they ask for one) |

Everything else in `.env.example` has a sensible default.

## Other hosts

The Dockerfiles work anywhere that builds from the repo root: `docker build -f infrastructure/api.Dockerfile .` for the API, and `docker build -f infrastructure/web.Dockerfile --build-arg APP=customer --build-arg NEXT_PUBLIC_API_URL=https://your-api .` for an app. Both use the `PORT` the host gives them.
