"use client";

import { useState } from "react";
import { Sunrise, Sun, Sunset, Clock } from "lucide-react";

const PERIODS = [
  {
    key: "morning",
    label: "Morning",
    Icon: Sunrise,
    slots: ["7:00 AM", "8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM"],
  },
  {
    key: "afternoon",
    label: "Afternoon",
    Icon: Sun,
    slots: ["12:00 PM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM"],
  },
  {
    key: "evening",
    label: "Evening",
    Icon: Sunset,
    slots: ["5:00 PM", "6:00 PM", "7:00 PM", "8:00 PM"],
  },
];

export default function TimePicker({
  onSelect,
}: {
  onSelect: (label: string) => void;
}) {
  const [activePeriod, setActivePeriod] = useState("afternoon");
  const period = PERIODS.find((p) => p.key === activePeriod) ?? PERIODS[0];

  return (
    <div className="animate-fade-up rounded-card border border-line bg-white p-4 shadow-card">
      <div className="mb-4 flex gap-2">
        {PERIODS.map((p) => {
          const active = p.key === activePeriod;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => setActivePeriod(p.key)}
              className={`tap-target flex flex-1 flex-col items-center gap-1 rounded-control border-2 py-2 text-sm font-bold transition-colors ${
                active
                  ? "border-accent bg-accent-light text-accent-dark"
                  : "border-line text-ink-soft hover:border-accent"
              }`}
            >
              <p.Icon aria-hidden="true" size={20} />
              {p.label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {period.slots.map((slot) => (
          <button
            key={slot}
            type="button"
            onClick={() => onSelect(slot)}
            className="tap-target rounded-control border-2 border-line py-2.5 text-base font-bold text-ink hover:border-accent hover:bg-accent hover:text-white"
          >
            {slot}
          </button>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-2 border-t border-line pt-3 text-ink-soft">
        <Clock aria-hidden="true" size={18} />
        <p className="text-sm">
          Or just type a time in the chat, like "around 2:30".
        </p>
      </div>
    </div>
  );
}