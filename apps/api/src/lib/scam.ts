/**
 * Keyword screening for the customer ↔ worker chat. Older adults are a common
 * target for "pay me on Venmo instead" and "I need your card number" scams, so
 * a worker message that looks like one gets flagged and the customer warned.
 */

export type ScamSignal = "OFF_PLATFORM_PAYMENT" | "GIFT_CARDS" | "SENSITIVE_INFO";

const PATTERNS: Record<ScamSignal, RegExp> = {
  OFF_PLATFORM_PAYMENT:
    /\b(venmo|cash ?app|zelle|paypal|apple ?pay|google ?pay|western union|moneygram|bitcoin|crypto|wire (me|the money|it)|pay (me )?(directly|outside|off)( of)?( the)? ?(app)?|pay me (in )?cash|cash only|(skip|avoid|go around) the (app|fee))\b/i,
  GIFT_CARDS: /\b(gift ?cards?|(itunes|apple|google play|steam|amazon|target|walmart) cards?)\b/i,
  // Wi-Fi/network passwords are fine: tech-support helpers legitimately need them.
  SENSITIVE_INFO:
    /\b(social security|ssn|bank account|routing number|account number|credit card|debit card|card number|cvv|security code|pin( number)?|(?<!(wi-?fi|wireless|network|router|internet) )password|medicare (number|card|id))\b/i,
};

/** Plain-language warnings shown under a flagged message. */
export const SCAM_WARNINGS: Record<ScamSignal, string> = {
  OFF_PLATFORM_PAYMENT: "Handy helpers are paid through the app. Never pay a helper another way.",
  GIFT_CARDS: "Handy helpers will never ask for gift cards. This is a common scam.",
  SENSITIVE_INFO: "Handy helpers never need your card, bank, Social Security, or Medicare details, or any password.",
};

/** What the worker did, e.g. `asked ${who} to pay outside the app` with who = "you" or "Margaret". */
export const SCAM_HEADLINES: Record<ScamSignal, (who: string) => string> = {
  OFF_PLATFORM_PAYMENT: (who) => `asked ${who} to pay outside the app`,
  GIFT_CARDS: (who) => `asked ${who} about gift cards`,
  SENSITIVE_INFO: (who) => `asked ${who} for personal or financial information`,
};

export function detectScamSignals(text: string): ScamSignal[] {
  return (Object.keys(PATTERNS) as ScamSignal[]).filter((s) => PATTERNS[s].test(text));
}

/** True if the text contains what looks like a real card number (Luhn-valid) or a Social Security number. */
export function containsSensitiveNumber(text: string): boolean {
  if (/\b\d{3}[- ]\d{2}[- ]\d{4}\b/.test(text)) return true; // 123-45-6789
  for (const match of text.matchAll(/\b(?:\d[ -]?){13,19}\b/g)) {
    const digits = match[0].replace(/\D/g, "");
    if (digits.length >= 13 && digits.length <= 19 && luhn(digits)) return true;
  }
  return false;
}

function luhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}
