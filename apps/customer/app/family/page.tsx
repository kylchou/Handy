"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Bell, HeartHandshake, LogOut } from "lucide-react";
import type { CaregiverPersonDTO, NotificationDTO } from "@handy/contracts";
import BigButton from "@/components/BigButton";
import WorkerCard from "@/components/WorkerCard";
import { api, friendlyError, useRequireCaregiver } from "@/lib/api";
import { CATEGORY_LABELS, formatDate, formatTime } from "@/lib/types";

const JOB_STATUS: Record<string, string> = {
  ACCEPTED: "Booked",
  EN_ROUTE: "On the way",
  ARRIVED: "Arrived",
  IN_PROGRESS: "Working on it now",
  COMPLETED: "Done",
  CANCELLED: "Cancelled",
};

/** Alerts that need a family member's attention right away get a red card. */
const URGENT = ["POTENTIAL_EMERGENCY", "SCAM_WARNING", "NO_SHOW"];

/**
 * What a family member sees: the people they help, their upcoming and live
 * jobs, and alerts (arrivals, emergencies, scam warnings). Updates live.
 */
export default function FamilyPage() {
  useRequireCaregiver();
  const router = useRouter();
  const [people, setPeople] = useState<CaregiverPersonDTO[] | null>(null);
  const [alerts, setAlerts] = useState<NotificationDTO[]>([]);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [p, n] = await Promise.all([api.caregivers.people(), api.notifications.list()]);
      setPeople(p);
      setAlerts(n.slice(0, 15));
    } catch (err) {
      setError(friendlyError(err));
    }
  }, []);

  useEffect(() => {
    if (!api.getToken()) return; // not logged in, the login redirect handles it
    refresh();
    return api.realtime.subscribe(() => void refresh(), { onResync: refresh });
  }, [refresh]);

  async function link(e: FormEvent) {
    e.preventDefault();
    setLinking(true);
    setError(null);
    try {
      await api.caregivers.acceptInvite(code);
      setCode("");
      await refresh();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLinking(false);
    }
  }

  async function markRead() {
    await api.notifications.markAllRead().catch(() => undefined);
    await refresh();
  }

  async function logout() {
    await api.auth.logout();
    router.push("/login");
  }

  const unread = alerts.filter((a) => !a.readAt).length;

  return (
    <main className="mx-auto min-h-screen max-w-2xl space-y-6 px-4 pb-16 pt-6">
      <header className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-white">
          <HeartHandshake aria-hidden="true" size={22} />
        </span>
        <h1 className="flex-1 text-2xl font-bold text-ink">Family</h1>
        <button onClick={logout} className="flex items-center gap-1 font-bold text-ink-soft">
          <LogOut aria-hidden="true" size={18} /> Log out
        </button>
      </header>

      {error && (
        <p role="alert" className="rounded-control bg-danger-light p-3 text-danger">
          {error}
        </p>
      )}

      <section aria-label="Alerts">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xl font-bold text-ink">
            <Bell aria-hidden="true" size={20} /> Alerts {unread > 0 && <span className="text-warm">({unread} new)</span>}
          </h2>
          {unread > 0 && (
            <button onClick={markRead} className="font-bold text-accent underline">
              Mark all read
            </button>
          )}
        </div>
        {alerts.length === 0 ? (
          <p className="rounded-card border border-line bg-white p-4 text-ink-soft">No alerts yet. You'll hear about arrivals, finished jobs, and anything that needs your attention.</p>
        ) : (
          <ul className="space-y-2">
            {alerts.map((a) => {
              const urgent = URGENT.includes(a.type);
              return (
                <li
                  key={a.id}
                  className={`rounded-card border p-4 ${urgent ? "border-2 border-danger bg-danger-light" : a.readAt ? "border-line bg-white" : "border-accent bg-accent-light"}`}
                >
                  <p className={`flex items-start gap-2 font-bold ${urgent ? "text-danger" : "text-ink"}`}>
                    {urgent && <AlertTriangle aria-hidden="true" size={20} className="mt-1 shrink-0" />}
                    {a.title}
                  </p>
                  {a.body && <p className="text-ink">{a.body}</p>}
                  <p className="text-sm text-ink-soft">{new Date(a.createdAt).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}</p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {people === null && !error && <p className="text-lg text-ink-soft">Loading…</p>}

      {people?.map((p) => (
        <section key={p.customer.id} aria-label={`${p.customer.firstName}'s help`} className="space-y-3">
          <h2 className="text-xl font-bold text-ink">
            {p.customer.firstName} {p.customer.lastName}
          </h2>

          {p.activeJobs.length === 0 && p.openRequests.length === 0 && (
            <p className="rounded-card border border-line bg-white p-4 text-ink-soft">Nothing booked right now.</p>
          )}

          {p.activeJobs.map((j) => (
            <div key={j.id} className="space-y-3 rounded-card border-2 border-accent bg-accent-light p-4">
              <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">{JOB_STATUS[j.status] ?? j.status}</p>
              <p className="text-lg font-bold text-ink">
                {CATEGORY_LABELS[j.request.serviceCategoryId]}: {j.request.description}
              </p>
              <p className="text-ink">
                {formatDate(j.request.requestedDate)} at {formatTime(j.request.requestedStartTime)}
              </p>
              <WorkerCard worker={j.worker} distanceMiles={j.distanceMiles} />
            </div>
          ))}

          {p.openRequests.map((r) => (
            <div key={r.id} className="rounded-card border border-warm/50 bg-warm-light p-4">
              <p className="text-sm font-bold uppercase tracking-wide text-warm">Looking for someone</p>
              <p className="text-lg font-bold text-ink">
                {CATEGORY_LABELS[r.serviceCategoryId]}: {r.description}
              </p>
              <p className="text-ink">
                {formatDate(r.requestedDate)} at {formatTime(r.requestedStartTime)}
              </p>
            </div>
          ))}

          {p.recentHistory.length > 0 && (
            <details className="rounded-card border border-line bg-white p-4">
              <summary className="cursor-pointer font-bold text-ink">Past help ({p.recentHistory.length})</summary>
              <ul className="mt-2 divide-y divide-line">
                {p.recentHistory.map((h) => (
                  <li key={h.requestId} className="py-2">
                    <p className="font-bold text-ink">
                      {CATEGORY_LABELS[h.serviceCategoryId] ?? h.serviceName}
                      {h.worker && <span className="font-normal text-ink-soft"> with {h.worker.displayName}</span>}
                    </p>
                    <p className="text-ink-soft">
                      {formatDate(h.requestedDate)} · {JOB_STATUS[h.jobStatus ?? ""] ?? h.requestStatus.toLowerCase()}
                      {h.rating != null && <span className="text-warm"> {"★".repeat(h.rating)}</span>}
                    </p>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      ))}

      <section className="rounded-card border border-line bg-white p-4">
        <h2 className="mb-1 text-lg font-bold text-ink">Help someone else</h2>
        <p className="mb-3 text-ink-soft">Ask them for the 6-character code from Settings, "Invite a Family Member", in their Handy app.</p>
        <form onSubmit={link} className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={6}
            placeholder="ABC123"
            aria-label="Invite code"
            className="w-40 rounded-control border-2 border-field bg-white px-4 py-3 text-lg font-bold tracking-widest"
          />
          <BigButton type="submit" fullWidth={false} disabled={linking || code.length !== 6}>
            Link
          </BigButton>
        </form>
      </section>
    </main>
  );
}
