"use client";

import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { Users, Home as HomeIcon, MapPin } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { formatPriceRange } from "@/lib/format";
import type { PropertyWithRelations } from "@/lib/types/database";

export function PropertyCard({
  property,
  isActive = false,
  onHover,
  imageUrl,
}: {
  property: PropertyWithRelations;
  isActive?: boolean;
  onHover?: (id: string | null) => void;
  imageUrl?: string | null;
}) {
  const locale = useLocale() as Locale;
  const t = useTranslations("Property");
  const tEnum = useTranslations("Enums");
  const isKo = locale === "ko";

  const name = (isKo ? property.name_ko : property.name_en) || property.name_ko;
  const address =
    (isKo ? property.address_ko : property.address_en) || property.address_ko;
  const price = formatPriceRange(property.price_min, property.price_max, locale);
  const availableRooms = property.rooms.filter((r) => r.is_available).length;

  return (
    <Link
      href={`/property/${property.slug}`}
      onMouseEnter={() => onHover?.(property.id)}
      onMouseLeave={() => onHover?.(null)}
      onFocus={() => onHover?.(property.id)}
      onBlur={() => onHover?.(null)}
      className={`group flex gap-4 rounded-[var(--radius-card)] border p-3 transition ${
        isActive
          ? "border-brand-400 bg-brand-50/40 shadow-sm"
          : "border-transparent hover:border-ink-200 hover:bg-ink-50"
      }`}
    >
      <div className="relative h-32 w-40 shrink-0 overflow-hidden rounded-xl bg-ink-100 sm:h-36 sm:w-48">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt=""
            fill
            sizes="200px"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-ink-100 to-ink-200">
            <HomeIcon className="h-7 w-7 text-ink-400" aria-hidden />
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-medium text-ink-600">
            {tEnum(`propertyType.${property.property_type}`)}
          </span>
          {property.gender !== "any" ? (
            <span className="flex items-center gap-1 rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-medium text-brand-700">
              <Users className="h-3 w-3" aria-hidden />
              {tEnum(`gender.${property.gender}`)}
            </span>
          ) : null}
        </div>

        <h3 className="mt-1.5 truncate text-base font-semibold text-ink-900">
          {name}
        </h3>

        <p className="mt-0.5 flex items-start gap-1 text-xs text-ink-500">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="line-clamp-2">{address}</span>
        </p>

        <div className="mt-auto flex flex-wrap items-baseline gap-x-2 pt-2">
          {price ? (
            <>
              <span className="text-base font-semibold text-ink-900">{price}</span>
              <span className="text-xs text-ink-500">{t("perMonth")}</span>
            </>
          ) : null}
          {availableRooms > 0 ? (
            <span className="ml-auto text-xs text-ink-400">
              {t("roomsAvailable", { count: availableRooms })}
            </span>
          ) : (
            <span className="ml-auto text-xs font-medium text-brand-600">
              {t("unavailable")}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
