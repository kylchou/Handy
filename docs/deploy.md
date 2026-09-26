# Deploying the API

This is for putting the backend online so the apps work on judges' phones and not just on localhost. It works on Render, Railway, Fly, or anything else that can run a Dockerfile or a Node app. The frontends get deployed separately (Vercel is easiest for Next.js).

## Two ways to run it

**With the Dockerfile (works anywhere).** Point the host at the repo and it'll find the `Dockerfile` in the root. Nothing else to set up besides the environment variables below.

**Without Docker.** If the host wants plain commands instead:

- Build command: `pnpm install --frozen-lockfile`
- Start command: `pnpm start`
- Node 20 or newer (the version is in `package.json` under `engines`)

The host tells the app which port to use with `PORT`, and the API picks that up by itself.

## Environment variables

| Variable | What to put | Needed? |
| --- | --- | --- |
| `NODE_ENV` | `production` (the Dockerfile already sets it) | yes |
| `JWT_SECRET` | any long random string. The server won't start without it in production | yes |
| `CORS_ORIGINS` | the frontend URLs, comma separated, like `https://handy-customer.vercel.app,https://handy-worker.vercel.app`. `https://*.vercel.app` covers preview deploys too | yes |
| `ANTHROPIC_API_KEY` | the key for Aditya's AI. Without it the chat can't use the real AI | for the real AI |
| `ALLOW_DEMO_RESET` | `true`, so demo reset and the demo autopilot work. They're off in production otherwise | for the demo |
| `DATABASE_URL` | the host's Postgres URL. See below if you skip this | recommended |
| `DATABASE_SSL` | `true` if the database needs SSL and the URL doesn't already have `sslmode=require` | sometimes |
| `DOCS_ENABLED` | `true` if you want the `/docs` page online. It's off in production by default | no |
| `AI_TIMEOUT_SECONDS` | seconds the real AI gets per message before the built-in one answers instead. Default 30 | no |
| `GEOCODER_CONTACT` | a team email, sent to OpenStreetMap when looking up addresses (they ask for one) | no |

Everything else in `.env.example` has a sensible default.

## Database

Easiest is to add the host's Postgres (Render, Railway, and Fly all have one) and copy its URL into `DATABASE_URL`. Tables get created and the demo accounts get added the first time the server starts, so there's nothing to run by hand.

If you don't set `DATABASE_URL`, it uses the embedded database and saves to `/app/.data`. That works, but on most hosts that folder gets wiped on every redeploy or restart, so all the data goes back to the demo accounts. For a hackathon that's honestly fine. If you want it to stick around, attach a disk or volume at `/app/.data`.

## Checking it worked

- `https://<your-api>/health` should say `{"ok":true,...}`. Use this as the health check path if the host asks for one.
- Look for `Loaded @handy/ai` in the logs, then send a chat message. If the AI keeps asking you to say it again, or the logs mention the API key, check `ANTHROPIC_API_KEY`.
- Log in as `margaret@handy.demo` / `password123` from a deployed frontend. If the browser console says something about CORS, the frontend's URL isn't in `CORS_ORIGINS`. It has to match exactly, including `https://` and no trailing path.

## Things to know

- Only run **one** copy of the API. Live updates are kept in memory, so two copies wouldn't see each other's events.
- Free tiers on some hosts go to sleep after a while with no traffic, and the first request after that can take 30+ seconds. Open `/health` a few minutes before judging to wake it up.
- The live updates use WebSockets and SSE, and all three hosts above support those without extra setup.
- Frontends need the API's URL, like `https://<your-api>` passed as `baseUrl` to `createApiClient`. Don't add `/api/v1`, the client does that.
