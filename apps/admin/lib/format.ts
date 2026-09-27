export const CATEGORY_LABELS: Record<string, string> = {
  HOME_MAINTENANCE: "Home Maintenance",
  CLEANING: "Cleaning",
  LAWN_CARE: "Lawn Care",
  ERRANDS: "Errands",
  TRANSPORTATION: "Transportation",
  PET_ASSISTANCE: "Pet Assistance",
  TECH_SUPPORT: "Tech Support",
  COMPANIONSHIP: "Companionship",
  MOVING_ASSISTANCE: "Moving Help",
};

/** "2026-09-27", "14:00" -> "Sep 27, 2:00 PM" */
export function formatWhen(date: string, time?: string) {
  const d = new Date(`${date}T${time ?? "00:00"}:00`);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", ...(time && { hour: "numeric", minute: "2-digit" }) });
}

/** ISO timestamp -> "5 min ago", "3 hr ago", "Sep 24" */
export function ago(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 24 * 60) return `${Math.round(mins / 60)} hr ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Color for a status pill. */
export function tone(status: string): "green" | "amber" | "red" | "gray" | "blue" {
  if (["COMPLETED", "VERIFIED", "AVAILABLE"].includes(status)) return "green";
  if (["SEARCHING", "PENDING", "UNVERIFIED", "BUSY"].includes(status)) return "amber";
  if (["CANCELLED", "EXPIRED", "REJECTED"].includes(status)) return "red";
  if (["ACCEPTED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS", "MATCHED"].includes(status)) return "blue";
  return "gray";
}

export const STATUS_TEXT: Record<string, string> = {
  SEARCHING: "Searching",
  MATCHED: "Matched",
  ACCEPTED: "Accepted",
  EN_ROUTE: "On the way",
  ARRIVED: "Arrived",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
  VERIFIED: "Verified",
  PENDING: "Pending",
  UNVERIFIED: "Unverified",
  REJECTED: "Rejected",
  AVAILABLE: "Available",
  BUSY: "Busy",
  OFFLINE: "Offline",
};
