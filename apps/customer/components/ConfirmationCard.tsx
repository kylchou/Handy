"use client";

import { useEffect, useState } from "react";
import type { PriceQuoteDTO } from "@handy/contracts";
import { CATEGORY_LABELS, formatDate, formatPrice, formatTime, type ServiceRequestDraft } from "@/lib/types";
import BigButton from "./BigButton";

const REPEAT_LABELS = { WEEKLY: "Every week", BIWEEKLY: "Every other week" } as const;

/**
 * The summary the customer confirms before anything is sent: what, when,
 * where, and how much. Confirm only works once they've ticked that they
 * agree to the total, so nobody pays something they didn't see.
 */
export default function ConfirmationCard({
  draft,
  priceQuote,
  onConfirm,
  onEdit,
  submitting,
}: {
  draft: ServiceRequestDraft;
  priceQuote: PriceQuoteDTO | null;
  onConfirm: (agreedTotalCents: number) => void;
  onEdit: () => void;
  submitting?: boolean;
}) {
  const [agreed, setAgreed] = useState(false);
  const total = priceQuote?.totalCents;
  const service = draft.serviceCategoryId ? CATEGORY_LABELS[draft.serviceCategoryId] ?? "General Help" : "General Help";

  // If the price changes, they have to agree again.
  useEffect(() => setAgreed(false), [total]);

  return (
    <div className="rounded-card border-2 border-accent bg-accent-light p-6 shadow-soft">
      <h2 className="mb-4 text-xl font-bold text-ink">Here's what I have</h2>
      <dl className="space-y-3 text-lg">
        <Row label="Service" value={service} />
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

      <section aria-label="Cost" className="mt-5 rounded-control border border-line bg-white p-4">
        <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-soft">Cost{draft.repeat && " per visit"}</h3>
        {priceQuote ? (
          <>
            <dl className="space-y-1 text-lg">
              <PriceRow label={service} cents={priceQuote.servicePriceCents - priceQuote.urgentSurchargeCents} />
              {priceQuote.urgentSurchargeCents > 0 && <PriceRow label="Urgent request" cents={priceQuote.urgentSurchargeCents} />}
              <PriceRow label="Handy fee" cents={priceQuote.platformFeeCents} />
            </dl>
            <div className="mt-2 flex items-baseline justify-between border-t border-line pt-2">
              <span className="text-xl font-bold text-ink">Total</span>
              <span className="text-2xl font-bold text-ink">{formatPrice(priceQuote.totalCents)}</span>
            </div>
            <p className="mt-3 text-ink-soft">
              <strong className="text-ink">How you'll pay:</strong> through Handy, only once the job is done, so there's no cash to hand
              over.
            </p>
            <p className="mt-1 text-sm text-ink-soft">This is a demo, so no real card is charged.</p>
          </>
        ) : (
          <p className="text-ink-soft">We'll show the price as soon as we know what kind of help you need.</p>
        )}
      </section>

      {priceQuote && (
        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-control border-2 border-line bg-white p-4 text-lg text-ink">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1 h-6 w-6 shrink-0 accent-accent" />
          <span>
            The details look right, and I agree to pay <strong>{formatPrice(priceQuote.totalCents)}</strong>
            {draft.repeat && " for each visit"}.
          </span>
        </label>
      )}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <BigButton onClick={() => priceQuote && onConfirm(priceQuote.totalCents)} disabled={submitting || !priceQuote || !agreed}>
          {submitting ? "Finding someone…" : "Confirm Request"}
        </BigButton>
        <BigButton variant="secondary" onClick={onEdit} disabled={submitting}>
          Edit
        </BigButton>
      </div>
      {priceQuote && !agreed && !submitting && <p className="mt-2 text-center text-ink-soft">Tick the box above to confirm.</p>}
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

function PriceRow({ label, cents }: { label: string; cents: number }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink">{label}</dt>
      <dd className="text-ink">{formatPrice(cents)}</dd>
    </div>
  );
}
