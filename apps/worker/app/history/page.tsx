"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import type { JobDetailDTO, WorkerEarningsDTO, WorkerProfileDTO } from "@handy/contracts";
import JobRow from "@/components/JobRow";
import Page, { Empty, ErrorNote } from "@/components/Page";
import { api, friendlyError, useRequireLogin } from "@/lib/api";
import { formatPay } from "@/lib/format";

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-card border border-line bg-white p-4 text-center shadow-card">
      <p className="text-2xl font-bold text-ink">{value}</p>
      <p className="text-sm font-bold uppercase tracking-wide text-ink-soft">{label}</p>
    </div>
  );
}

/** Completed jobs, earnings, and rating. */
export default function HistoryPage() {
  useRequireLogin();
  const [earnings, setEarnings] = useState<WorkerEarningsDTO | null>(null);
  const [profile, setProfile] = useState<WorkerProfileDTO | null>(null);
  const [jobs, setJobs] = useState<JobDetailDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!api.getToken()) return; // not logged in, the login redirect handles it
    Promise.all([api.workers.earnings(), api.workers.getProfile(), api.jobs.list()])
      .then(([e, p, all]) => {
        setEarnings(e);
        setProfile(p);
        setJobs(all.filter((j) => j.status === "COMPLETED" || j.status === "CANCELLED"));
      })
      .catch((err) => setError(friendlyError(err)));
  }, []);

  return (
    <Page title="History">
      <div className="space-y-4">
        {error && <ErrorNote>{error}</ErrorNote>}
        {earnings && profile && (
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Last 7 days" value={formatPay(earnings.last7DaysCents)} />
            <Stat label="All time" value={formatPay(earnings.totalEarnedCents)} />
            <Stat
              label={`${profile.ratingCount} ratings`}
              value={
                <span className="inline-flex items-center gap-1">
                  <Star aria-hidden="true" size={22} className="fill-warm text-warm" />
                  {profile.rating.toFixed(1)}
                </span>
              }
            />
            <Stat label="Jobs done" value={profile.completedJobs} />
          </div>
        )}
        <h2 className="pt-2 text-lg font-bold text-ink">Past jobs</h2>
        {jobs === null && !error && <p className="text-ink-soft">Loading…</p>}
        {jobs?.length === 0 && <Empty>Your finished jobs will show up here.</Empty>}
        <ul className="space-y-3">{jobs?.map((job) => <JobRow key={job.id} job={job} />)}</ul>
      </div>
    </Page>
  );
}
