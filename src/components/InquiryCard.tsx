import { getTranslations } from "next-intl/server";
import { ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import type { InquiryListItem } from "@/lib/data/inquiries";
import type { InquiryStatus } from "@/lib/types/database";

const STATUS_STYLES: Record<InquiryStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  accepted: "bg-emerald-100 text-emerald-800",
  declined: "bg-ink-200 text-ink-600",
  closed: "bg-ink-200 text-ink-600",
};

export async function InquiryCard({
  inquiry,
  href,
  locale,
}: {
  inquiry: InquiryListItem;
  href: string;
  locale: Locale;
}) {
  const tEnum = await getTranslations("Enums");
  const isKo = locale === "ko";

  const property = inquiry.properties;
  const name = property
    ? (isKo ? property.name_ko : property.name_en) || property.name_ko
    : "—";

  return (
    <Link
      href={href}
      className="flex items-center gap-4 rounded-[var(--radius-card)] border border-ink-200 p-4 transition hover:border-ink-300 hover:bg-ink-50"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[inquiry.status]}`}
          >
            {tEnum(`inquiryStatus.${inquiry.status}`)}
          </span>
          {inquiry.rooms ? (
            <span className="text-xs text-ink-400">{inquiry.rooms.name}</span>
          ) : null}
        </div>

        <p className="mt-1.5 truncate text-base font-semibold text-ink-900">
          {name}
        </p>

        {inquiry.intro_message ? (
          <p className="mt-1 line-clamp-1 text-sm text-ink-500">
            {inquiry.intro_message}
          </p>
        ) : null}

        <p className="mt-1 text-xs text-ink-400">
          {new Date(inquiry.created_at).toLocaleDateString()}
          {inquiry.move_in_date ? ` · ${inquiry.move_in_date}` : ""}
        </p>
      </div>

      <ChevronRight className="h-5 w-5 shrink-0 text-ink-400" aria-hidden />
    </Link>
  );
}
