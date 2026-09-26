"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { HeartHandshake, ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

export default function Header({
  title,
  showBack,
  right,
}: {
  title?: string;
  showBack?: boolean;
  right?: ReactNode;
}) {
  const router = useRouter();

  return (
    <header className="sticky top-0 z-10 border-b border-line/70 bg-paper/90 backdrop-blur supports-[backdrop-filter]:bg-paper/75">
      <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
        {showBack ? (
          <button
            onClick={() => router.back()}
            aria-label="Go back"
            className="tap-target -ml-2 flex h-11 w-11 items-center justify-center rounded-full text-ink hover:bg-accent-light"
          >
            <ChevronLeft aria-hidden="true" size={26} />
          </button>
        ) : (
          <Link
            href="/chat"
            aria-label="Helping Hand home"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-white"
          >
            <HeartHandshake aria-hidden="true" size={20} />
          </Link>
        )}
        <h1 className="flex-1 truncate text-xl font-bold text-ink">
          {title ?? "Helping Hand"}
        </h1>
        {right}
      </div>
    </header>
  );
}