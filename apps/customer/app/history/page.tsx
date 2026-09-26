"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import { api, friendlyError, useRequireLogin } from "@/lib/api";
import { CATEGORY_LABELS, formatDate, formatPrice, type CustomerHistoryItemDTO } from "@/lib/types";

const STATUS_LABELS: Record<string, string> = {
  SEARCHING: "Looking for someone",
  ACCEPTED: "Booked",
  EN_ROUTE: "On the way",
  ARRIVED: "Arrived",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  EXPIRED: "Nobody was available",
};

/** Where tapping a row goes: the live job, or the search screen while we're still looking. */
function linkFor(entry: CustomerHistoryItemDTO) {
  if (entry.jobId) return `/job/${entry.jobId}`;
  if (entry.requestStatus === "SEARCHING") return `/request/${entry.requestId}`;
  return null;
}

export default function HistoryPage() {
  useRequireLogin();
  const [entries, setEntries] = useState<CustomerHistoryItemDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.customers
      .history()
      .then(setEntries)
      .catch((err) => setError(friendlyError(err)));
  }, []);

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 pb-28 pt-8">
      <h1 className="mb-6 text-2xl font-bold text-ink">My Services</h1>

      {error && (
        <p role="alert" className="rounded-control bg-danger-light p-3 text-danger">
          {error}
        </p>
      )}

      {entries === null && !error && (
        <p className="text-lg text-ink-soft">Loading your services…</p>
      )}

      {entries?.length === 0 && (
        <p className="text-lg text-ink-soft">
          You haven't requested any services yet. Tap "Get Help" below to ask
          for something.
        </p>
      )}

      <ul className="space-y-4">
        {entries?.map((entry) => {
          const href = linkFor(entry);
          const status = STATUS_LABELS[entry.jobStatus ?? entry.requestStatus] ?? entry.requestStatus;
          const helper = entry.worker?.firstName;
          const card = (
            <>
              <p className="text-xl font-bold text-ink">
                {CATEGORY_LABELS[entry.serviceCategoryId] ?? entry.serviceName}
              </p>
              <p className="text-ink-soft">{status}</p>
              {entry.worker && <p className="text-ink-soft">{entry.worker.displayName}</p>}
              <p className="text-ink-soft">{formatDate(entry.requestedDate)}</p>
              <p className="mt-1 text-lg font-bold text-ink">{formatPrice(entry.priceCents)}</p>
              {entry.rating != null && <p className="text-warm">{"★".repeat(entry.rating)}</p>}
            </>
          );
          return (
            <li key={entry.requestId} className="rounded-card border border-line bg-white p-5 shadow-soft">
              {href ? <Link href={href}>{card}</Link> : card}
              {entry.jobStatus === "COMPLETED" && helper && (entry.rating ?? 5) > 2 && (
                <Link
                  href={`/chat?message=${encodeURIComponent(`Can ${helper} come back and help me again?`)}`}
                  className="tap-target mt-3 block rounded-control border-2 border-accent px-4 py-3 text-center text-lg font-bold text-accent"
                >
                  Book {helper} again
                </Link>
              )}
            </li>
          );
        })}
      </ul>

      <NavBar />
    </main>
  );
}
