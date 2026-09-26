import { CATEGORY_LABELS, formatDate, formatTime, type ServiceRequestDraft } from "@/lib/types";
import BigButton from "./BigButton";

const REPEAT_LABELS = { WEEKLY: "Every week", BIWEEKLY: "Every other week" } as const;

export default function ConfirmationCard({
  draft,
  onConfirm,
  onEdit,
  submitting,
}: {
  draft: ServiceRequestDraft;
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
          value={draft.serviceCategoryId ? CATEGORY_LABELS[draft.serviceCategoryId] ?? "General Help" : "General Help"}
        />
        <Row label="Date" value={formatDate(draft.requestedDate)} />
        <Row
          label="Time"
          value={`${formatTime(draft.requestedStartTime)} to ${formatTime(
            draft.requestedEndTime
          )}`}
        />
        {draft.repeat && <Row label="Repeats" value={REPEAT_LABELS[draft.repeat]} />}
        <Row label="Location" value={draft.location || "-"} />
        <Row label="Details" value={draft.description || "-"} />
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
