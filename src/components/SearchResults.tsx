"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { List, Map as MapIcon } from "lucide-react";
import { PropertyCard } from "./PropertyCard";
import { KakaoMap, type MapMarker } from "./KakaoMap";
import type { Locale } from "@/i18n/routing";
import { formatKrwCompact } from "@/lib/format";
import { publicImageUrl } from "@/lib/storage";
import type { PropertyWithRelations } from "@/lib/types/database";

/** Cover photo if the host set one, else the first uploaded photo. */
function coverUrl(property: PropertyWithRelations): string | null {
  const images = property.property_images ?? [];
  if (images.length === 0) return null;
  const cover =
    images.find((i) => i.is_cover) ??
    [...images].sort((a, b) => a.sort_order - b.sort_order)[0];
  return cover ? publicImageUrl(cover.storage_path) : null;
}

/**
 * Airbnb-style split: scrollable results on the left, map on the right.
 * Hovering a card highlights its pin and vice versa, so the two panes read as
 * one surface. Below `lg` they become a toggle, since side-by-side is unusable
 * on a phone.
 */
export function SearchResults({
  properties,
  center,
}: {
  properties: PropertyWithRelations[];
  center?: { lat: number; lng: number };
}) {
  const t = useTranslations("Search");
  const locale = useLocale() as Locale;
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"list" | "map">("list");

  const markers: MapMarker[] = useMemo(
    () =>
      properties
        .filter((p) => p.lat != null && p.lng != null)
        .map((p) => ({
          id: p.id,
          lat: p.lat!,
          lng: p.lng!,
          label: (locale === "ko" ? p.name_ko : p.name_en) || p.name_ko,
          badge:
            p.price_min != null
              ? formatKrwCompact(p.price_min, locale)
              : undefined,
        })),
    [properties, locale],
  );

  if (properties.length === 0) {
    return (
      <div className="rounded-[var(--radius-card)] border border-ink-200 bg-ink-50 px-6 py-16 text-center">
        <p className="text-base font-medium text-ink-800">{t("noResults")}</p>
        <p className="mt-1 text-sm text-ink-500">{t("noResultsHint")}</p>
      </div>
    );
  }

  return (
    <>
      {/* Mobile list/map toggle */}
      <div className="mb-4 flex justify-center lg:hidden">
        <div className="inline-flex rounded-full border border-ink-200 bg-white p-1">
          <button
            type="button"
            onClick={() => setMobileView("list")}
            className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition ${
              mobileView === "list" ? "bg-ink-900 text-white" : "text-ink-600"
            }`}
          >
            <List className="h-4 w-4" aria-hidden />
            {t("showList")}
          </button>
          <button
            type="button"
            onClick={() => setMobileView("map")}
            className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition ${
              mobileView === "map" ? "bg-ink-900 text-white" : "text-ink-600"
            }`}
          >
            <MapIcon className="h-4 w-4" aria-hidden />
            {t("showMap")}
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,44%)]">
        <div
          className={`flex flex-col gap-2 ${mobileView === "map" ? "hidden lg:flex" : ""}`}
        >
          {properties.map((property) => (
            <PropertyCard
              key={property.id}
              property={property}
              isActive={activeId === property.id}
              onHover={setActiveId}
              imageUrl={coverUrl(property)}
            />
          ))}
        </div>

        <div
          className={`lg:sticky lg:top-20 lg:h-[calc(100vh-6rem)] ${
            mobileView === "list" ? "hidden lg:block" : "h-[60vh]"
          }`}
        >
          <KakaoMap
            markers={markers}
            activeId={activeId}
            onMarkerClick={setActiveId}
            center={center}
            className="h-full w-full"
          />
        </div>
      </div>
    </>
  );
}
