"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export default function DatePicker({
  onSelect,
}: {
  onSelect: (isoDate: string, label: string) => void;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [viewMonth, setViewMonth] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1)
  );

  const firstOfMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  const daysInMonth = new Date(
    viewMonth.getFullYear(),
    viewMonth.getMonth() + 1,
    0
  ).getDate();
  const leadingBlanks = firstOfMonth.getDay();

  const cells: (Date | null)[] = [
    ...Array(leadingBlanks).fill(null),
    ...Array.from(
      { length: daysInMonth },
      (_, i) => new Date(viewMonth.getFullYear(), viewMonth.getMonth(), i + 1)
    ),
  ];

  const canGoBack =
    viewMonth.getFullYear() > today.getFullYear() ||
    (viewMonth.getFullYear() === today.getFullYear() &&
      viewMonth.getMonth() > today.getMonth());

  function shiftMonth(delta: number) {
    setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + delta, 1));
  }

  function handlePick(day: Date) {
    const label = day.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    onSelect(toISODate(day), label);
  }

  return (
    <div className="animate-fade-up rounded-card border border-line bg-white p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          disabled={!canGoBack}
          aria-label="Previous month"
          className="tap-target flex h-10 w-10 items-center justify-center rounded-full text-ink hover:bg-accent-light disabled:opacity-30"
        >
          <ChevronLeft size={20} />
        </button>
        <p className="text-lg font-bold text-ink">
          {viewMonth.toLocaleDateString(undefined, {
            month: "long",
            year: "numeric",
          })}
        </p>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          aria-label="Next month"
          className="tap-target flex h-10 w-10 items-center justify-center rounded-full text-ink hover:bg-accent-light"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      <div className="mb-1 grid grid-cols-7 text-center text-sm font-bold text-ink-soft">
        {WEEKDAYS.map((w, i) => (
          <div key={i}>{w}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const past = day < today;
          const isToday = isSameDay(day, today);
          return (
            <button
              key={i}
              type="button"
              disabled={past}
              onClick={() => handlePick(day)}
              aria-label={day.toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
              className={`tap-target flex aspect-square items-center justify-center rounded-full text-lg font-bold transition-colors ${
                past
                  ? "text-line"
                  : "text-ink hover:bg-accent hover:text-white"
              } ${isToday && !past ? "border-2 border-accent" : ""}`}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => handlePick(today)}
          className="tap-target flex-1 rounded-control border-2 border-line py-2 text-base font-bold text-ink hover:border-accent"
        >
          Today
        </button>
        <button
          type="button"
          onClick={() => {
            const t = new Date(today);
            t.setDate(t.getDate() + 1);
            handlePick(t);
          }}
          className="tap-target flex-1 rounded-control border-2 border-line py-2 text-base font-bold text-ink hover:border-accent"
        >
          Tomorrow
        </button>
      </div>
    </div>
  );
}