import type { QualificationLevel, ServiceCategoryCode } from "@handy/contracts";

/**
 * Special requirements → preferred qualification level.
 * Soft rule: worker below the level stays eligible, qualification score drops.
 * Only applies to categories where the need matters (lifting for moving, not for tech help).
 */
export interface RequirementRule {
  /** Short label for reasons, e.g. "heavy lifting". */
  label: string;
  pattern: RegExp;
  categories: ServiceCategoryCode[];
  minLevel: QualificationLevel;
}

export const REQUIREMENT_RULES: RequirementRule[] = [
  {
    label: "heavy lifting",
    pattern: /\b(lift\w*|heavy|carry\w*|couch|sofa|piano|dresser|furniture)\b/i,
    categories: ["MOVING_ASSISTANCE", "HOME_MAINTENANCE", "CLEANING", "ERRANDS"],
    minLevel: "EXPERIENCED",
  },
  {
    label: "mobility help",
    pattern: /\b(wheelchair|walker|cane|mobility|in and out of the car|into the car|help walking|unsteady|balance)\b/i,
    categories: ["TRANSPORTATION", "COMPANIONSHIP", "ERRANDS"],
    minLevel: "EXPERIENCED",
  },
  {
    label: "ladder work",
    pattern: /\b(ladder|roof|gutters?|high ceilings?)\b/i,
    categories: ["HOME_MAINTENANCE", "CLEANING"],
    minLevel: "EXPERIENCED",
  },
  {
    label: "memory loss",
    pattern: /\b(dementia|alzheimer'?s|memory|forgetful|confus\w*)\b/i,
    categories: ["COMPANIONSHIP", "TRANSPORTATION"],
    minLevel: "EXPERIENCED",
  },
];

/** Qualification points lost per unmet need. */
export const UNMET_NEED_PENALTY = 15;

const LEVEL_RANK: Record<QualificationLevel, number> = { BASIC: 0, EXPERIENCED: 1, CERTIFIED: 2 };

/** Rules triggered by the request's special requirements, for its category. No duplicates. */
export function needsFor(category: ServiceCategoryCode, specialRequirements: readonly string[] | undefined): RequirementRule[] {
  const text = (specialRequirements ?? []).join(" ");
  if (!text.trim()) return [];
  return REQUIREMENT_RULES.filter((rule) => rule.categories.includes(category) && rule.pattern.test(text));
}

/** Penalty + labels of needs this worker's level covers. */
export function requirementFit(level: QualificationLevel, needs: RequirementRule[]): { penalty: number; met: string[] } {
  let penalty = 0;
  const met: string[] = [];
  for (const need of needs) {
    if (LEVEL_RANK[level] >= LEVEL_RANK[need.minLevel]) met.push(need.label);
    else penalty += UNMET_NEED_PENALTY;
  }
  return { penalty, met };
}
