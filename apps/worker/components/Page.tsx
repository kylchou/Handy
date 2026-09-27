import type { ReactNode } from "react";
import NavBar from "./NavBar";

/** Header, content, and the bottom nav. Every logged-in screen uses this. */
export default function Page({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <h1 className="flex-1 truncate text-xl font-bold text-ink">{title}</h1>
          {right}
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 pb-28 pt-4">{children}</main>
      <NavBar />
    </>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-control bg-danger-light p-3 text-danger">
      {children}
    </p>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-card border border-dashed border-line bg-white p-6 text-center text-ink-soft">{children}</p>;
}
