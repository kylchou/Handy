import type { FastifyInstance, FastifyRequest } from "fastify";
import type { TokenPayload } from "../middleware/auth";

export interface RouteRateLimit {
  max: number;
  timeWindow: string;
  keyGenerator: (req: FastifyRequest) => string;
}

/**
 * Per-route limits for the endpoints worth protecting. These run after the
 * body is parsed (the plugin uses the preHandler hook) so login can be keyed by
 * email. Authenticated limits are keyed by user, falling back to IP.
 */
export function createRateLimits(app: FastifyInstance) {
  const userOrIp = (req: FastifyRequest) => {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (token) {
      try {
        return `user:${app.jwt.verify<TokenPayload>(token).sub}`;
      } catch {
        // Invalid token: the auth guard will reject it; key by IP meanwhile.
      }
    }
    return `ip:${req.ip}`;
  };
  const email = (req: FastifyRequest) => String((req.body as { email?: unknown } | undefined)?.email ?? "").trim().toLowerCase();

  return {
    /** Per IP + email, so one person guessing doesn't lock out everyone on the same wifi. */
    login: { max: 10, timeWindow: "15 minutes", keyGenerator: (req) => `login:${req.ip}:${email(req)}` },
    signup: { max: 10, timeWindow: "1 hour", keyGenerator: (req) => `signup:${req.ip}` },
    /** Every message is an LLM call once the real AI is plugged in. */
    aiMessage: { max: 20, timeWindow: "1 minute", keyGenerator: (req) => `ai-msg:${userOrIp(req)}` },
    newConversation: { max: 30, timeWindow: "1 hour", keyGenerator: (req) => `ai-conv:${userOrIp(req)}` },
    caregiverInvite: { max: 10, timeWindow: "15 minutes", keyGenerator: (req) => `invite:${userOrIp(req)}` },
  } satisfies Record<string, RouteRateLimit>;
}

export type RateLimits = ReturnType<typeof createRateLimits>;
