import type { AIService, MatchingService } from "@handy/contracts";
import { FallbackAIService } from "./fallback-ai";
import { FallbackMatchingService } from "./fallback-matching";
import { GuardedAIService, GuardedMatchingService } from "./guarded";

type Logger = { info: (msg: string) => void; warn: (msg: string) => void };

/**
 * Loads Aditya's services by module name. To plug them in, add
 * `"@handy/ai": "workspace:*"` / `"@handy/matching": "workspace:*"` to
 * apps/api/package.json; each package must export `createAIService()` /
 * `createMatchingService()`. Until then the built-in fallbacks are used.
 *
 * If a package fails to start (say the API key is missing), the server still
 * comes up on the built-in version. Once loaded, each one is wrapped so a
 * crash or bad answer later falls back for that one call.
 */
export async function loadIntegrations(
  modules: { ai: string; matching: string },
  log: Logger,
  opts: { aiTimeoutSeconds?: number } = {},
): Promise<{ ai: AIService; matching: MatchingService }> {
  const fallbackAI = new FallbackAIService();
  const fallbackMatching = new FallbackMatchingService();
  const ai = await tryLoad<AIService>(modules.ai, "createAIService", "processMessage", log);
  const matching = await tryLoad<MatchingService>(modules.matching, "createMatchingService", "findMatches", log);
  return {
    ai: ai ? new GuardedAIService(ai, fallbackAI, log, opts.aiTimeoutSeconds ? opts.aiTimeoutSeconds * 1000 : undefined) : (log.info("AI: using built-in rule-based fallback"), fallbackAI),
    matching: matching
      ? new GuardedMatchingService(matching, fallbackMatching, log)
      : (log.info("Matching: using built-in deterministic fallback"), fallbackMatching),
  };
}

async function tryLoad<T>(specifier: string, factory: string, method: string, log: Logger): Promise<T | null> {
  if (!specifier) return null;
  let mod: Record<string, unknown>;
  try {
    mod = (await import(specifier)) as Record<string, unknown>;
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code !== "ERR_MODULE_NOT_FOUND" && code !== "MODULE_NOT_FOUND") {
      log.warn(`Failed to load ${specifier}: ${(err as Error).message}; using fallback`);
    }
    return null;
  }
  const create = mod[factory] ?? (mod.default as Record<string, unknown> | undefined)?.[factory];
  if (typeof create !== "function") {
    log.warn(`${specifier} does not export ${factory}(); using fallback`);
    return null;
  }
  let service: unknown;
  try {
    service = await create();
  } catch (err) {
    log.warn(`${specifier} ${factory}() threw: ${(err as Error).message}; using fallback`);
    return null;
  }
  if (typeof (service as Record<string, unknown> | null)?.[method] !== "function") {
    log.warn(`${specifier} ${factory}() didn't return something with ${method}(); using fallback`);
    return null;
  }
  log.info(`Loaded ${specifier}`);
  return service as T;
}
