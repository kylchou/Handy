import { Star, MapPin, BadgeCheck } from "lucide-react";
import type { WorkerPublicDTO } from "@/lib/types";

export default function WorkerCard({
  worker,
  distanceMiles,
}: {
  worker: WorkerPublicDTO;
  distanceMiles?: number | null;
}) {
  return (
    <div className="flex animate-fade-up items-center gap-4 rounded-card border border-line bg-white p-5 shadow-card">
      <div
        aria-hidden="true"
        className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-dark text-2xl font-bold text-white"
      >
        {worker.firstName[0]}
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-xl font-bold text-ink">
          {worker.displayName}
          {worker.verificationStatus === "VERIFIED" && (
            <BadgeCheck aria-label="Verified worker" size={18} className="text-accent" />
          )}
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
  );
}