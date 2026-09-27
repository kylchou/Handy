"use client";

import { useState } from "react";
import { JOB_STATUSES, type JobDetailDTO, type JobStatus } from "@handy/contracts";
import Shell from "@/components/Shell";
import { ErrorNote, Filter, Pill, Table, Td } from "@/components/ui";
import { api, friendlyError } from "@/lib/api";
import { CATEGORY_LABELS, formatWhen, money } from "@/lib/format";
import { useLive } from "@/lib/useLive";

// SEARCHING and MATCHED are request states; a job row always starts at ACCEPTED.
const FILTERS = JOB_STATUSES.filter((s) => s !== "SEARCHING" && s !== "MATCHED");

export default function JobsPage() {
  const [status, setStatus] = useState<JobStatus | "">("");
  const [jobs, setJobs] = useState<JobDetailDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async (s = status) => {
    try {
      setJobs(await api.admin.jobs(s || undefined));
    } catch (err) {
      setError(friendlyError(err));
    }
  };
  useLive(() => load());

  return (
    <Shell
      title="Jobs"
      actions={
        <Filter
          value={status}
          options={FILTERS}
          onChange={(s) => {
            setStatus(s);
            void load(s);
          }}
        />
      }
    >
      {error && <ErrorNote>{error}</ErrorNote>}
      <Table head={["When", "Service", "Customer", "Worker", "Status", "Pay", "Rating"]} empty={jobs?.length === 0}>
        {jobs?.map((j) => (
          <tr key={j.id}>
            <Td className="whitespace-nowrap">{formatWhen(j.request.requestedDate, j.request.requestedStartTime)}</Td>
            <Td>
              <p className="font-bold">{CATEGORY_LABELS[j.request.serviceCategoryId]}</p>
              <p className="max-w-xs text-ink-soft">{j.request.description}</p>
            </Td>
            <Td>{j.customer.displayName}</Td>
            <Td>
              {j.worker.displayName}
              {j.distanceMiles != null && <p className="text-sm text-ink-soft">{j.distanceMiles.toFixed(1)} mi away</p>}
            </Td>
            <Td>
              <Pill status={j.status} />
              {j.noShowAlertedAt && j.status === "ACCEPTED" && <p className="mt-1 text-sm font-bold text-danger">Possible no-show</p>}
            </Td>
            <Td className="whitespace-nowrap">{money(j.finalPriceCents ?? j.request.workerPayCents)}</Td>
            <Td className="whitespace-nowrap">
              {j.rating ? <span className="text-warm">{"★".repeat(j.rating.score)}</span> : <span className="text-ink-soft">-</span>}
            </Td>
          </tr>
        ))}
      </Table>
      {jobs === null && !error && <p className="mt-4 text-ink-soft">Loading…</p>}
    </Shell>
  );
}
