import { CATEGORY_INFO, SERVICE_CATEGORIES, type ServiceCategoryCode } from "./categories.js";
import { has, scrubPrivate } from "./patterns.js";

/**
 * What a worker sees about a job. Deterministic, no model call.
 * Before accept: area only, no customer name, no health details.
 * After accept: full address, first name, all notes.
 * Phone numbers, emails, access codes, card numbers: never shown (chat is in-app, codes shared in chat).
 */

export interface WorkerCardInput {
  /** Category code, e.g. "MOVING_ASSISTANCE". */
  serviceCategoryId: string;
  description: string;
  /** Full address. */
  location: string;
  /** YYYY-MM-DD */
  requestedDate: string;
  /** HH:MM, 24-hour */
  requestedStartTime: string;
  /** HH:MM, 24-hour */
  requestedEndTime?: string;
  specialRequirements?: string[];
  customerFirstName?: string;
  /** From matching, e.g. WorkerMatch.distance. */
  distanceMiles?: number;
  /** Worker pay, e.g. estimatePrice(...).servicePrice. */
  estimatedPay?: number;
}

export interface WorkerJobCard {
  /** "Moving help" */
  title: string;
  /** Description with private info hidden. */
  summary: string;
  /** "Sat, Sep 26 · 3–4 PM" */
  when: string;
  /** Before accept: "Atlanta, GA 30303" or "Address shared after you accept". After: full address. */
  location: string;
  /** "2.4 miles away" */
  distance?: string;
  /** "$35" */
  pay?: string;
  /** Things to know, e.g. "Customer cannot use a ladder". */
  notes: string[];
  /** After accept only. */
  customerFirstName?: string;
}

/** Diagnoses, conditions, medications. Job-relevant needs (ladder, wheelchair, lifting) stay visible. */
const HEALTH_DETAIL =
  /\b(diabet\w*|dementia|alzheimer'?s|cancer|chemo\w*|surgery|stroke|heart (condition|problem|disease)|dialysis|parkinson'?s|medication|meds|insulin|pregnan\w*|depress\w*|anxiety|mental health|hospital\w*|memory (loss|problems?)|hiv|oxygen)\b/i;

const ADDRESS_AFTER_ACCEPT = "Address shared after you accept";

export function toWorkerJobCard(input: WorkerCardInput, options: { accepted?: boolean } = {}): WorkerJobCard {
  const accepted = options.accepted ?? false;
  const scrub = (text: string) => scrubPrivate(text, { keepAddress: accepted }).trim();

  const notes = (input.specialRequirements ?? [])
    .filter((note) => accepted || !has(HEALTH_DETAIL, note))
    .map(scrub)
    .filter(Boolean);
  const hidHealthNote = !accepted && notes.length < (input.specialRequirements ?? []).filter((n) => n.trim()).length;
  if (hidHealthNote) notes.push("A few personal details are shared after you accept");

  const card: WorkerJobCard = {
    title: isCategory(input.serviceCategoryId) ? CATEGORY_INFO[input.serviceCategoryId].label : "Service request",
    summary: scrub(input.description),
    when: formatWhen(input.requestedDate, input.requestedStartTime, input.requestedEndTime),
    location: accepted ? input.location.trim() : areaOf(input.location) ?? ADDRESS_AFTER_ACCEPT,
    notes,
  };
  if (input.distanceMiles !== undefined) card.distance = formatDistance(input.distanceMiles);
  if (input.estimatedPay !== undefined) card.pay = `$${Math.round(input.estimatedPay)}`;
  if (accepted && input.customerFirstName) card.customerFirstName = input.customerFirstName;
  return card;
}

function isCategory(value: string): value is ServiceCategoryCode {
  return (SERVICE_CATEGORIES as readonly string[]).includes(value);
}

/** "123 Main St, Atlanta, GA 30303" → "Atlanta, GA 30303". Single-part address → undefined. */
export function areaOf(location: string): string | undefined {
  const parts = location.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return undefined;
  return parts.slice(1).join(", ");
}

function formatDistance(miles: number): string {
  const rounded = Math.round(miles * 10) / 10;
  return `${rounded} ${rounded === 1 ? "mile" : "miles"} away`;
}

/** "2026-09-26", "15:00", "16:00" → "Sat, Sep 26 · 3–4 PM". */
export function formatWhen(date: string, start: string, end?: string): string {
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(`${date}T00:00:00Z`));

  const s = clock(start);
  if (!end) return `${day} · ${s.text} ${s.meridiem}`;
  const e = clock(end);
  const range = s.meridiem === e.meridiem ? `${s.text}–${e.text} ${e.meridiem}` : `${s.text} ${s.meridiem}–${e.text} ${e.meridiem}`;
  return `${day} · ${range}`;
}

/** "15:30" → { text: "3:30", meridiem: "PM" } */
function clock(time: string): { text: string; meridiem: "AM" | "PM" } {
  const [h, m] = time.split(":").map(Number) as [number, number];
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return { text: m === 0 ? `${hour12}` : `${hour12}:${String(m).padStart(2, "0")}`, meridiem: h < 12 ? "AM" : "PM" };
}
