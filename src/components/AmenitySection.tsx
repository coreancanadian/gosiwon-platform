"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Check,
  Sofa,
  ShieldCheck,
  CookingPot,
  WashingMachine,
  PackageCheck,
  Building2,
} from "lucide-react";
import type { Locale } from "@/i18n/routing";
import type { Amenity, AmenityCategory } from "@/lib/types/database";
import { AMENITY_CATEGORY_ORDER } from "@/lib/data/seed-amenities";

const CATEGORY_ICONS: Record<AmenityCategory, React.ComponentType<{ className?: string }>> = {
  living: Sofa,
  safety: ShieldCheck,
  kitchen: CookingPot,
  laundry: WashingMachine,
  provided: PackageCheck,
  shared: Building2,
};

/** Collapsed by default past this many items, like the reference site. */
const PREVIEW_COUNT = 10;

export function AmenitySection({
  amenities,
  slugs,
}: {
  amenities: Amenity[];
  slugs: string[];
}) {
  const t = useTranslations("Property");
  const tEnum = useTranslations("Enums");
  const locale = useLocale() as Locale;
  const [expanded, setExpanded] = useState(false);

  const owned = new Set(slugs);
  const active = amenities.filter((a) => owned.has(a.slug));

  if (active.length === 0) return null;

  const grouped = AMENITY_CATEGORY_ORDER.map((category) => ({
    category,
    items: active
      .filter((a) => a.category === category)
      .sort((a, b) => a.sort_order - b.sort_order),
  })).filter((g) => g.items.length > 0);

  // When collapsed, show whole categories up to the preview budget so a
  // section never appears half-empty.
  let budget = PREVIEW_COUNT;
  const visible = expanded
    ? grouped
    : grouped.filter((g) => {
        if (budget <= 0) return false;
        budget -= g.items.length;
        return true;
      });

  return (
    <section className="border-t border-ink-200 py-8">
      <h2 className="text-xl font-semibold tracking-tight text-ink-900">
        {t("amenities")}
      </h2>

      <div className="mt-5 grid gap-6 sm:grid-cols-2">
        {visible.map(({ category, items }) => {
          const Icon = CATEGORY_ICONS[category];
          return (
            <div key={category}>
              <p className="flex items-center gap-2 text-sm font-semibold text-ink-800">
                <Icon className="h-4 w-4 text-ink-500" aria-hidden />
                {tEnum(`amenityCategory.${category}`)}
              </p>
              <ul className="mt-2.5 space-y-1.5">
                {items.map((a) => (
                  <li
                    key={a.slug}
                    className="flex items-start gap-2 text-sm text-ink-600"
                  >
                    <Check
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-500"
                      aria-hidden
                    />
                    {locale === "ko" ? a.name_ko : a.name_en}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {!expanded && visible.length < grouped.length ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-6 rounded-lg border border-ink-800 px-4 py-2.5 text-sm font-medium text-ink-900 transition hover:bg-ink-50"
        >
          {t("showAllAmenities", { count: active.length })}
        </button>
      ) : null}
    </section>
  );
}
