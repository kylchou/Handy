"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, MessageCircle, Settings, User } from "lucide-react";

// Lucide line icons (same set as Header/WorkerCard) instead of emoji,
// which look different on every phone.
const items = [
  { href: "/chat", label: "Get Help", Icon: MessageCircle },
  { href: "/history", label: "My Services", Icon: CalendarDays },
  { href: "/profile", label: "Profile", Icon: User },
  { href: "/settings", label: "Settings", Icon: Settings },
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
                <item.Icon aria-hidden="true" size={26} strokeWidth={active ? 2.5 : 2} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
