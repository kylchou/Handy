"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Briefcase, ClipboardList, HardHat, LayoutDashboard, LogOut, Users } from "lucide-react";
import { api, useRequireLogin } from "@/lib/api";

const NAV = [
  { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/requests", label: "Requests", Icon: ClipboardList },
  { href: "/jobs", label: "Jobs", Icon: Briefcase },
  { href: "/workers", label: "Workers", Icon: HardHat },
  { href: "/customers", label: "Customers", Icon: Users },
];

/** Sidebar (top bar on phones) plus the page. Every logged-in screen uses this. */
export default function Shell({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  useRequireLogin();
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await api.auth.logout();
    router.push("/login");
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="border-b border-line bg-white md:w-56 md:shrink-0 md:border-b-0 md:border-r">
        <p className="px-4 pt-4 text-lg font-bold text-accent">Handy Admin</p>
        <nav aria-label="Main navigation" className="flex gap-1 overflow-x-auto p-2 md:flex-col">
          {NAV.map(({ href, label, Icon }) => {
            const active = pathname?.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2 whitespace-nowrap rounded-control px-3 py-2 font-bold ${
                  active ? "bg-accent-light text-accent-dark" : "text-ink-soft hover:bg-paper"
                }`}
              >
                <Icon aria-hidden="true" size={18} />
                {label}
              </Link>
            );
          })}
          <button
            onClick={logout}
            className="flex items-center gap-2 whitespace-nowrap rounded-control px-3 py-2 font-bold text-ink-soft hover:bg-paper md:mt-4"
          >
            <LogOut aria-hidden="true" size={18} />
            Log out
          </button>
        </nav>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-ink">{title}</h1>
          {actions}
        </div>
        {children}
      </main>
    </div>
  );
}
