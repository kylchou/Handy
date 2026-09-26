import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import type { UserRole } from "@handy/contracts";
import { ApiError } from "../lib/errors";
import type { Actor } from "../services/context";

export interface TokenPayload {
  sub: string;
  role: UserRole;
  jti: string;
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: TokenPayload;
    user: Actor & { jti: string; exp?: number };
  }
}

/**
 * Stateless JWTs plus an in-memory revocation list so /auth/logout takes effect
 * immediately. Revocations are lost on restart; tokens still expire normally.
 */
export class TokenRevocations {
  private revoked = new Map<string, number>();

  revoke(jti: string, expSeconds?: number) {
    this.revoked.set(jti, (expSeconds ?? Date.now() / 1000 + 7 * 86400) * 1000);
    if (this.revoked.size > 1000) this.prune();
  }

  isRevoked(jti: string) {
    return this.revoked.has(jti);
  }

  private prune() {
    const now = Date.now();
    for (const [jti, exp] of this.revoked) if (exp < now) this.revoked.delete(jti);
  }
}

export function newJti() {
  return randomUUID();
}

/** Verifies a raw token (used by SSE/WebSocket, which pass it as ?token=). */
export function verifyToken(app: FastifyInstance, revocations: TokenRevocations, token: string | undefined): Actor & { jti: string } {
  if (!token) throw new ApiError("UNAUTHENTICATED", "Please log in.");
  let payload: TokenPayload;
  try {
    payload = app.jwt.verify<TokenPayload>(token);
  } catch {
    throw new ApiError("UNAUTHENTICATED", "Your session has ended. Please log in again.");
  }
  if (revocations.isRevoked(payload.jti)) throw new ApiError("UNAUTHENTICATED", "Your session has ended. Please log in again.");
  return { id: payload.sub, role: payload.role, jti: payload.jti };
}

export function authenticate(revocations: TokenRevocations) {
  return async function (request: FastifyRequest, _reply: FastifyReply) {
    try {
      await request.jwtVerify();
    } catch {
      throw new ApiError("UNAUTHENTICATED", "Please log in to continue.");
    }
    if (revocations.isRevoked(request.user.jti)) throw new ApiError("UNAUTHENTICATED", "Your session has ended. Please log in again.");
  };
}

/** Must run after `authenticate`. */
export function requireRole(...roles: UserRole[]) {
  return async function (request: FastifyRequest) {
    if (!roles.includes(request.user.role)) {
      throw new ApiError("FORBIDDEN", "This action isn't available for your account type.");
    }
  };
}
