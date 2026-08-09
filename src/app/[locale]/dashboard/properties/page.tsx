import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getOwnerProperties } from "@/lib/data/owner";
import {
  AddPropertyButton,
  PublishToggle,
} from "@/components/dashboard/PropertyListActions";
import { formatPriceRange } from "@/lib/format";
import type { Locale } from "@/i18n/routing";

export default async function DashboardPropertiesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("Dashboard");
  const properties = await getOwnerProperties();
  const loc = locale as Locale;

  return (
    <div>
      <div className="mb-6 flex justify-end">
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
                    <span className="text-xs text-ink-400">
                      {property.rooms.length} rooms
                    </span>
                  </div>
                  <p className="mt-1.5 truncate text-base font-semibold text-ink-900">
                    {loc === "ko"
                      ? property.name_ko
                      : property.name_en || property.name_ko}
                  </p>
                  <p className="mt-0.5 truncate text-sm text-ink-500">
                    {loc === "ko"
                      ? property.address_ko
                      : property.address_en || property.address_ko}
                  </p>
                  {price ? (
                    <p className="mt-1 text-sm font-medium text-ink-700">{price}</p>
                  ) : null}
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
    </div>
  );
}
