import Link from "next/link";
import type { JobDetailDTO } from "@handy/contracts";
import { CATEGORY_LABELS, formatDay, formatPay, formatTime, STATUS_LABELS } from "@/lib/format";

export default function JobRow({ job }: { job: JobDetailDTO }) {
  return (
    <li>
      <Link href={`/jobs/${job.id}`} className="block rounded-card border border-line bg-white p-4 shadow-card hover:border-accent">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-lg font-bold text-ink">
              {CATEGORY_LABELS[job.request.serviceCategoryId] ?? "Job"} · {job.customer.displayName}
            </p>
            <p className="truncate text-ink-soft">{job.request.description}</p>
            <p className="text-ink-soft">
              {formatDay(job.request.requestedDate)} at {formatTime(job.request.requestedStartTime)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-accent">{formatPay(job.finalPriceCents ?? job.request.estimatedPriceCents)}</p>
            <p className="text-sm font-bold text-ink-soft">{STATUS_LABELS[job.status]}</p>
            {job.rating && <p className="text-warm">{"★".repeat(job.rating.score)}</p>}
          </div>
        </div>
      </Link>
    </li>
  );
}
