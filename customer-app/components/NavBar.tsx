"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/chat", label: "Get Help", icon: "💬" },
  { href: "/history", label: "My Services", icon: "🗓️" },
  { href: "/profile", label: "Profile", icon: "👤" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

export default function NavBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main navigation"
      className="fixed bottom-0 left-0 right-0 z-20 border-t border-line bg-white"
    >
      <ul className="mx-auto flex max-w-2xl justify-between">
        {items.map((item) => {
          const active = pathname?.startsWith(item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                className={`tap-target flex flex-col items-center justify-center gap-1 py-3 text-sm font-bold ${
                  active ? "text-accent" : "text-ink-soft"
                }`}
                aria-current={active ? "page" : undefined}
              >
                <span aria-hidden="true" className="text-2xl leading-none">
                  {item.icon}
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
