import type { preHandlerHookHandler } from "fastify";
import type { RateLimits } from "../lib/rate-limits";
import type { Services } from "../services";

export interface Guards {
  /** Any logged-in user. */
  auth: preHandlerHookHandler[];
  customer: preHandlerHookHandler[];
  worker: preHandlerHookHandler[];
  caregiver: preHandlerHookHandler[];
  admin: preHandlerHookHandler[];
  customerOrAdmin: preHandlerHookHandler[];
  workerOrAdmin: preHandlerHookHandler[];
  /** Everyone who takes part in jobs directly (not caregivers). */
  jobParticipant: preHandlerHookHandler[];
}

export interface RouteDeps {
  services: Services;
  guards: Guards;
  limits: RateLimits;
}

export type IdParams<K extends string> = { Params: Record<K, string> };
