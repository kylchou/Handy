import { CARD_NUMBER_RE, EMAIL_RE, has, normalize, PHONE_RE, SSN_RE } from "./patterns.js";

/**
 * Screens customer ↔ worker job chat before the backend saves a message.
 * Deterministic, no model call. Protects customers from payment/credential
 * scams and from oversharing.
 */

export type ChatSender = "customer" | "worker";

export type ScamFlag =
  | "GIFT_CARDS"
  | "OFF_PLATFORM_PAYMENT"
  | "FINANCIAL_REQUEST"
  | "FINANCIAL_DATA"
  | "PASSWORD_REQUEST"
  | "PASSWORD_DATA"
  | "CONTACT_INFO";

export interface ScreenResult {
  /** allow → save + deliver. warn → save + deliver + show notice. block → don't deliver, show notice to sender. */
  action: "allow" | "warn" | "block";
  flags: ScamFlag[];
  /** Plain text for the person in noticeFor. */
  notice?: string;
  noticeFor?: "sender" | "customer";
  /** Worth a look on the admin dashboard. */
  flagForAdmin: boolean;
}

/** Wi-Fi passwords and gate/door codes are normal job talk; stripped before password checks. */
const HARMLESS_CODES = /\b(wifi|wi-fi|wireless|network|internet|gate|door|garage|lockbox|building|entry|alarm|key ?pad) (password|passcode|code|pin|combo|combination)\b/g;

/** Scam-style gift card talk (codes, paying with them, "for me"). "Pick up a gift card for my grandson" passes. */
const GIFT_CARD_SCAM =
  /\bgift ?cards?\b.{0,50}\b(code|codes|numbers?|back of|scratch|send (me|them)|text (me|them)|for me|as payment)\b|\b(pay|paying|payment)\b.{0,30}\bgift ?cards?\b|\b(send|text) me\b.{0,40}\bgift ?cards?\b/;
const OFF_PLATFORM_PAYMENT =
  /\b(venmo|zelle|cash ?app|paypal|western union|moneygram|wire transfer|bitcoin|crypto|bank transfer)\b|\bpay (me )?(directly|in cash|cash|outside|off the app)\b|\b(cash|check) instead\b/;
/** Asking for account details. "Store only takes credit card" passes. */
const FINANCIAL_REQUEST =
  /\b(routing number|account number|card number|cvv|social security|ssn|bank login)\b|\b(tell|give|send|read|share|what'?s|what is|need|want)\b.{0,30}\b(bank account|credit card|debit card|bank info|banking info)\b/;
const PASSWORD_REQUEST =
  /\b(tell|give|send|read|share|text|what'?s|what is)\b.{0,30}\b(password|passcode|pin|verification code|login|one[- ]time code|code (we|i|they) (sent|texted)|code on your (phone|screen))\b/;
const PASSWORD_DATA = /\bmy (password|passcode|pin)( number)? is\b|\b(password|passcode|pin)\s*(is|:)\s*\S+/;
const CONTACT_ASK = /\b(text|call|whatsapp|email) me\b|\bmy (cell|phone|number|email) is\b/;

const NOTICES = {
  workerBlocked:
    "This message wasn't sent. Handy helpers can't ask for gift cards, payment outside the app, bank or card details, or passwords.",
  customerBlocked:
    "For your safety, this message wasn't sent. Never share bank, card, Social Security, or password details with a helper. Handy takes care of payment.",
  paymentTip: "Payment is handled by Handy. You never need to pay your helper another way.",
  contactTip: "Tip: you can keep chatting right here in Handy. You don't need to share a phone number or email.",
};

export function screenJobMessage(text: string, sender: ChatSender): ScreenResult {
  const raw = text;
  const lower = normalize(text);
  const withoutHarmless = lower.replace(HARMLESS_CODES, " ");

  const flags: ScamFlag[] = [];
  if (has(GIFT_CARD_SCAM, lower)) flags.push("GIFT_CARDS");
  if (has(OFF_PLATFORM_PAYMENT, lower)) flags.push("OFF_PLATFORM_PAYMENT");
  if (has(FINANCIAL_REQUEST, lower)) flags.push("FINANCIAL_REQUEST");
  if (has(CARD_NUMBER_RE, raw) || has(SSN_RE, raw)) flags.push("FINANCIAL_DATA");
  if (has(PASSWORD_REQUEST, withoutHarmless)) flags.push("PASSWORD_REQUEST");
  if (has(PASSWORD_DATA, withoutHarmless)) flags.push("PASSWORD_DATA");
  if (has(CONTACT_ASK, lower) || has(EMAIL_RE, raw) || (!flags.includes("FINANCIAL_DATA") && has(PHONE_RE, raw))) {
    flags.push("CONTACT_INFO");
  }

  if (flags.length === 0) return { action: "allow", flags, flagForAdmin: false };
  return sender === "worker" ? workerRule(flags) : customerRule(flags);
}

/** Workers asking for money or credentials = block + admin. Contact info = warn customer + admin. */
function workerRule(flags: ScamFlag[]): ScreenResult {
  const scam: ScamFlag[] = ["GIFT_CARDS", "OFF_PLATFORM_PAYMENT", "FINANCIAL_REQUEST", "FINANCIAL_DATA", "PASSWORD_REQUEST", "PASSWORD_DATA"];
  if (flags.some((f) => scam.includes(f))) {
    return { action: "block", flags, notice: NOTICES.workerBlocked, noticeFor: "sender", flagForAdmin: true };
  }
  return { action: "warn", flags, notice: NOTICES.contactTip, noticeFor: "customer", flagForAdmin: true };
}

/**
 * Customers sharing real card/SSN numbers or passwords = block (protect them).
 * Off-app payment or gift card codes = tip + admin look (worker may have asked in person).
 * Contact info = tip only.
 */
function customerRule(flags: ScamFlag[]): ScreenResult {
  if (flags.includes("FINANCIAL_DATA") || flags.includes("PASSWORD_DATA")) {
    return { action: "block", flags, notice: NOTICES.customerBlocked, noticeFor: "sender", flagForAdmin: false };
  }
  if (flags.includes("OFF_PLATFORM_PAYMENT") || flags.includes("GIFT_CARDS")) {
    return { action: "warn", flags, notice: NOTICES.paymentTip, noticeFor: "sender", flagForAdmin: true };
  }
  if (flags.includes("CONTACT_INFO")) {
    return { action: "warn", flags, notice: NOTICES.contactTip, noticeFor: "sender", flagForAdmin: false };
  }
  // Card/password words alone ("I'll pay with my credit card in the app") are fine from a customer.
  return { action: "allow", flags, flagForAdmin: false };
}
