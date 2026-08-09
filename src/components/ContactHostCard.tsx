import { getTranslations } from "next-intl/server";
import { CalendarCheck, MessageSquare } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { formatPriceRange } from "@/lib/format";
import type { PropertyWithRelations } from "@/lib/types/database";

export async function ContactHostCard({
  property,
  locale,
}: {
  property: PropertyWithRelations;
  locale: Locale;
}) {
  const t = await getTranslations("Property");
  const price = formatPriceRange(property.price_min, property.price_max, locale);
  const availableRooms = property.rooms.filter((r) => r.is_available).length;

  return (
    <div className="rounded-[var(--radius-card)] border border-ink-200 bg-white p-5 shadow-lg shadow-ink-900/5">
      {price ? (
        <p className="flex items-baseline gap-1.5">
          <span className="text-2xl font-semibold text-ink-900">{price}</span>
          <span className="text-sm text-ink-500">{t("perMonth")}</span>
        </p>
      ) : null}

      {/* Imported listings carry a rent range but no per-room rows, so absence
          of rooms means "not itemised yet", not "fully occupied". */}
      {property.rooms.length > 0 ? (
        <p className="mt-1 text-sm text-ink-500">
          {availableRooms > 0
            ? t("roomsAvailable", { count: availableRooms })
            : t("unavailable")}
        </p>
      ) : null}

      <Link
        href={`/property/${property.slug}/inquire`}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-600"
      >
        <MessageSquare className="h-4 w-4" aria-hidden />
        {t("contactHost")}
      </Link>

      <a
        href="#rooms"
        className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl border border-ink-300 px-4 py-3 text-sm font-medium text-ink-800 transition hover:bg-ink-50"
      >
        <CalendarCheck className="h-4 w-4" aria-hidden />
        {t("viewAvailability")}
      </a>
    </div>
  );
}
