import type { ReactNode } from "react";
import { STATUS_TEXT, tone } from "@/lib/format";

const TONES = {
  green: "bg-accent-light text-accent-dark",
  amber: "bg-warm-light text-warm",
  red: "bg-danger-light text-danger",
  blue: "bg-[#E3ECF7] text-[#24507F]",
  gray: "bg-line/60 text-ink-soft",
};

export function Pill({ status }: { status: string }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-sm font-bold ${TONES[tone(status)]}`}>
      {STATUS_TEXT[status] ?? status}
    </span>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="mb-4 rounded-control bg-danger-light p-3 text-danger">
      {children}
    </p>
  );
}

/** A plain table that scrolls sideways on small screens. */
export function Table({ head, children, empty }: { head: string[]; children: ReactNode; empty?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-card border border-line bg-white shadow-card">
      <table className="w-full text-left">
        <thead className="border-b border-line bg-paper text-sm uppercase tracking-wide text-ink-soft">
          <tr>
            {head.map((h) => (
              <th key={h} className="whitespace-nowrap px-4 py-3 font-bold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {children}
          {empty && (
            <tr>
              <td colSpan={head.length} className="px-4 py-8 text-center text-ink-soft">
                Nothing here yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function Td({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-top ${className}`}>{children}</td>;
}

export function Filter<T extends string>({ value, options, onChange }: { value: T | ""; options: readonly T[]; onChange: (v: T | "") => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T | "")}
      aria-label="Filter by status"
      className="rounded-control border-2 border-field/60 bg-white px-3 py-2"
    >
      <option value="">All statuses</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {STATUS_TEXT[o] ?? o}
        </option>
      ))}
    </select>
  );
}
