"use client";

import { Fragment, useState } from "react";
import type { AdminWorkerDTO, RatingDTO, VerificationStatus } from "@handy/contracts";
import Shell from "@/components/Shell";
import { ErrorNote, Pill, Table, Td } from "@/components/ui";
import { api, friendlyError } from "@/lib/api";
import { CATEGORY_LABELS, ago } from "@/lib/format";
import { useLive } from "@/lib/useLive";

const LEVEL: Record<string, string> = { BASIC: "", EXPERIENCED: " (exp.)", CERTIFIED: " (cert.)" };

export default function WorkersPage() {
  const [workers, setWorkers] = useState<AdminWorkerDTO[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [ratings, setRatings] = useState<RatingDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const all = await api.admin.workers();
      // Anyone waiting on a decision goes to the top.
      setWorkers(all.sort((a, b) => Number(a.profile.verificationStatus === "VERIFIED") - Number(b.profile.verificationStatus === "VERIFIED")));
    } catch (err) {
      setError(friendlyError(err));
    }
  };
  useLive(load);

  async function setVerification(id: string, status: VerificationStatus) {
    try {
      await api.admin.setVerification(id, status);
      await load();
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  async function showRatings(id: string) {
    if (open === id) return setOpen(null);
    setOpen(id);
    setRatings(null);
    try {
      setRatings(await api.workers.ratings(id));
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  return (
    <Shell title="Workers">
      {error && <ErrorNote>{error}</ErrorNote>}
      <Table head={["Worker", "Verification", "Status", "Skills", "Rating", "Jobs", ""]} empty={workers?.length === 0}>
        {workers?.map((w) => {
          const p = w.profile;
          const verified = p.verificationStatus === "VERIFIED";
          return (
            <Fragment key={w.id}>
              <tr>
                <Td>
                  <p className="font-bold">
                    {w.firstName} {w.lastName}
                  </p>
                  <p className="text-sm text-ink-soft">{w.email}</p>
                  <p className="text-sm text-ink-soft">
                    {p.address ?? "No address"} · {p.serviceRadius} mi radius
                  </p>
                </Td>
                <Td>
                  <Pill status={p.verificationStatus} />
                  <div className="mt-2 flex gap-2 text-sm">
                    {!verified && (
                      <button onClick={() => setVerification(w.id, "VERIFIED")} className="rounded-control bg-accent px-3 py-1 font-bold text-white">
                        Verify
                      </button>
                    )}
                    {p.verificationStatus !== "REJECTED" && (
                      <button onClick={() => setVerification(w.id, "REJECTED")} className="font-bold text-danger underline">
                        {verified ? "Suspend" : "Reject"}
                      </button>
                    )}
                  </div>
                </Td>
                <Td>
                  <Pill status={p.availabilityStatus} />
                  {w.activeJobCount > 0 && <p className="mt-1 text-sm text-ink-soft">{w.activeJobCount} active job(s)</p>}
                </Td>
                <Td className="max-w-xs text-sm">
                  {p.qualifications.length === 0 ? (
                    <span className="text-ink-soft">None yet</span>
                  ) : (
                    p.qualifications.map((q) => `${CATEGORY_LABELS[q.serviceCategoryId]}${LEVEL[q.qualificationLevel]}`).join(", ")
                  )}
                </Td>
                <Td className="whitespace-nowrap">
                  <span className="text-warm">★</span> {p.rating.toFixed(1)} <span className="text-sm text-ink-soft">({p.ratingCount})</span>
                </Td>
                <Td>{p.completedJobs}</Td>
                <Td>
                  <button onClick={() => showRatings(w.id)} className="whitespace-nowrap font-bold text-accent underline">
                    {open === w.id ? "Hide reviews" : "Reviews"}
                  </button>
                </Td>
              </tr>
              {open === w.id && (
                <tr>
                  <td colSpan={7} className="bg-paper px-4 py-3">
                    {ratings === null ? (
                      <p className="text-ink-soft">Loading…</p>
                    ) : ratings.length === 0 ? (
                      <p className="text-ink-soft">No reviews yet.</p>
                    ) : (
                      <ul className="space-y-1">
                        {ratings.slice(0, 10).map((r) => (
                          <li key={r.id}>
                            <span className="text-warm">{"★".repeat(r.score)}</span> {r.comment ?? <span className="text-ink-soft">No comment</span>}{" "}
                            <span className="text-sm text-ink-soft">· {ago(r.createdAt)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </Table>
      {workers === null && !error && <p className="mt-4 text-ink-soft">Loading…</p>}
    </Shell>
  );
}
