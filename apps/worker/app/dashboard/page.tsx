"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { JobDetailDTO, JobOfferDTO, WorkerProfileDTO } from "@handy/contracts";
import OfferCard from "@/components/OfferCard";
import Page, { Empty, ErrorNote } from "@/components/Page";
import { api, friendlyError, useRequireLogin } from "@/lib/api";
import { formatDay, formatTime, STATUS_LABELS } from "@/lib/format";
import { useNow } from "@/lib/useNow";

const ACTIVE = ["ACCEPTED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS"];

export default function DashboardPage() {
  useRequireLogin();
  const now = useNow();
  const [offers, setOffers] = useState<JobOfferDTO[] | null>(null);
  const [profile, setProfile] = useState<WorkerProfileDTO | null>(null);
  const [current, setCurrent] = useState<JobDetailDTO[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [o, p, jobs] = await Promise.all([api.jobs.available(), api.workers.getProfile(), api.jobs.list()]);
      setOffers(o);
      setProfile(p);
      setCurrent(jobs.filter((j) => ACTIVE.includes(j.status)));
      setError(null);
    } catch (err) {
      setError(friendlyError(err));
    }
  }, []);

  useEffect(() => {
    if (!api.getToken()) return; // not logged in, the login redirect handles it
    refresh();
    // New offers show up live, and taken ones disappear.
    const stop = api.realtime.subscribe(
      (event) => {
        if (event.type === "JOB_OFFERED") setOffers((o) => (o ? [event.data.offer, ...o.filter((x) => x.id !== event.data.offer.id)] : o));
        else if (event.type === "JOB_NO_LONGER_AVAILABLE") setOffers((o) => o?.filter((x) => x.id !== event.data.offerId) ?? o);
        else if (["JOB_ACCEPTED", "JOB_CANCELLED", "JOB_COMPLETED", "DEMO_RESET"].includes(event.type)) refresh();
      },
      { onResync: refresh },
    );
    return stop;
  }, [refresh]);

  async function toggleAvailable() {
    if (!profile) return;
    setToggling(true);
    try {
      const next = profile.availabilityStatus === "OFFLINE" ? "AVAILABLE" : "OFFLINE";
      setProfile(await api.workers.updateAvailability({ availabilityStatus: next }));
      refresh();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setToggling(false);
    }
  }

  const offline = profile?.availabilityStatus === "OFFLINE";
  const open = offers?.filter((o) => new Date(o.expiresAt).getTime() > now) ?? null;

  return (
    <Page
      title="Available Jobs"
      right={
        profile && (
          <button
            onClick={toggleAvailable}
            disabled={toggling}
            aria-pressed={!offline}
            className={`rounded-full px-4 py-2 text-sm font-bold ${offline ? "bg-line text-ink" : "bg-accent-light text-accent-dark"}`}
          >
            {offline ? "Off: not taking jobs" : "● Taking jobs"}
          </button>
        )
      }
    >
      <div className="space-y-4">
        {error && <ErrorNote>{error}</ErrorNote>}

        {profile && profile.verificationStatus !== "VERIFIED" && (
          <p className="rounded-card border-2 border-warm bg-warm-light p-4 text-ink">
            <strong>Your account is being reviewed.</strong> You'll start getting jobs once the Handy team verifies you. Meanwhile, make sure
            your <Link href="/profile" className="font-bold text-accent underline">skills</Link> and{" "}
            <Link href="/availability" className="font-bold text-accent underline">hours</Link> are set.
          </p>
        )}

        {current.map((job) => (
          <Link key={job.id} href={`/jobs/${job.id}`} className="block rounded-card border-2 border-accent bg-accent-light p-4">
            <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Your job · {STATUS_LABELS[job.status]}</p>
            <p className="text-xl font-bold text-ink">
              {job.customer.firstName}: {job.request.description}
            </p>
            <p className="text-ink-soft">
              {formatDay(job.request.requestedDate)} at {formatTime(job.request.requestedStartTime)} · Tap to open
            </p>
          </Link>
        ))}

        {offline ? (
          <Empty>You're off right now, so you won't get new jobs. Tap "Off" at the top to start taking jobs again.</Empty>
        ) : open === null ? (
          <p className="text-ink-soft">Looking for jobs near you…</p>
        ) : open.length === 0 ? (
          <Empty>No open jobs near you right now. New ones show up here automatically.</Empty>
        ) : (
          <ul className="space-y-3">
            {open.map((offer) => (
              <OfferCard key={offer.id} offer={offer} now={now} />
            ))}
          </ul>
        )}
      </div>
    </Page>
  );
}
