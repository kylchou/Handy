/**
 * Where the backend is. Locally that's `pnpm dev:api` on port 4000.
 * For a deployed app, set NEXT_PUBLIC_API_URL to the hosted API.
 */
const raw = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").trim().replace(/\/+$/, "");

// "handyapi.up.railway.app" without https:// would be treated as a path on this site, so add it.
export const API_URL = /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
