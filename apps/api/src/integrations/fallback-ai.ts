import {
  REQUIRED_REQUEST_FIELDS,
  type AIConversationContext,
  type AIResponse,
  type AIService,
  type ServiceCategoryCode,
  type ServiceRequestDraft,
} from "@handy/contracts";
import { EMERGENCY_GUIDANCE, detectEmergency } from "../lib/safety";
import { addDays, addMinutes, dayOfWeek, formatTime12h } from "../lib/time";

/**
 * Rule-based stand-in for Aditya's (Engineer 3) LLM assistant. Good enough to drive the
 * demo flow and the API tests; replaced automatically once `@handy/ai` exists.
 */
export class FallbackAIService implements AIService {
  async processMessage(_conversationId: string, message: string, ctx: AIConversationContext): Promise<AIResponse> {
    const text = message.trim();
    const lower = text.toLowerCase();

    if (detectEmergency(text)) {
      return {
        message: EMERGENCY_GUIDANCE.message,
        extractedData: {},
        missingInformation: [],
        readyToSubmit: false,
        safetyStatus: "POTENTIAL_EMERGENCY",
      };
    }
    if (UNSUPPORTED.test(lower)) {
      return {
        message:
          "I'm sorry — our helpers can't provide medical or nursing care. For that, please contact your doctor. " +
          "I can help with everyday things like errands, rides, chores around the house, or a friendly visit.",
        extractedData: {},
        missingInformation: missing(ctx.currentDraft),
        readyToSubmit: false,
        safetyStatus: "UNSUPPORTED_SERVICE",
      };
    }

    const draft: ServiceRequestDraft = { ...ctx.currentDraft };
    const changed: ServiceRequestDraft = {};
    const set = <K extends keyof ServiceRequestDraft>(k: K, v: ServiceRequestDraft[K]) => {
      draft[k] = v;
      changed[k] = v;
    };
    const lastQuestion = [...ctx.history].reverse().find((h) => h.role === "assistant")?.content.toLowerCase() ?? "";

    const category = classify(lower);
    if (category && category !== draft.serviceCategoryId) {
      set("serviceCategoryId", category);
      set("description", summarize(text));
    } else if (!draft.description && category) {
      set("description", summarize(text));
    }

    // "Can James come back?" / "same person as last time"
    const past = ctx.pastWorkers ?? [];
    const named = past.find((w) => new RegExp(`\\b${w.firstName.replace(/[^a-z]/gi, "")}\\b`, "i").test(text));
    // Without a name, only clearly generic phrases count; "Can Tom come back?" must never pick someone else.
    const wantsSame = /\b(same (person|helper|one|guy|lady)|(like|as) last time)\b/.test(lower);
    const pick = named ?? (wantsSame ? past[0] : undefined);
    if (pick && pick.workerId !== draft.preferredWorkerId) {
      set("preferredWorkerId", pick.workerId);
      if (!draft.serviceCategoryId) set("serviceCategoryId", pick.lastServiceCategoryId);
      if (!draft.description) set("description", `Help from ${pick.firstName} again`);
    }

    const date = parseDate(lower, ctx.today);
    if (date) set("requestedDate", date);

    const window = parseTime(lower, lastQuestion.includes("what time"));
    if (window) {
      set("requestedStartTime", window[0]);
      set("requestedEndTime", window[1]);
    }

    // Only treat a free-text answer as the address if it didn't answer something else.
    const answeredOther = Boolean(date || window || category);
    const location = parseLocation(text, lower, ctx.customer.homeAddress, lastQuestion.includes("where") && !answeredOther);
    if (location) set("location", location);

    const reqs = parseSpecialRequirements(lower);
    if (reqs.length) set("specialRequirements", [...new Set([...(draft.specialRequirements ?? []), ...reqs])]);
    if (/\b(urgent|asap|right away|as soon as possible|immediately)\b/.test(lower)) set("urgency", "HIGH");
    if (!draft.urgency) set("urgency", "NORMAL");

    const missingInformation = missing(draft);
    const readyToSubmit = missingInformation.length === 0;

    if (!draft.serviceCategoryId) {
      return {
        message: "I'd be happy to help. Could you tell me a little more about what you need help with?",
        extractedData: changed,
        missingInformation,
        readyToSubmit: false,
        safetyStatus: "NEEDS_CLARIFICATION",
      };
    }

    let reply: string;
    const preferredName = past.find((w) => w.workerId === draft.preferredWorkerId)?.firstName;
    const categoryName = ctx.serviceCategories.find((c) => c.id === draft.serviceCategoryId)?.name.toLowerCase() ?? "that";
    if (readyToSubmit) {
      const wasReady = missing(ctx.currentDraft).length === 0;
      if (wasReady && Object.keys(changed).length === 0 && /^(yes|yeah|yep|sure|ok(ay)?|correct|that'?s right|sounds good)\b/.test(lower)) {
        reply = "Wonderful. Please tap \"Confirm Request\" and I'll start looking for someone right away.";
      } else {
        reply =
          `Here's what I have: ${categoryName} on ${friendlyDate(draft.requestedDate!, ctx.today)} ` +
          `around ${formatTime12h(draft.requestedStartTime!)} at ${draft.location}. ` +
          `Details: ${draft.description}.` +
          (preferredName ? ` I'll ask ${preferredName} first.` : "") +
          " Would you like me to find someone?";
      }
    } else {
      const next = missingInformation[0];
      const ack = changed.preferredWorkerId
        ? `Of course, I'll ask ${preferredName} first. `
        : Object.keys(changed).length > 1
          ? "Got it. "
          : "";
      if (next === "requestedDate") reply = `${ack}I can help with ${categoryName}. What day would you like someone to come?`;
      else if (next === "requestedStartTime") reply = `${ack}What time would work best for you?`;
      else if (next === "location")
        reply = ctx.customer.homeAddress
          ? `${ack}Where should they go? Is it at your home, ${ctx.customer.homeAddress}?`
          : `${ack}Where should they go? Please tell me the address.`;
      else reply = `${ack}Could you tell me a little more about what you need?`;
    }

    return {
      message: reply,
      extractedData: changed,
      missingInformation,
      readyToSubmit,
      safetyStatus: "NORMAL_SERVICE",
    };
  }
}

const UNSUPPORTED = /\b(nurse|nursing care|give me (my )?(shots?|injections?)|administer (my )?medication|insulin shot|bathe me|medical care|diagnos)/;

const CATEGORY_KEYWORDS: Array<[ServiceCategoryCode, RegExp]> = [
  ["PET_ASSISTANCE", /\b(dog|dogs|cat|cats|pet|pets|puppy|kitten|vet)\b/g],
  ["TRANSPORTATION", /\b(drive me|ride|airport|take me|lift to|doctor'?s appointment|appointment|drop me off)\b/g],
  ["ERRANDS", /\b(grocer\w*|pharmacy|prescription|pick up|pickup|package|return|shopping|store|errand\w*|mail|kroger|publix)\b/g],
  ["TECH_SUPPORT", /\b(computer|laptop|phone|iphone|ipad|tablet|wi-?fi|internet|tv|television|email|printer|password|zoom)\b/g],
  ["LAWN_CARE", /\b(lawn|mow\w*|grass|yard|weeds?|leaves|rake|hedges?|garden\w*)\b/g],
  ["CLEANING", /\b(clean\w*|vacuum\w*|dust\w*|mop\w*|tidy|laundry)\b/g],
  ["MOVING_ASSISTANCE", /\b(move|moving|couch|sofa|furniture|heavy|boxes|carry|lift)\b/g],
  ["HOME_MAINTENANCE", /\b(light|bulb|fixture|leak\w*|sink|faucet|toilet|repair|fix|broken|washing machine|washer|dryer|appliance|assemble|shelf|door|porch|plumb\w*|drain|ladder)\b/g],
  ["COMPANIONSHIP", /\b(company|lonely|visit|check on|chat|companion\w*|talk to)\b/g],
];

function classify(lower: string): ServiceCategoryCode | null {
  let best: ServiceCategoryCode | null = null;
  let bestHits = 0;
  for (const [code, re] of CATEGORY_KEYWORDS) {
    const hits = lower.match(re)?.length ?? 0;
    if (hits > bestHits) {
      best = code;
      bestHits = hits;
    }
  }
  return best;
}

function summarize(text: string): string {
  const s = text.replace(/\s+/g, " ").trim();
  return s.length > 200 ? `${s.slice(0, 197)}...` : s;
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function parseDate(lower: string, today: string): string | null {
  if (/\btoday\b|\btonight\b|\bthis (afternoon|morning|evening)\b/.test(lower)) return today;
  if (/\btomorrow\b/.test(lower)) return addDays(today, 1);
  const wd = lower.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (wd) {
    const target = WEEKDAYS.indexOf(wd[1]!);
    const diff = (target - dayOfWeek(today) + 7) % 7 || 7;
    return addDays(today, diff);
  }
  const md = lower.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(st|nd|rd|th)?\b/);
  const numeric = lower.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  let month: number | null = null;
  let day: number | null = null;
  if (md) {
    month = MONTHS.indexOf(md[1]!) + 1;
    day = Number(md[2]);
  } else if (numeric) {
    month = Number(numeric[1]);
    day = Number(numeric[2]);
  }
  if (month && day && month <= 12 && day <= 31) {
    let year = Number(today.slice(0, 4));
    let candidate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (candidate < today) candidate = `${++year}${candidate.slice(4)}`;
    return candidate;
  }
  return null;
}

function parseTime(lower: string, askedForTime: boolean): [string, string] | null {
  const explicit =
    lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)/) ??
    lower.match(/\b(?:at|around|about|by|after|before)\s+(\d{1,2})(?::(\d{2}))?\b(?!\s*(?:st|nd|rd|th|\/|miles?))/) ??
    lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*o'?clock\b/) ??
    (askedForTime ? lower.match(/^\s*(?:around\s+)?(\d{1,2})(?::(\d{2}))?\s*\.?\s*$/) : null);
  if (explicit) {
    let hour = Number(explicit[1]);
    const minute = Number(explicit[2] ?? 0);
    const meridiem = explicit[3]?.replace(/\./g, "");
    if (hour > 23 || minute > 59) return null;
    if (meridiem === "pm" && hour < 12) hour += 12;
    else if (meridiem === "am" && hour === 12) hour = 0;
    else if (!meridiem && hour >= 1 && hour <= 7) hour += 12; // "around 3" means 3 PM
    const start = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    return [start, addMinutes(start, 60)];
  }
  if (/\bmorning\b/.test(lower)) return ["09:00", "11:00"];
  if (/\b(noon|midday|lunch ?time)\b/.test(lower)) return ["12:00", "13:00"];
  if (/\bafternoon\b/.test(lower)) return ["14:00", "16:00"];
  if (/\b(evening|tonight)\b/.test(lower)) return ["17:00", "19:00"];
  return null;
}

const ADDRESS = /\b\d{1,6}\s+[a-z0-9.' ]+\b(street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|way|court|ct|place|pl|circle|cir|parkway|pkwy)\b.*$/i;

function parseLocation(text: string, lower: string, home: string | null, askedWhere: boolean): string | null {
  const address = text.match(ADDRESS);
  if (address) return address[0].trim().replace(/[.!]+$/, "");
  const homeRef = /\b(my (home|house|place|apartment)|at home|here|your home)\b/.test(lower);
  const affirmative = /^(yes|yeah|yep|sure|ok(ay)?|correct|that'?s right)\b/.test(lower);
  if (home && (homeRef || (askedWhere && affirmative))) return home;
  if (askedWhere && !affirmative && text.length <= 200 && !/\?$/.test(text)) return text.replace(/[.!]+$/, "");
  return null;
}

function parseSpecialRequirements(lower: string): string[] {
  const out: string[] = [];
  if (/ladder/.test(lower)) out.push("Customer cannot safely use a ladder");
  if (/\b(heavy|couch|sofa|piano|dresser)\b/.test(lower)) out.push("Requires lifting assistance");
  if (/wheelchair/.test(lower)) out.push("Customer uses a wheelchair");
  if (/walker|cane/.test(lower)) out.push("Customer uses a mobility aid");
  if (/hard of hearing|can'?t hear well/.test(lower)) out.push("Customer is hard of hearing");
  return out;
}

function missing(draft: ServiceRequestDraft): string[] {
  return REQUIRED_REQUEST_FIELDS.filter((f) => draft[f] == null || draft[f] === "");
}

function friendlyDate(date: string, today: string): string {
  if (date === today) return "today";
  if (date === addDays(today, 1)) return "tomorrow";
  const d = new Date(`${date}T12:00:00Z`);
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
}
