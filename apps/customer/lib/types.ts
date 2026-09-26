/**
 * Every type the app uses comes from @handy/contracts, the same package the
 * backend uses, so the two can't drift apart. This file just re-exports
 * them so components can keep importing from "@/lib/types".
 */
export type {
  AccessibilityPreferences,
  ConversationDTO,
  ConversationDetailResponse,
  ConversationSummaryDTO,
  CustomerHistoryItemDTO,
  CustomerProfileDTO,
  JobDetailDTO,
  JobMessageDTO,
  JobStatus,
  SafetyStatus,
  SenderType,
  ServiceCategoryCode,
  ServiceRequestDTO,
  ServiceRequestDraft,
  TextSize,
  UserDTO,
  WorkerPublicDTO,
} from "@handy/contracts";

export const CATEGORY_LABELS: Record<string, string> = {
  HOME_MAINTENANCE: "Home Maintenance",
  CLEANING: "Cleaning",
  LAWN_CARE: "Lawn Care",
  ERRANDS: "Errand",
  TRANSPORTATION: "Transportation",
  PET_ASSISTANCE: "Pet Assistance",
  TECH_SUPPORT: "Tech Support",
  COMPANIONSHIP: "Companionship",
  MOVING_ASSISTANCE: "Moving Assistance",
};

/** "2026-09-27" -> "Sunday, September 27" */
export function formatDate(iso?: string | null) {
  if (!iso) return "-";
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

/** "14:00" -> "2:00 PM" */
export function formatTime(t?: string | null) {
  if (!t) return "-";
  const [h = 0, m = 0] = t.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

/** 2500 -> "$25.00" */
export function formatPrice(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}
