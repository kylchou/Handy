"use client";

import { useEffect, useState } from "react";
import NavBar from "@/components/NavBar";
import { getHistory } from "@/lib/api";
import type { HistoryEntryDTO } from "@/lib/types";

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

export default function HistoryPage() {
  const [entries, setEntries] = useState<HistoryEntryDTO[] | null>(null);

  useEffect(() => {
    getHistory().then(setEntries);
  }, []);

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 pb-28 pt-8">
      <h1 className="mb-6 text-2xl font-bold text-ink">My Services</h1>

      {entries === null && (
        <p className="text-lg text-ink-soft">Loading your services…</p>
      )}

      {entries?.length === 0 && (
        <p className="text-lg text-ink-soft">
          You haven't requested any services yet. Tap "Get Help" below to ask
          for something.
        </p>
      )}

      <ul className="space-y-4">
        {entries?.map((entry) => (
          <li
            key={entry.jobId}
            className="rounded-card border border-line bg-white p-5 shadow-soft"
          >
            <p className="text-xl font-bold text-ink">
              {CATEGORY_LABELS[entry.serviceCategoryId] ?? entry.serviceCategoryId}
            </p>
            <p className="text-ink-soft">{entry.status === "COMPLETED" ? "Completed" : entry.status}</p>
            <p className="text-ink-soft">{entry.workerName}</p>
            <p className="text-ink-soft">{entry.date}</p>
            <p className="mt-1 text-lg font-bold text-ink">${entry.price}</p>
            {entry.rating && (
              <p className="text-warm">{"★".repeat(entry.rating)}</p>
            )}
          </li>
        ))}
      </ul>

      <NavBar />
    </main>
  );
}
