/**
 * Turns CORS_ORIGINS into a check. Entries can be exact
 * (`https://handy.vercel.app`), use a `*` for one subdomain level
 * (`https://*.vercel.app`, handy for preview deploys), or be just `*` to
 * allow anything.
 */
export function originMatcher(allowed: string[]): (origin: string) => boolean {
  if (allowed.includes("*")) return () => true;
  const exact = new Set(allowed.filter((o) => !o.includes("*")).map(trimSlash));
  const patterns = allowed
    .filter((o) => o.includes("*"))
    .map((o) => new RegExp(`^${trimSlash(o).split("*").map(escape).join("[a-z0-9-]+")}$`, "i"));
  return (origin) => exact.has(trimSlash(origin)) || patterns.some((p) => p.test(trimSlash(origin)));
}

const trimSlash = (s: string) => s.replace(/\/+$/, "");
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
