import type { WorkerSummaryDTO } from "@/lib/types";

export default function WorkerCard({ worker }: { worker: WorkerSummaryDTO }) {
  return (
    <div className="flex items-center gap-4 rounded-card border border-line bg-white p-5 shadow-soft">
      <div
        aria-hidden="true"
        className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-accent-light text-2xl font-bold text-accent-dark"
      >
        {worker.firstName[0]}
      </div>
      <div>
        <p className="text-xl font-bold text-ink">
          {worker.firstName} {worker.lastName}
        </p>
        <p className="text-ink-soft">
          ⭐ {worker.rating.toFixed(1)} · {worker.completedJobs} completed jobs
        </p>
        <p className="text-ink-soft">{worker.distanceMiles} miles away</p>
      </div>
    </div>
  );
}
