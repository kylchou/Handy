"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AdminStatsDTO, AdminWorkerDTO, JobDetailDTO, RealtimeEvent, ServiceRequestDTO } from "@handy/contracts";
import Shell from "@/components/Shell";
import { ErrorNote } from "@/components/ui";
import { api, friendlyError } from "@/lib/api";
import { CATEGORY_LABELS, ago } from "@/lib/format";
import { useLive } from "@/lib/useLive";

/** Plain-language line for the activity feed. */
function describe(e: RealtimeEvent): string | null {
  switch (e.type) {
    case "REQUEST_CREATED":
      return "New request posted";
    case "WORKER_MATCHED":
      return `Request sent to ${e.data.notifiedWorkerCount} worker${e.data.notifiedWorkerCount === 1 ? "" : "s"}`;
    case "JOB_ACCEPTED":
      return "A worker accepted a job";
    case "WORKER_EN_ROUTE":
      return "Worker is on the way";
    case "WORKER_ARRIVED":
      return "Worker arrived (code checked)";
    case "JOB_STARTED":
      return "Job started";
    case "JOB_COMPLETED":
      return "Job completed";
    case "JOB_CANCELLED":
      return `Job cancelled by the ${e.data.cancelledBy.toLowerCase()}`;
    case "REQUEST_CANCELLED":
      return "Request cancelled";
    case "REQUEST_EXPIRED":
      return "Request expired, nobody was free";
    case "MESSAGE_RECEIVED":
      return e.data.message.flags.length ? "Worker message flagged as a possible scam" : null;
    case "RATING_SUBMITTED":
      return `New ${e.data.score}-star rating`;
    case "DEMO_RESET":
      return "Demo data was reset";
    default:
      return null;
  }
}

function Stat({ label, value, href }: { label: string; value: number | undefined; href: string }) {
  return (
    <Link href={href} className="rounded-card border border-line bg-white p-5 shadow-card hover:border-accent">
      <p className="text-sm font-bold uppercase tracking-wide text-ink-soft">{label}</p>
      <p className="text-4xl font-bold text-ink">{value ?? "-"}</p>
    </Link>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<AdminStatsDTO | null>(null);
  const [stuck, setStuck] = useState<ServiceRequestDTO[]>([]);
  const [noShows, setNoShows] = useState<JobDetailDTO[]>([]);
  const [pending, setPending] = useState<AdminWorkerDTO[]>([]);
  const [feed, setFeed] = useState<Array<{ id: string; at: string; text: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useLive(async () => {
    try {
      const [s, requests, jobs, workers] = await Promise.all([api.admin.stats(), api.admin.requests("SEARCHING"), api.admin.jobs(), api.admin.workers()]);
      setStats(s);
      // Still looking after 10 minutes is worth a look.
      setStuck(requests.filter((r) => Date.now() - new Date(r.createdAt).getTime() > 10 * 60 * 1000));
      setNoShows(jobs.filter((j) => j.noShowAlertedAt && j.status === "ACCEPTED"));
      setPending(workers.filter((w) => w.profile.verificationStatus !== "VERIFIED" && w.profile.verificationStatus !== "REJECTED"));
      setError(null);
    } catch (err) {
      setError(friendlyError(err));
    }
  });

  // The activity feed keeps its own subscription since it needs each event, not just "something changed".
  useEffect(() => {
    if (!api.getToken()) return;
    return api.realtime.subscribe((e) => {
      const text = describe(e);
      if (text) setFeed((f) => [{ id: e.id, at: e.at, text }, ...f.filter((x) => x.id !== e.id)].slice(0, 12));
    });
  }, []);

  async function reset() {
    if (!window.confirm("Reset the demo? This deletes every request, job, and chat and puts the demo accounts back to the start. Nobody gets logged out.")) return;
    setBusy(true);
    setError(null);
    try {
      await api.admin.resetDemo();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  const attention = stuck.length + noShows.length + pending.length;

  return (
    <Shell title="Dashboard">
      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Active requests" value={stats?.activeRequests} href="/requests" />
        <Stat label="Active jobs" value={stats?.activeJobs} href="/jobs" />
        <Stat label="Available workers" value={stats?.availableWorkers} href="/workers" />
        <Stat label="Completed today" value={stats?.completedToday} href="/jobs" />
      </div>
      {stats && (
        <p className="mt-2 text-ink-soft">
          {stats.totalCustomers} customers and {stats.totalWorkers} workers in total.
        </p>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-lg font-bold text-ink">Needs attention {attention > 0 && <span className="text-warm">({attention})</span>}</h2>
          <ul className="space-y-2">
            {attention === 0 && <li className="rounded-card border border-line bg-white p-4 text-ink-soft">All good right now.</li>}
            {noShows.map((j) => (
              <li key={j.id} className="rounded-card border-2 border-danger/40 bg-danger-light p-4">
                <strong>Possible no-show:</strong> {j.worker.displayName} hasn't headed out for {j.customer.displayName}'s{" "}
                {CATEGORY_LABELS[j.request.serviceCategoryId]?.toLowerCase()} job.{" "}
                <Link href="/jobs" className="font-bold underline">
                  See jobs
                </Link>
              </li>
            ))}
            {stuck.map((r) => (
              <li key={r.id} className="rounded-card border border-warm/50 bg-warm-light p-4">
                <strong>Still searching</strong> since {ago(r.createdAt)}: {CATEGORY_LABELS[r.serviceCategoryId]}, "{r.description}".{" "}
                <Link href="/requests" className="font-bold underline">
                  See requests
                </Link>
              </li>
            ))}
            {pending.map((w) => (
              <li key={w.id} className="rounded-card border border-line bg-white p-4">
                <strong>
                  {w.firstName} {w.lastName}
                </strong>{" "}
                is waiting to be verified.{" "}
                <Link href="/workers" className="font-bold text-accent underline">
                  Review
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold text-ink">Live activity</h2>
          <ul className="divide-y divide-line rounded-card border border-line bg-white">
            {feed.length === 0 && <li className="p-4 text-ink-soft">Things that happen show up here as they happen.</li>}
            {feed.map((f) => (
              <li key={f.id} className="flex justify-between gap-3 px-4 py-2.5">
                <span>{f.text}</span>
                <span className="whitespace-nowrap text-sm text-ink-soft">{ago(f.at)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-white p-5 shadow-card">
        <div>
          <h2 className="text-lg font-bold text-ink">Demo data</h2>
          <p className="text-ink-soft">Clears every request, job, and chat and puts the demo accounts back to the start.</p>
        </div>
        <button disabled={busy} onClick={reset} className="rounded-control border-2 border-danger/40 bg-white px-4 py-2 font-bold text-danger disabled:opacity-50">
          Reset demo data
        </button>
      </section>
    </Shell>
  );
}
