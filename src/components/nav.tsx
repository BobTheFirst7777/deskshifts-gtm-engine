"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

const items = [
  { href: "/", label: "Today", icon: "M3 12l9-9 9 9M5 10v10h14V10" },
  { href: "/leads", label: "Leads", icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM4 21v-1a6 6 0 0112 0v1M18 8a3 3 0 010 6M22 21v-1a4 4 0 00-3-3.87" },
  { href: "/pipeline", label: "Pipeline", icon: "M4 5h4v14H4zM10 5h4v9h-4zM16 5h4v5h-4z" },
  { href: "/experiments", label: "Experiments", icon: "M9 3h6M10 3v6L4 19a1 1 0 00.9 1.5h14.2A1 1 0 0020 19l-6-10V3" },
  { href: "/insights", label: "Insights", icon: "M3 3v18h18M7 15l4-4 3 3 5-6" },
  { href: "/events", label: "Events", icon: "M8 2v4M16 2v4M3 9h18M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z" },
  { href: "/activity", label: "Activity", icon: "M12 8v4l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
  { href: "/settings", label: "Settings", icon: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" },
];

export function Nav({ counts }: { counts: { needsYou: number } }) {
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-0.5">
      {items.map((it) => {
        const active = it.href === "/" ? path === "/" : path.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            className={cx(
              "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition",
              active ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-200/60 hover:text-zinc-900",
            )}
          >
            <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d={it.icon} />
            </svg>
            <span className="flex-1">{it.label}</span>
            {it.href === "/" && counts.needsYou > 0 && (
              <span className={cx("rounded-full px-1.5 text-[11px] font-semibold tabular-nums", active ? "bg-white/20" : "bg-amber-100 text-amber-800")}>
                {counts.needsYou}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
