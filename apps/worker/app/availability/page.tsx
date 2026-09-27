"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/Button";
import Page, { ErrorNote } from "@/components/Page";
import { api, friendlyError, useRequireLogin } from "@/lib/api";
import { DAY_NAMES, formatTime } from "@/lib/format";

/** Whole and half hours from 6 AM to 10 PM. */
const TIMES = Array.from({ length: 33 }, (_, i) => {
  const minutes = 6 * 60 + i * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${minutes % 60 ? "30" : "00"}`;
});

interface Day {
  on: boolean;
  start: string;
  end: string;
}

/** One window per day keeps it simple. Jobs that fit inside it get offered. */
export default function AvailabilityPage() {
  useRequireLogin();
  const router = useRouter();
  const [days, setDays] = useState<Day[] | null>(null);
  const [welcome, setWelcome] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!api.getToken()) return; // not logged in, the login redirect handles it
    setWelcome(new URLSearchParams(window.location.search).get("welcome") === "1");
    api.workers
      .getProfile()
      .then((p) =>
        setDays(
          DAY_NAMES.map((_, i) => {
            const slot = p.availability.find((s) => s.dayOfWeek === i);
            return slot ? { on: true, start: slot.startTime, end: slot.endTime } : { on: false, start: "09:00", end: "17:00" };
          }),
        ),
      )
      .catch((err) => setError(friendlyError(err)));
  }, []);

  function update(i: number, patch: Partial<Day>) {
    setDays((d) => d && d.map((day, j) => (j === i ? { ...day, ...patch } : day)));
    setSaved(false);
  }

  async function save() {
    if (!days) return;
    const bad = days.findIndex((d) => d.on && d.end <= d.start);
    if (bad >= 0) {
      setError(`On ${DAY_NAMES[bad]}, the end time has to be after the start time.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.workers.updateAvailability({
        slots: days.flatMap((d, i) => (d.on ? [{ dayOfWeek: i, startTime: d.start, endTime: d.end }] : [])),
      });
      setSaved(true);
      if (welcome) router.push("/dashboard");
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSaving(false);
    }
  }

  const select = "rounded-control border-2 border-field/60 bg-white px-2 py-2 text-base";
  return (
    <Page title="My Hours">
      <div className="space-y-3">
        <p className="text-ink-soft">You'll only get jobs during these hours.</p>
        {days === null && !error && <p className="text-ink-soft">Loading…</p>}
        {days?.map((day, i) => (
          <div key={DAY_NAMES[i]} className="flex flex-wrap items-center gap-2 rounded-card border border-line bg-white p-3">
            <label className="flex min-w-[8.5rem] items-center gap-2 text-lg font-bold text-ink">
              <input
                type="checkbox"
                checked={day.on}
                onChange={(e) => update(i, { on: e.target.checked })}
                className="h-5 w-5 accent-accent"
              />
              {DAY_NAMES[i]}
            </label>
            {day.on ? (
              <span className="flex items-center gap-2">
                <select aria-label={`${DAY_NAMES[i]} start`} value={day.start} onChange={(e) => update(i, { start: e.target.value })} className={select}>
                  {TIMES.map((t) => (
                    <option key={t} value={t}>
                      {formatTime(t)}
                    </option>
                  ))}
                </select>
                to
                <select aria-label={`${DAY_NAMES[i]} end`} value={day.end} onChange={(e) => update(i, { end: e.target.value })} className={select}>
                  {TIMES.map((t) => (
                    <option key={t} value={t}>
                      {formatTime(t)}
                    </option>
                  ))}
                </select>
              </span>
            ) : (
              <span className="text-ink-soft">Off</span>
            )}
          </div>
        ))}
        {error && <ErrorNote>{error}</ErrorNote>}
        {saved && !welcome && <p className="rounded-control bg-accent-light p-3 text-accent-dark">Saved.</p>}
        {days && (
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : welcome ? "Save and find jobs" : "Save"}
          </Button>
        )}
      </div>
    </Page>
  );
}
