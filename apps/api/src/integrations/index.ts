import type { AIService, MatchingService } from "@handy/contracts";
import { FallbackAIService } from "./fallback-ai";
import { FallbackMatchingService } from "./fallback-matching";

type Logger = { info: (msg: string) => void; warn: (msg: string) => void };

/**
 * Loads Aditya's (Engineer 3) services by module name. To plug them in, add
 * `"@handy/ai": "workspace:*"` / `"@handy/matching": "workspace:*"` to
 * apps/api/package.json; each package must export `createAIService()` /
 * `createMatchingService()`. Until then the built-in fallbacks are used.
 */
export async function loadIntegrations(
  modules: { ai: string; matching: string },
  log: Logger,
): Promise<{ ai: AIService; matching: MatchingService }> {
  const ai = await tryLoad<AIService>(modules.ai, "createAIService", log);
  const matching = await tryLoad<MatchingService>(modules.matching, "createMatchingService", log);
  return {
    ai: ai ?? (log.info("AI: using built-in rule-based fallback"), new FallbackAIService()),
    matching: matching ?? (log.info("Matching: using built-in deterministic fallback"), new FallbackMatchingService()),
  };
}

async function tryLoad<T>(specifier: string, factory: string, log: Logger): Promise<T | null> {
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
  log.info(`Loaded ${specifier}`);
  return (await create()) as T;
}
