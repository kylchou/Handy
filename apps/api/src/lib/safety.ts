import type { EmergencyGuidance } from "@handy/contracts";

/**
 * Deterministic emergency screen. Runs on every customer message and on every
 * request submission, regardless of what the AI service says, so a possible
 * emergency never becomes a marketplace job.
 */
const EMERGENCY_PATTERNS: RegExp[] = [
  /\bcollapsed?\b/i,
  /\b(not|isn'?t|is not|stopped|can'?t|cannot) (breathing|breathe)\b/i,
  /\b(unconscious|unresponsive|passed out|fainted)\b/i,
  /\b(not|isn'?t|is not|won'?t) (responding|waking up|wake up)\b/i,
  /\bchest pains?\b/i,
  /\bheart attack\b/i,
  /\bstroke\b/i,
  /\bseizure\b/i,
  /\bchoking\b/i,
  /\boverdos(e|ed)\b/i,
  /\bbleeding (a lot|badly|heavily|won'?t stop)\b/i,
  /\b(fell|fallen|fall) (down )?and (can'?t|cannot) get up\b/i,
  /\b(kill|hurt|harm) (myself|himself|herself|themselves)\b/i,
  /\bsuicid(e|al)\b/i,
  /\bmedical emergency\b/i,
  /\bgas leak\b/i,
  /\b(house|kitchen|room|apartment|home) (is )?on fire\b/i,
  /\bcall (911|an ambulance)\b/i,
  /\bambulance\b/i,
];

export function detectEmergency(text: string): boolean {
  return EMERGENCY_PATTERNS.some((p) => p.test(text));
}

export const EMERGENCY_GUIDANCE: EmergencyGuidance = {
  callNumber: "911",
  message:
    "This sounds like it could be an emergency. Please call 911 right now. " +
    "Our helpers are not emergency or medical responders, so I can't send someone for this.",
};
