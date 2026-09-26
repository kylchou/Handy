import type { QualificationLevel, ScoreBreakdown } from "./types.js";

/** Spec weights. Must sum to 1. */
export const WEIGHTS: ScoreBreakdown = {
  qualification: 0.3,
  availability: 0.25,
  distance: 0.2,
  rating: 0.15,
  experience: 0.1,
};

const QUALIFICATION_SCORES: Record<QualificationLevel, number> = {
  BASIC: 70,
  INTERMEDIATE: 85,
  EXPERT: 100,
};

/** Unrated worker score, so new workers aren't buried. */
const UNRATED_SCORE = 80;

/** Distance score at radius edge (100 at the door). */
const DISTANCE_SCORE_AT_EDGE = 40;

/** How fast experience levels off. 34 similar jobs ≈ 90. */
const EXPERIENCE_SCALE = 15;

export function qualificationScore(level: QualificationLevel): number {
  return QUALIFICATION_SCORES[level];
}

export function distanceScore(distanceMiles: number, radiusMiles: number): number {
  if (radiusMiles <= 0) return distanceMiles === 0 ? 100 : 0;
  const fraction = Math.min(Math.max(distanceMiles / radiusMiles, 0), 1);
  return 100 - (100 - DISTANCE_SCORE_AT_EDGE) * fraction;
}

export function ratingScore(rating: number, completedJobs: number): number {
  if (completedJobs === 0 || rating <= 0) return UNRATED_SCORE;
  return (Math.min(rating, 5) / 5) * 100;
}

export function experienceScore(similarJobs: number): number {
  return 100 * (1 - Math.exp(-Math.max(similarJobs, 0) / EXPERIENCE_SCALE));
}

/** Weighted total, 0–100, one decimal. */
export function totalScore(breakdown: ScoreBreakdown): number {
  const total = (Object.keys(WEIGHTS) as Array<keyof ScoreBreakdown>).reduce(
    (sum, key) => sum + WEIGHTS[key] * breakdown[key],
    0,
  );
  return round1(total);
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
