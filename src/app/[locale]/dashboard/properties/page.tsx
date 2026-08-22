import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChevronRight, MapPin, Phone, TrainFront } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getOwnerProperties } from "@/lib/data/owner";
import {
  AddPropertyButton,
  PublishToggle,
} from "@/components/dashboard/PropertyListActions";
import { formatPriceRange } from "@/lib/format";
import type { Locale } from "@/i18n/routing";

const PAGE_SIZE = 25;

export default async function DashboardPropertiesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const [{ locale }, sp] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);

  const t = await getTranslations("Dashboard");
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const { properties, total, pageCount } = await getOwnerProperties(page, PAGE_SIZE);
  const loc = locale as Locale;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-500">
          {total.toLocaleString()} · {t("myProperties")}
        </p>
        <AddPropertyButton />
      </div>

      <div className="space-y-3">
        {properties.length === 0 ? (
          <p className="rounded-[var(--radius-card)] border border-ink-200 bg-ink-50 px-6 py-12 text-center text-sm text-ink-500">
            {t("noProperties")}
          </p>
        ) : (
          properties.map((property) => {
            const price = formatPriceRange(
              property.price_min,
              property.price_max,
              loc,
            );
            // Enriched listings carry a road address; un-enriched ones still
            // show only the district they were imported with.
            const enriched = property.address_source === "kakao_place";

            return (
              <div
                key={property.id}
                className="flex items-center gap-4 rounded-[var(--radius-card)] border border-ink-200 p-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <PublishToggle
                      propertyId={property.id}
                      isPublished={property.is_published}
                    />
                    {property.claim_status !== "claimed" ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                        {property.claim_status}
                      </span>
                    ) : null}
                    <span className="text-xs text-ink-400">
                      {property.rooms.length} rooms
                    </span>
                  </div>

                  <p className="mt-1.5 truncate text-base font-semibold text-ink-900">
                    {loc === "ko"
                      ? property.name_ko
                      : property.name_en || property.name_ko}
                  </p>

                  <p
                    className={`mt-0.5 flex items-start gap-1.5 text-sm ${
                      enriched ? "text-ink-700" : "text-ink-400"
                    }`}
                  >
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span className="truncate">{property.address_ko}</span>
                  </p>

                  {enriched && property.address_original ? (
                    <p className="mt-0.5 truncate pl-5 text-xs text-ink-400 line-through">
                      {property.address_original}
                    </p>
                  ) : null}

                  <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
                    {price ? (
                      <span className="text-sm font-medium text-ink-700">{price}</span>
                    ) : null}
                    {property.listing_phone ? (
                      <span className="flex items-center gap-1 text-xs text-ink-500">
                        <Phone className="h-3 w-3" aria-hidden />
                        {property.listing_phone}
                      </span>
                    ) : null}
                    {property.lat != null ? (
                      <span className="flex items-center gap-1 text-xs text-emerald-700">
                        <TrainFront className="h-3 w-3" aria-hidden />
                        {property.lat.toFixed(4)}, {property.lng?.toFixed(4)}
                      </span>
                    ) : null}
                  </div>
                </div>

                <Link
                  href={`/dashboard/properties/${property.id}`}
                  className="flex shrink-0 items-center gap-1 rounded-lg border border-ink-200 px-3 py-2 text-sm font-medium text-ink-700 transition hover:bg-ink-50"
                >
                  {t("editProperty")}
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </Link>
              </div>
            );
          })
        )}
      </div>

      {pageCount > 1 ? (
        <nav className="mt-6 flex items-center justify-center gap-2">
          {page > 1 ? (
            <Link
              href={`/dashboard/properties?page=${page - 1}`}
              className="rounded-lg border border-ink-200 px-3 py-2 text-sm text-ink-700 transition hover:bg-ink-50"
            >
              ←
            </Link>
          ) : null}
          <span className="px-3 text-sm text-ink-500">
            {page} / {pageCount}
          </span>
          {page < pageCount ? (
            <Link
              href={`/dashboard/properties?page=${page + 1}`}
              className="rounded-lg border border-ink-200 px-3 py-2 text-sm text-ink-700 transition hover:bg-ink-50"
            >
              →
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
