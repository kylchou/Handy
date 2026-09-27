"use client";

import type { FormEvent, ReactNode } from "react";
import Button from "./Button";
import { ErrorNote } from "./Page";

export interface Field {
  key: string;
  label: string;
  type?: string;
  autoComplete?: string;
  hint?: string;
  optional?: boolean;
}

/** Shared layout for login and signup. */
export default function AuthForm({
  title,
  subtitle,
  fields,
  values,
  onChange,
  onSubmit,
  submitLabel,
  loading,
  error,
  footer,
}: {
  title: string;
  subtitle: string;
  fields: Field[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onSubmit: () => void;
  submitLabel: string;
  loading: boolean;
  error: string | null;
  footer: ReactNode;
}) {
  function submit(e: FormEvent) {
    e.preventDefault();
    onSubmit();
  }
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-10">
      <p className="mb-1 font-bold uppercase tracking-wide text-accent">Handy for Workers</p>
      <h1 className="mb-1 text-3xl font-bold text-ink">{title}</h1>
      <p className="mb-6 text-lg text-ink-soft">{subtitle}</p>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {fields.map((f) => (
          <div key={f.key}>
            <label htmlFor={f.key} className="mb-1 block font-bold text-ink">
              {f.label} {f.optional && <span className="font-normal text-ink-soft">(optional)</span>}
            </label>
            {f.hint && <p className="mb-1 text-sm text-ink-soft">{f.hint}</p>}
            <input
              id={f.key}
              type={f.type ?? "text"}
              autoComplete={f.autoComplete}
              value={values[f.key] ?? ""}
              onChange={(e) => onChange(f.key, e.target.value)}
              className="w-full rounded-control border-2 border-field/60 bg-white px-4 py-3 text-lg text-ink"
            />
          </div>
        ))}
        {error && <ErrorNote>{error}</ErrorNote>}
        <Button type="submit" disabled={loading}>
          {loading ? "One moment…" : submitLabel}
        </Button>
      </form>
      <p className="mt-6 text-center text-ink-soft">{footer}</p>
    </main>
  );
}
