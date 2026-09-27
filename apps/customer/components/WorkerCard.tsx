"use client";

import { useState } from "react";
import { Star, MapPin, BadgeCheck, ChevronDown, ChevronUp } from "lucide-react";
import type { RatingDTO } from "@handy/contracts";
import type { WorkerPublicDTO } from "@/lib/types";
import { api, friendlyError } from "@/lib/api";

/** The helper's card: who they are, their rating, and reviews other customers wrote. */
export default function WorkerCard({
  worker,
  distanceMiles,
}: {
  worker: WorkerPublicDTO;
  distanceMiles?: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [reviews, setReviews] = useState<RatingDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggleReviews() {
    const next = !open;
    setOpen(next);
    if (next && reviews === null) {
      try {
        setReviews(await api.workers.ratings(worker.id));
      } catch (err) {
        setError(friendlyError(err));
      }
    }
  }

  const written = reviews?.filter((r) => r.comment) ?? [];

  return (
    <div className="animate-fade-up rounded-card border border-line bg-white p-5 shadow-card">
      <div className="flex items-center gap-4">
        <div
          aria-hidden="true"
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-dark text-2xl font-bold text-white"
        >
          {worker.firstName[0]}
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-xl font-bold text-ink">
            {worker.displayName}
            {worker.verificationStatus === "VERIFIED" && <BadgeCheck aria-label="Verified worker" size={18} className="text-accent" />}
          </p>
          <p className="flex items-center gap-1 text-ink-soft">
            <Star aria-hidden="true" size={16} className="fill-warm text-warm" />
            {worker.rating.toFixed(1)} · {worker.completedJobs} completed jobs
          </p>
          {distanceMiles != null && (
            <p className="flex items-center gap-1 text-ink-soft">
              <MapPin aria-hidden="true" size={16} />
              {distanceMiles} miles away
            </p>
          )}
        </div>
      </div>

      {worker.bio && <p className="mt-3 text-lg text-ink">"{worker.bio}"</p>}

      <button
        type="button"
        onClick={toggleReviews}
        aria-expanded={open}
        className="tap-target mt-3 flex w-full items-center justify-center gap-1 rounded-control border-2 border-line py-2 text-lg font-bold text-accent"
      >
        {open ? "Hide reviews" : `Read reviews of ${worker.firstName}`}
        {open ? <ChevronUp aria-hidden="true" size={20} /> : <ChevronDown aria-hidden="true" size={20} />}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {error && <p className="text-danger">{error}</p>}
          {reviews === null && !error && <p className="text-ink-soft">Loading reviews…</p>}
          {reviews !== null && written.length === 0 && <p className="text-ink-soft">No written reviews yet.</p>}
          {written.slice(0, 10).map((r) => (
            <figure key={r.id} className="rounded-control bg-paper p-3">
              <p className="text-warm" aria-label={`${r.score} out of 5 stars`}>
                {"★".repeat(r.score)}
                <span className="text-line">{"★".repeat(5 - r.score)}</span>
              </p>
              <blockquote className="text-lg text-ink">"{r.comment}"</blockquote>
              <figcaption className="text-ink-soft">
                {r.reviewerName ?? "A Handy customer"} · {new Date(r.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
