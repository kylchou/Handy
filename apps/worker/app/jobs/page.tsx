"use client";

import { useCallback, useEffect, useState } from "react";
import type { JobDetailDTO } from "@handy/contracts";
import JobRow from "@/components/JobRow";
import Page, { Empty, ErrorNote } from "@/components/Page";
import { api, friendlyError, useRequireLogin } from "@/lib/api";

const ACTIVE = ["ACCEPTED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS"];

/** Jobs they've accepted that aren't finished, soonest first. */
export default function MyJobsPage() {
  useRequireLogin();
  const [jobs, setJobs] = useState<JobDetailDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    api.jobs
      .list()
      .then((all) =>
        setJobs(
          all
            .filter((j) => ACTIVE.includes(j.status))
            .sort((a, b) => `${a.request.requestedDate}${a.request.requestedStartTime}`.localeCompare(`${b.request.requestedDate}${b.request.requestedStartTime}`)),
        ),
      )
      .catch((err) => setError(friendlyError(err)));
  }, []);

  useEffect(() => {
    if (!api.getToken()) return; // not logged in, the login redirect handles it
    refresh();
    return api.realtime.subscribe((e) => ["JOB_CANCELLED", "JOB_ACCEPTED", "DEMO_RESET"].includes(e.type) && refresh(), { onResync: refresh });
  }, [refresh]);

  return (
    <Page title="My Jobs">
      {error && <ErrorNote>{error}</ErrorNote>}
      {jobs === null && !error && <p className="text-ink-soft">Loading…</p>}
      {jobs?.length === 0 && <Empty>No upcoming jobs. Accept one from Find Jobs and it shows up here.</Empty>}
      <ul className="space-y-3">{jobs?.map((job) => <JobRow key={job.id} job={job} />)}</ul>
    </Page>
  );
}
