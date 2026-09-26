import type { ServiceRequestDTO } from "@/lib/types";
import BigButton from "./BigButton";

const CATEGORY_LABELS: Record<string, string> = {
  HOME_MAINTENANCE: "Home Maintenance",
  CLEANING: "Cleaning",
  LAWN_CARE: "Lawn Care",
  ERRANDS: "Errand",
  TRANSPORTATION: "Transportation",
  PET_ASSISTANCE: "Pet Assistance",
  TECH_SUPPORT: "Tech Support",
  COMPANIONSHIP: "Companionship",
  MOVING_ASSISTANCE: "Moving Assistance",
  PLUMBING: "Plumbing",
  OTHER: "General Help",
};

function formatDate(iso?: string) {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function formatTime(t?: string) {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

export default function ConfirmationCard({
  draft,
  onConfirm,
  onEdit,
  submitting,
}: {
  draft: Partial<ServiceRequestDTO>;
  onConfirm: () => void;
  onEdit: () => void;
  submitting?: boolean;
}) {
  return (
    <div className="rounded-card border-2 border-accent bg-accent-light p-6 shadow-soft">
      <h2 className="mb-4 text-xl font-bold text-ink">Here's what I have</h2>
      <dl className="space-y-3 text-lg">
        <Row
          label="Service"
          value={CATEGORY_LABELS[draft.serviceCategoryId ?? "OTHER"]}
        />
        <Row label="Date" value={formatDate(draft.requestedDate)} />
        <Row
          label="Time"
          value={`${formatTime(draft.requestedStartTime)} – ${formatTime(
            draft.requestedEndTime
          )}`}
        />
        <Row label="Location" value={draft.location || "—"} />
        <Row label="Details" value={draft.description || "—"} />
      </dl>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <BigButton onClick={onConfirm} disabled={submitting}>
          {submitting ? "Finding someone…" : "Confirm Request"}
        </BigButton>
        <BigButton variant="secondary" onClick={onEdit} disabled={submitting}>
          Edit
        </BigButton>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm font-bold uppercase tracking-wide text-ink-soft">
        {label}
      </dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}
