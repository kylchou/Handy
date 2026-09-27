import Link from "next/link";
import { Clock, MapPin } from "lucide-react";
import type { JobOfferDTO } from "@handy/contracts";
import { formatDay, formatMiles, formatPay, formatTime } from "@/lib/format";
import { timeLeft } from "@/lib/useNow";

export default function OfferCard({ offer, now }: { offer: JobOfferDTO; now: number }) {
  const left = timeLeft(offer.expiresAt, now);
  return (
    <li className="rounded-card border border-line bg-white p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xl font-bold text-ink">{offer.serviceName}</p>
          <p className="truncate text-ink">{offer.description}</p>
          {formatMiles(offer.distanceMiles) && (
            <p className="flex items-center gap-1 text-ink-soft">
              <MapPin aria-hidden="true" size={16} />
              {formatMiles(offer.distanceMiles)}
            </p>
          )}
          <p className="text-ink-soft">
            {formatDay(offer.requestedDate)} · {formatTime(offer.requestedStartTime)}
          </p>
        </div>
        <p className="text-2xl font-bold text-accent">{formatPay(offer.estimatedPayCents)}</p>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className={`flex items-center gap-1 text-sm font-bold ${left ? "text-warm" : "text-danger"}`}>
          <Clock aria-hidden="true" size={16} />
          {left ?? "Expired"}
          {offer.urgency === "HIGH" && <span className="ml-2 rounded bg-danger-light px-2 py-0.5 text-danger">Urgent</span>}
        </span>
        <Link
          href={`/jobs/${offer.id}?offer=1`}
          className="rounded-control bg-accent px-5 py-2.5 font-bold text-white hover:bg-accent-dark"
        >
          View Job
        </Link>
      </div>
    </li>
  );
}
