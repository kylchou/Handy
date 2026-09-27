import type { PriceQuoteDTO, Urgency } from "@handy/contracts";

const URGENT_SURCHARGE_CENTS = 1000;

/** Simple for now: the category's base price, plus $10 if it's urgent. This is what the worker earns. */
export function estimatePriceCents(basePriceCents: number, urgency: Urgency | null | undefined): number {
  return basePriceCents + (urgency === "HIGH" ? URGENT_SURCHARGE_CENTS : 0);
}

/** The full breakdown the customer sees and agrees to before confirming. */
export function quotePrice(basePriceCents: number, urgency: Urgency | null | undefined, platformFeeCents: number): PriceQuoteDTO {
  const servicePriceCents = estimatePriceCents(basePriceCents, urgency);
  return {
    servicePriceCents,
    urgentSurchargeCents: servicePriceCents - basePriceCents,
    platformFeeCents,
    totalCents: servicePriceCents + platformFeeCents,
  };
}
