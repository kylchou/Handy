import type { EmergencyGuidance, EmergencyKind, SafetyStatus } from "./types.js";

/**
 * Deterministic safety layer, runs before the model. Emergency detection never
 * depends on an API call. Model also classifies; stricter result wins.
 *
 * Biased toward false alarms on purpose: unneeded 911 advice is cheap, a gig
 * worker sent to a medical emergency is not.
 */

export type UnsupportedKind = "MEDICAL_CARE" | "FINANCIAL_ACCESS";

export interface SafetyCheck {
  status: SafetyStatus;
  message?: string;
  emergency?: EmergencyGuidance;
  unsupportedKind?: UnsupportedKind;
  /** The pattern that matched, for logs. */
  matched?: string;
}

const EMERGENCY_PATTERNS: Array<[EmergencyKind, RegExp]> = [
  ["SELF_HARM", /\b(kill|hurt|harm) (myself|himself|herself|themselves)\b/],
  ["SELF_HARM", /\bsuicid(e|al)\b/],
  ["SELF_HARM", /\bend (my|his|her|their) (own )?life\b/],
  ["SELF_HARM", /\b(want|wants|wanting) to die\b/],

  ["MEDICAL", /\b(collapsed|unconscious|unresponsive|passed out|fainted|blacked out)\b/],
  ["MEDICAL", /\b(isn't|is not|not|wasn't|won't|can't|cannot|stopped) (breathing|responding|waking up)\b/],
  ["MEDICAL", /\b(trouble|difficulty|hard time|can't|cannot) (breathing|breathe)\b/],
  ["MEDICAL", /\bchest pains?\b/],
  // Present tense only, so "had a stroke last year" in a companionship request isn't flagged.
  ["MEDICAL", /\bhaving an? (heart attack|stroke|seizure)\b/],
  ["MEDICAL", /\b(just|might have|may have|think (he|she|i|they)) had an? (heart attack|stroke|seizure)\b/],
  ["MEDICAL", /\b(choking|overdos(e|ed))\b/],
  ["MEDICAL", /\bbleeding (a lot|badly|heavily|won't stop|that won't stop)\b/],
  ["MEDICAL", /\b(fell|fallen|fall)( down)?( and| &)?( (i|he|she|they))? (can't|cannot|couldn't|can not) (get|stand) up\b/],
  ["MEDICAL", /\b(i|he|she|they|mom|dad|mother|father|husband|wife) (just )?(fell|has fallen|had a fall|took a fall)\b(?! (asleep|behind))/],
  ["MEDICAL", /\bhit (my|his|her|their) head\b/],
  ["MEDICAL", /\bmedical emergency\b/],

  ["FIRE_OR_GAS", /\b(on fire|is burning|fire in (the|my)|smoke (is )?(coming|pouring|filling))\b/],
  ["FIRE_OR_GAS", /\b(smell|smells|smelling) (of |like )?gas\b/],
  ["FIRE_OR_GAS", /\bgas leak\b/],
  ["FIRE_OR_GAS", /\bcarbon monoxide\b/],

  ["CRIME", /\b(someone|somebody|intruder|burglar|stranger) (is )?(breaking in|broke in|in my (house|home))\b/],
  ["CRIME", /\bintruder\b/],
  ["CRIME", /\b(being|been|was|got) (attacked|robbed|assaulted|mugged)\b/],

  ["GENERAL", /\bcall 911\b/],
  ["GENERAL", /\bemergency\b/],
];

/** Non-emergency phrases with emergency words ("emergency contact"). Stripped before matching. */
const EMERGENCY_FALSE_POSITIVES: RegExp[] = [
  /\b(it'?s |this is |it is )?(not|isn'?t|no) (an? )?(emergency|urgent)\b/g,
  /\bemergency (contact|contacts|number|kit|light|lights|fund|brake)\b/g,
  /\b(non-?emergency)\b/g,
];

const UNSUPPORTED_PATTERNS: Array<[UnsupportedKind, RegExp]> = [
  ["MEDICAL_CARE", /\b(give|giving|administer|inject)\b.{0,30}\b(medication|medicine|meds|insulin|injection|shot|pills)\b/],
  ["MEDICAL_CARE", /\b(medical|nursing) care\b/],
  ["MEDICAL_CARE", /\bwound care\b/],
  ["MEDICAL_CARE", /\b(change|changing|clean|cleaning) (my|his|her|their|the) (bandage|dressing|catheter|wound)\b/],
  ["MEDICAL_CARE", /\bdiagnos(e|is)\b/],
  ["MEDICAL_CARE", /\bi need (a )?(doctor|nurse)\b/],
  ["FINANCIAL_ACCESS", /\b(bank|banking|email|account) (password|login|pin)\b/],
  ["FINANCIAL_ACCESS", /\b(my|his|her) (password|pin number|social security number)\b/],
  ["FINANCIAL_ACCESS", /\bpower of attorney\b/],
  ["FINANCIAL_ACCESS", /\b(sign|write) (my |some )?checks\b/],
];

export const EMERGENCY_MESSAGES: Record<EmergencyKind, string> = {
  MEDICAL:
    "This sounds like it could be an emergency. Please call 911 right now. Our helpers can't handle emergencies, but I'm here for anything else once everyone is safe.",
  FIRE_OR_GAS:
    "Please get out of the house right away and call 911 from outside. If you smell gas, don't use light switches or anything that could make a spark.",
  CRIME:
    "If you are in danger, please call 911 right now. Get to a safe place and lock a door between you and the danger if you can.",
  SELF_HARM:
    "I'm really sorry you're feeling this way, and I'm glad you said something. Please call or text 988 to talk with someone right now. If you are in immediate danger, call 911.",
  GENERAL:
    "If this is an emergency, please call 911 right now. Our helpers can't handle emergencies, but I'm here for anything else once everyone is safe.",
};

export const UNSUPPORTED_MESSAGES: Record<UnsupportedKind, string> = {
  MEDICAL_CARE:
    "I'm sorry, our helpers can't give medical care like medicines, shots, or wound care. Your doctor or a home health nurse can help with that. I can still find someone to drive you to an appointment or pick up a prescription.",
  FINANCIAL_ACCESS:
    "For your safety, our helpers can't use your bank accounts or passwords or sign money matters for you. A trusted family member or your bank can help with that. Is there something else I can help with?",
};

export function callNumberFor(kind: EmergencyKind): EmergencyGuidance["callNumber"] {
  return kind === "SELF_HARM" ? "988" : "911";
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function classifySafety(text: string): SafetyCheck {
  const normalized = normalize(text);

  let emergencyText = normalized;
  for (const pattern of EMERGENCY_FALSE_POSITIVES) emergencyText = emergencyText.replace(pattern, " ");

  for (const [kind, pattern] of EMERGENCY_PATTERNS) {
    if (pattern.test(emergencyText)) {
      return {
        status: "POTENTIAL_EMERGENCY",
        message: EMERGENCY_MESSAGES[kind],
        emergency: { kind, callNumber: callNumberFor(kind) },
        matched: pattern.source,
      };
    }
  }

  for (const [kind, pattern] of UNSUPPORTED_PATTERNS) {
    if (pattern.test(normalized)) {
      return {
        status: "UNSUPPORTED_SERVICE",
        message: UNSUPPORTED_MESSAGES[kind],
        unsupportedKind: kind,
        matched: pattern.source,
      };
    }
  }

  return { status: "NORMAL_SERVICE" };
}

const SEVERITY: Record<SafetyStatus, number> = {
  NORMAL_SERVICE: 0,
  NEEDS_CLARIFICATION: 1,
  UNSUPPORTED_SERVICE: 2,
  POTENTIAL_EMERGENCY: 3,
};

export function stricterSafety(a: SafetyStatus, b: SafetyStatus): SafetyStatus {
  return SEVERITY[a] >= SEVERITY[b] ? a : b;
}
