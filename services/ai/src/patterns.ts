/** Shared privacy patterns for chat screening + worker cards. */

export const PHONE_RE = /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g;
export const EMAIL_RE = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g;
/** 13–16 digits, spaces/dashes allowed. */
export const CARD_NUMBER_RE = /\b(?:\d[ -]?){12,15}\d\b/g;
export const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/g;
/** "gate code 4821", "lockbox: 1234", "door code is #5555". */
export const ACCESS_CODE_RE = /\b(gate|door|garage|lockbox|building|entry|alarm|key ?pad)( code| combo| combination)?( is)?:? ?#?\d{3,8}\b/gi;
/** "123 Main Street", "45 Oak Ave." Up to 3 words between number and street type, so "3 bags on the way" isn't caught. */
export const STREET_ADDRESS_RE =
  /\b\d{1,6} (?:[a-z0-9.']+ ){1,3}(street|st|avenue|ave|road|rd|drive|dr|lane|ln|court|ct|boulevard|blvd|place|pl|circle|cir|parkway|pkwy|terrace|ter|highway|hwy)\b\.?/gi;

/** Match check that ignores the g flag's lastIndex state. */
export function has(pattern: RegExp, text: string): boolean {
  return text.search(pattern) >= 0;
}

/** Lowercase, straight apostrophes, single spaces. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Replace phone numbers, emails, access codes, card/SSN numbers. Addresses too unless keepAddress. */
export function scrubPrivate(text: string, options: { keepAddress?: boolean } = {}): string {
  let out = text
    .replace(CARD_NUMBER_RE, "[number hidden]")
    .replace(SSN_RE, "[number hidden]")
    .replace(PHONE_RE, "[phone hidden]")
    .replace(EMAIL_RE, "[email hidden]")
    .replace(ACCESS_CODE_RE, (_m, place: string) => `${place} code [hidden]`);
  if (!options.keepAddress) out = out.replace(STREET_ADDRESS_RE, "[address hidden]");
  return out;
}
