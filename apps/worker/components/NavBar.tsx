"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Briefcase, ClipboardList, Search, User } from "lucide-react";

const items = [
  { href: "/dashboard", label: "Find Jobs", Icon: Search },
  { href: "/jobs", label: "My Jobs", Icon: Briefcase },
  { href: "/history", label: "History", Icon: ClipboardList },
  { href: "/profile", label: "Profile", Icon: User },
];

export default function NavBar() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main navigation" className="fixed bottom-0 left-0 right-0 z-20 border-t border-line bg-white">
      <ul className="mx-auto flex max-w-2xl">
        {items.map(({ href, label, Icon }) => {
          const active = pathname === href || (href !== "/dashboard" && pathname?.startsWith(href));
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 py-2 text-sm font-bold ${active ? "text-accent" : "text-ink-soft"}`}
              >
                <Icon aria-hidden="true" size={22} strokeWidth={active ? 2.5 : 2} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
