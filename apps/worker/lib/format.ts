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

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "2026-09-27" -> "Today", "Tomorrow", or "Mon, Sep 28" */
export function formatDay(iso: string) {
  const today = new Date();
  const toKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (iso === toKey(today)) return "Today";
  if (iso === toKey(tomorrow)) return "Tomorrow";
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/** "14:00" -> "2 PM", "14:30" -> "2:30 PM" */
export function formatTime(t: string) {
  const [h = 0, m = 0] = t.split(":").map(Number);
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h >= 12 ? "PM" : "AM"}`;
}

/** "3 PM" to "4 PM" -> "3-4 PM" when they share AM/PM */
export function formatWindow(start: string, end: string) {
  const a = formatTime(start);
  const b = formatTime(end);
  return a.slice(-2) === b.slice(-2) ? `${a.slice(0, -3)}-${b}` : `${a}-${b}`;
}

/** 2500 -> "$25", 2550 -> "$25.50" */
export function formatPay(cents: number) {
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}

export function formatMiles(miles: number | null) {
  return miles == null ? null : `${miles.toFixed(1)} miles away`;
}

export const STATUS_LABELS: Record<string, string> = {
  ACCEPTED: "Accepted",
  EN_ROUTE: "On the way",
  ARRIVED: "Arrived",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};
