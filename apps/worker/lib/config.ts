/**
 * Where the backend is. Locally that's `pnpm dev:api` on port 4000.
 * For a deployed app, set NEXT_PUBLIC_API_URL to the hosted API.
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
