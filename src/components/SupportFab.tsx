"use client";

import { MessageCircle } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";

/**
 * The always-on "contact the team" button. Hidden where it would be redundant
 * (the conversation screens themselves) or would collide with something: on
 * the search page's mobile map, tapping a pin raises a preview card from the
 * bottom edge, exactly where this sits.
 */
export function SupportFab({
  href,
  label,
  unread,
}: {
  href: string;
  label: string;
  unread: number;
}) {
  const pathname = usePathname();

  if (pathname === "/support" || pathname.startsWith("/dashboard/support")) return null;
  const onSearch = pathname.startsWith("/search");

  return (
    <Link
      href={href}
      aria-label={unread > 0 ? `${label} (${unread})` : label}
      className={`fixed right-4 bottom-5 z-40 h-12 items-center gap-2 rounded-full bg-brand-500 px-4 text-sm font-semibold text-white shadow-lg shadow-ink-900/20 transition hover:bg-brand-600 ${
        onSearch ? "hidden lg:flex" : "flex"
      }`}
    >
      <MessageCircle className="h-5 w-5" aria-hidden />
      {label}
      {unread > 0 ? (
        <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-red-500 px-1 text-[11px] font-bold text-white">
          {unread}
        </span>
      ) : null}
    </Link>
  );
}
