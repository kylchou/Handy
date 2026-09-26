/**
 * API_BASE_URL should point at Engineer 2's backend, e.g.
 *   NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api/v1
 *
 * USE_MOCK_API lets this app run and demo completely on its own
 * (no backend, no AI service, no matching engine) while those pieces
 * are still being built. Flip it to "false" the moment the real
 * `/api/v1` routes exist and everything below should keep working
 * unchanged, since lib/api.ts is the only file that reads this flag.
 */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api/v1";

export const USE_MOCK_API =
  (process.env.NEXT_PUBLIC_USE_MOCK_API ?? "true") === "true";
