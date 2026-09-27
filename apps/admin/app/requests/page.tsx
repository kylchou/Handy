"use client";

import { Fragment, useState } from "react";
import { SERVICE_REQUEST_STATUSES, type ServiceRequestDTO, type ServiceRequestStatus, type WorkerMatchDTO } from "@handy/contracts";
import Shell from "@/components/Shell";
import { ErrorNote, Filter, Pill, Table, Td } from "@/components/ui";
import { api, friendlyError } from "@/lib/api";
import { CATEGORY_LABELS, ago, formatWhen, money } from "@/lib/format";
import { useLive } from "@/lib/useLive";

export default function RequestsPage() {
  const [status, setStatus] = useState<ServiceRequestStatus | "">("");
  const [requests, setRequests] = useState<ServiceRequestDTO[] | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [open, setOpen] = useState<string | null>(null);
  const [matches, setMatches] = useState<WorkerMatchDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async (s = status) => {
    try {
      const [r, customers] = await Promise.all([api.admin.requests(s || undefined), api.admin.customers()]);
      setRequests(r);
      setNames(new Map(customers.map((c) => [c.id, `${c.firstName} ${c.lastName}`])));
    } catch (err) {
      setError(friendlyError(err));
    }
  };
  useLive(() => load());

  async function showMatches(id: string) {
    if (open === id) return setOpen(null);
    setOpen(id);
    setMatches(null);
    try {
      setMatches((await api.requests.matches(id)).matches);
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  async function cancel(id: string) {
    if (!window.confirm("Cancel this request? The customer gets told.")) return;
    try {
      await api.requests.cancel(id);
      await load();
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  return (
    <Shell
      title="Requests"
      actions={
        <Filter
          value={status}
          options={SERVICE_REQUEST_STATUSES}
          onChange={(s) => {
            setStatus(s);
            void load(s);
          }}
        />
      }
    >
      {error && <ErrorNote>{error}</ErrorNote>}
      <Table head={["Posted", "Customer", "Service", "When", "Status", "Price", ""]} empty={requests?.length === 0}>
        {requests?.map((r) => (
          <Fragment key={r.id}>
            <tr>
              <Td className="whitespace-nowrap text-ink-soft">{ago(r.createdAt)}</Td>
              <Td>{names.get(r.customerId) ?? "Customer"}</Td>
              <Td>
                <p className="font-bold">{CATEGORY_LABELS[r.serviceCategoryId]}</p>
                <p className="max-w-xs text-ink-soft">{r.description}</p>
                <p className="max-w-xs text-sm text-ink-soft">{r.location}</p>
              </Td>
              <Td className="whitespace-nowrap">
                {formatWhen(r.requestedDate, r.requestedStartTime)}
                {r.urgency === "HIGH" && <span className="ml-2 text-sm font-bold text-danger">Urgent</span>}
              </Td>
              <Td>
                <Pill status={r.status} />
                {r.status === "SEARCHING" && <p className="mt-1 text-sm text-ink-soft">{r.pendingOfferCount} offers out</p>}
              </Td>
              <Td className="whitespace-nowrap">{money(r.estimatedPriceCents)}</Td>
              <Td className="whitespace-nowrap">
                <button onClick={() => showMatches(r.id)} className="font-bold text-accent underline">
                  {open === r.id ? "Hide matches" : "See matches"}
                </button>
                {r.status === "SEARCHING" && (
                  <button onClick={() => cancel(r.id)} className="ml-3 font-bold text-danger underline">
                    Cancel
                  </button>
                )}
              </Td>
            </tr>
            {open === r.id && (
              <tr>
                <td colSpan={7} className="bg-paper px-4 py-3">
                  {matches === null ? (
                    <p className="text-ink-soft">Ranking workers…</p>
                  ) : matches.length === 0 ? (
                    <p className="text-ink-soft">No worker fits this request right now (skills, hours, distance, or already booked).</p>
                  ) : (
                    <ol className="space-y-1">
                      {matches.map((m, i) => (
                        <li key={m.workerId} className="flex flex-wrap items-baseline gap-x-3">
                          <span className="w-6 text-ink-soft">{i + 1}.</span>
                          <strong>{m.displayName}</strong>
                          <span className="font-bold text-accent">{Math.round(m.score)}/100</span>
                          {m.offered && <span className="text-sm font-bold text-warm">offered</span>}
                          <span className="text-ink-soft">{(m.reasons ?? []).join(" · ")}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </td>
              </tr>
            )}
          </Fragment>
        ))}
      </Table>
      {requests === null && !error && <p className="mt-4 text-ink-soft">Loading…</p>}
    </Shell>
  );
}
