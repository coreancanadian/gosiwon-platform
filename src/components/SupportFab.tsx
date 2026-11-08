import { MessageCircle } from "lucide-react";
import { Link } from "@/i18n/navigation";

/**
 * The floating "contact the team" button. Only the FAQ and legal pages show it
 * (see SupportButton's callers): on a listing it read as a way to reach the
 * host, when it only ever reaches the Campusflat team.
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
  return (
    <Link
      href={href}
      aria-label={unread > 0 ? `${label} (${unread})` : label}
      className="fixed right-4 bottom-5 z-40 flex h-12 items-center gap-2 rounded-full bg-brand-500 px-4 text-sm font-semibold text-white shadow-lg shadow-ink-900/20 transition hover:bg-brand-600"
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
