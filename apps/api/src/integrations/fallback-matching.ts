import {
  MATCH_WEIGHTS,
  type MatchingService,
  type QualificationLevel,
  type ServiceRequestDTO,
  type WorkerCandidate,
  type WorkerMatch,
} from "@handy/contracts";
import { distanceMiles } from "../lib/geo";
import { dayOfWeek, windowsOverlap } from "../lib/time";

const LEVEL_SCORE: Record<QualificationLevel, number> = { BASIC: 80, EXPERIENCED: 95, CERTIFIED: 100 };

/**
 * Deterministic matcher using the spec's weights (30% qualification, 25%
 * availability, 20% distance, 15% rating, 10% experience). Stand-in until
 * `@handy/matching` exists.
 *
 * Hard filters: qualified for the category, verified, not offline, within
 * service radius, has a schedule window on that day and no overlapping booking.
 */
export class FallbackMatchingService implements MatchingService {
  async findMatches(request: ServiceRequestDTO, candidates: WorkerCandidate[]): Promise<WorkerMatch[]> {
    const day = dayOfWeek(request.requestedDate);
    const start = request.requestedStartTime;
    const end = request.requestedEndTime;
    const matches: WorkerMatch[] = [];

    for (const c of candidates) {
      const qualification = c.qualifications.find((q) => q.serviceCategoryId === request.serviceCategoryId);
      if (!qualification || c.verificationStatus !== "VERIFIED" || c.availabilityStatus === "OFFLINE") continue;

      const distance = distanceMiles(c, request);
      if (distance != null && distance > c.serviceRadius) continue;

      const slots = c.weeklyAvailability.filter((s) => s.dayOfWeek === day && windowsOverlap(s.startTime, s.endTime, start, end));
      if (slots.length === 0) continue;
      const doubleBooked = c.bookedWindows.some((b) => b.date === request.requestedDate && windowsOverlap(b.startTime, b.endTime, start, end));
      if (doubleBooked) continue;
      const fullyCovered = slots.some((s) => s.startTime <= start && s.endTime >= end);

      const scores = {
        qualification: LEVEL_SCORE[qualification.qualificationLevel],
        availability: (fullyCovered ? 100 : 70) * (c.availabilityStatus === "BUSY" ? 0.7 : 1),
        distance: distance == null ? 50 : Math.max(0, 100 * (1 - distance / (c.serviceRadius * 1.25))),
        rating: c.ratingCount === 0 ? 70 : (c.rating / 5) * 100,
        experience: Math.min(100, 40 + c.completedJobsInCategory * 15 + c.completedJobs * 0.5),
      };
      const score =
        scores.qualification * MATCH_WEIGHTS.qualification +
        scores.availability * MATCH_WEIGHTS.availability +
        scores.distance * MATCH_WEIGHTS.distance +
        scores.rating * MATCH_WEIGHTS.rating +
        scores.experience * MATCH_WEIGHTS.experience;

      const reasons: string[] = [];
      if (distance != null) reasons.push(`${distance} miles away`);
      reasons.push(fullyCovered ? "Available at the requested time" : "Partly available at the requested time");
      if (qualification.qualificationLevel !== "BASIC") reasons.push("Experienced with this kind of job");
      if (c.ratingCount > 0) reasons.push(`${c.rating.toFixed(1)}-star rating`);
      if (c.completedJobsInCategory > 0) reasons.push(`${c.completedJobsInCategory} similar jobs completed`);

      matches.push({
        workerId: c.workerId,
        score: Math.round(score * 10) / 10,
        distance,
        qualificationMatch: true,
        availabilityMatch: fullyCovered,
        rating: c.rating,
        reasons,
      });
    }

    return matches.sort((a, b) => b.score - a.score || (a.distance ?? 999) - (b.distance ?? 999));
  }
}
