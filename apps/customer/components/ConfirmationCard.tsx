"use client";

import { useEffect, useState } from "react";
import type { PriceQuoteDTO } from "@handy/contracts";
import { CATEGORY_LABELS, formatDate, formatPrice, formatTime, type ServiceRequestDraft } from "@/lib/types";
import BigButton from "./BigButton";

const REPEAT_LABELS = { WEEKLY: "Every week", BIWEEKLY: "Every other week" } as const;
const PRESETS = [10, 15, 20] as const;
const MAX_TIP_CENTS = 50000;

type TipChoice = "none" | "custom" | (typeof PRESETS)[number];

/** A percent of the order, in whole cents. */
const percentOf = (cents: number, percent: number) => Math.round((cents * percent) / 100);

/**
 * The summary the customer confirms before anything is sent: what, when,
 * where, the tip, and how much. Confirm only works once they've ticked that
 * they agree to the total, so nobody pays something they didn't see.
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
  onConfirm: (agreedTotalCents: number, tipCents: number) => void;
  onEdit: () => void;
  submitting?: boolean;
}) {
  const [agreed, setAgreed] = useState(false);
  const [tipChoice, setTipChoice] = useState<TipChoice>("none");
  const [customMode, setCustomMode] = useState<"percent" | "dollars">("percent");
  const [customValue, setCustomValue] = useState("");
  const service = draft.serviceCategoryId ? CATEGORY_LABELS[draft.serviceCategoryId] ?? "General Help" : "General Help";

  const orderCents = priceQuote?.totalCents ?? 0;
  const custom = parseCustomTip(customValue, customMode, orderCents);
  const tipCents = tipChoice === "none" ? 0 : tipChoice === "custom" ? custom.cents ?? 0 : percentOf(orderCents, tipChoice);
  const totalCents = orderCents + tipCents;
  const tipInvalid = tipChoice === "custom" && custom.error !== null;

  // If the total changes (a new price, or a different tip), they have to agree again.
  useEffect(() => setAgreed(false), [totalCents]);

  const tipButton = (selected: boolean) =>
    `rounded-control border-2 px-3 py-3 text-lg font-bold ${selected ? "border-accent bg-accent text-white" : "border-line bg-white text-ink hover:border-accent"}`;

  return (
    <div className="rounded-card border-2 border-accent bg-accent-light p-6 shadow-soft">
      <h2 className="mb-4 text-xl font-bold text-ink">Here's what I have</h2>
      <dl className="space-y-3 text-lg">
        <Row label="Service" value={service} />
        <Row label="Date" value={formatDate(draft.requestedDate)} />
        <Row label="Time" value={`${formatTime(draft.requestedStartTime)} to ${formatTime(draft.requestedEndTime)}`} />
        {draft.repeat && <Row label="Repeats" value={REPEAT_LABELS[draft.repeat]} />}
        <Row label="Location" value={draft.location || "-"} />
        <Row label="Details" value={draft.description || "-"} />
      </dl>

      {priceQuote && (
        <section aria-label="Tip" className="mt-5 rounded-control border border-line bg-white p-4">
          <h3 className="text-sm font-bold uppercase tracking-wide text-ink-soft">Add a tip for your helper</h3>
          <p className="mb-3 text-ink-soft">All of the tip goes to them.</p>
          <div className="grid grid-cols-3 gap-2">
            {PRESETS.map((p) => (
              <button key={p} type="button" aria-pressed={tipChoice === p} onClick={() => setTipChoice(p)} className={tipButton(tipChoice === p)}>
                {p}%
                <span className="block text-base font-normal">{formatPrice(percentOf(orderCents, p))}</span>
              </button>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" aria-pressed={tipChoice === "custom"} onClick={() => setTipChoice("custom")} className={tipButton(tipChoice === "custom")}>
              Custom tip
            </button>
            <button type="button" aria-pressed={tipChoice === "none"} onClick={() => setTipChoice("none")} className={tipButton(tipChoice === "none")}>
              No tip
            </button>
          </div>

          {tipChoice === "custom" && (
            <div className="mt-3">
              <div className="mb-2 flex gap-2" role="group" aria-label="Custom tip as">
                {(["percent", "dollars"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={customMode === mode}
                    onClick={() => setCustomMode(mode)}
                    className={`rounded-full px-4 py-1.5 font-bold ${customMode === mode ? "bg-accent text-white" : "bg-paper text-ink"}`}
                  >
                    {mode === "percent" ? "Percent (%)" : "Dollars ($)"}
                  </button>
                ))}
              </div>
              <label htmlFor="custom-tip" className="sr-only">
                {customMode === "percent" ? "Tip percent" : "Tip in dollars"}
              </label>
              <div className="flex items-center gap-2">
                {customMode === "dollars" && <span className="text-xl font-bold text-ink">$</span>}
                <input
                  id="custom-tip"
                  inputMode="decimal"
                  value={customValue}
                  onChange={(e) => setCustomValue(e.target.value.replace(/[^\d.]/g, ""))}
                  placeholder={customMode === "percent" ? "18" : "5.00"}
                  className="w-32 rounded-control border-2 border-field bg-white px-4 py-3 text-lg text-ink"
                />
                {customMode === "percent" && <span className="text-xl font-bold text-ink">%</span>}
                {custom.cents !== null && custom.error === null && <span className="text-lg text-ink-soft">= {formatPrice(custom.cents)}</span>}
              </div>
              {custom.error && customValue !== "" && <p className="mt-1 text-danger">{custom.error}</p>}
            </div>
          )}
        </section>
      )}

      <section aria-label="Cost" className="mt-4 rounded-control border border-line bg-white p-4">
        <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-soft">Cost{draft.repeat && " per visit"}</h3>
        {priceQuote ? (
          <>
            <dl className="space-y-1 text-lg">
              <PriceRow label={service} cents={priceQuote.servicePriceCents - priceQuote.urgentSurchargeCents} />
              {priceQuote.urgentSurchargeCents > 0 && <PriceRow label="Urgent request" cents={priceQuote.urgentSurchargeCents} />}
              <PriceRow label="Handy fee" cents={priceQuote.platformFeeCents} />
              {tipCents > 0 && <PriceRow label="Tip" cents={tipCents} />}
            </dl>
            <div className="mt-2 flex items-baseline justify-between border-t border-line pt-2">
              <span className="text-xl font-bold text-ink">Total</span>
              <span className="text-2xl font-bold text-ink">{formatPrice(totalCents)}</span>
            </div>
            <p className="mt-3 text-ink-soft">
              <strong className="text-ink">How you'll pay:</strong> through Handy, only once the job is done, so there's no cash to hand over.
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
            The details look right, and I agree to pay <strong>{formatPrice(totalCents)}</strong>
            {tipCents > 0 && <> (including a {formatPrice(tipCents)} tip)</>}
            {draft.repeat && " for each visit"}.
          </span>
        </label>
      )}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <BigButton onClick={() => priceQuote && onConfirm(totalCents, tipCents)} disabled={submitting || !priceQuote || !agreed || tipInvalid}>
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

/** Reads the custom tip box: a percent of the order, or a dollar amount. */
function parseCustomTip(value: string, mode: "percent" | "dollars", orderCents: number): { cents: number | null; error: string | null } {
  if (value.trim() === "") return { cents: null, error: "Enter a tip, or choose No tip." };
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return { cents: null, error: "That doesn't look like a number." };
  if (mode === "percent" && n > 100) return { cents: null, error: "Please keep the tip at 100% or less." };
  const cents = mode === "percent" ? percentOf(orderCents, n) : Math.round(n * 100);
  if (cents > MAX_TIP_CENTS) return { cents: null, error: "Tips can be up to $500." };
  return { cents, error: null };
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm font-bold uppercase tracking-wide text-ink-soft">{label}</dt>
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
