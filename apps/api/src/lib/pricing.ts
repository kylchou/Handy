import type { Urgency } from "@handy/contracts";

const URGENT_SURCHARGE_CENTS = 1000;

/** Simple for now: the category's base price, plus $10 if it's urgent. */
export function estimatePriceCents(basePriceCents: number, urgency: Urgency | null | undefined): number {
  return basePriceCents + (urgency === "HIGH" ? URGENT_SURCHARGE_CENTS : 0);
}
