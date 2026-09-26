/**
 *   NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api/v1
 *
 * USE_MOCK_API lets this app run and demo completely on its own
 * (no backend, no AI service, no matching engine) while those pieces
 * are still being built.
 */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api/v1";

export const USE_MOCK_API =
  (process.env.NEXT_PUBLIC_USE_MOCK_API ?? "true") === "true";
