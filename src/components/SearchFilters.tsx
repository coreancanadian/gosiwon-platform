"use client";

import { useCallback, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { SlidersHorizontal, X } from "lucide-react";
import { usePathname, useRouter } from "@/i18n/navigation";
import {
  GENDERS,
  PRICE_BANDS,
  PROPERTY_TYPES as TYPES,
  SORTS,
} from "@/lib/search-bands";

export function SearchFilters() {
  const t = useTranslations("Search");
  const tEnum = useTranslations("Enums");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const setParam = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, value]) => {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      });
      startTransition(() => {
        router.replace(`${pathname}?${next.toString()}`, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  const gender = searchParams.get("gender") ?? "any";
  const type = searchParams.get("type") ?? "";
  const band = searchParams.get("price") ?? "any";
  const sort = searchParams.get("sort") ?? "recommended";

  const hasFilters =
    gender !== "any" || type !== "" || band !== "any" || sort !== "recommended";

  const selectClass =
    "rounded-full border border-ink-200 bg-white px-3 py-1.5 text-sm text-ink-700 transition hover:border-ink-300 focus:ring-2 focus:ring-brand-500 focus:outline-none";

  return (
    <div
      className={`flex flex-wrap items-center gap-2 ${isPending ? "opacity-70" : ""}`}
    >
      <span className="flex items-center gap-1.5 text-sm font-medium text-ink-600">
        <SlidersHorizontal className="h-4 w-4" aria-hidden />
        {t("filters")}
      </span>

      <select
        value={gender}
        onChange={(e) =>
          setParam({ gender: e.target.value === "any" ? null : e.target.value })
        }
        aria-label={t("gender")}
        className={selectClass}
      >
        {GENDERS.map((g) => (
          <option key={g} value={g}>
            {g === "any" ? t("anyGender") : tEnum(`gender.${g}`)}
          </option>
        ))}
      </select>

      <select
        value={type}
        onChange={(e) => setParam({ type: e.target.value || null })}
        aria-label={t("propertyType")}
        className={selectClass}
      >
        <option value="">{t("anyType")}</option>
        {TYPES.map((ty) => (
          <option key={ty} value={ty}>
            {tEnum(`propertyType.${ty}`)}
          </option>
        ))}
      </select>

      <select
        value={band}
        onChange={(e) =>
          setParam({ price: e.target.value === "any" ? null : e.target.value })
        }
        aria-label={t("priceRange")}
        className={selectClass}
      >
        {PRICE_BANDS.map((b) => (
          <option key={b.key} value={b.key}>
            {t(`priceBands.${b.key}`)}
          </option>
        ))}
      </select>

      <select
        value={sort}
        onChange={(e) =>
          setParam({
            sort: e.target.value === "recommended" ? null : e.target.value,
          })
        }
        aria-label={t("sortBy")}
        className={`${selectClass} ml-auto`}
      >
        {SORTS.map((s) => (
          <option key={s} value={s}>
            {t(
              s === "recommended"
                ? "sortRecommended"
                : s === "price_asc"
                  ? "sortPriceAsc"
                  : s === "price_desc"
                    ? "sortPriceDesc"
                    : "sortNewest",
            )}
          </option>
        ))}
      </select>

      {hasFilters ? (
        <button
          type="button"
          onClick={() =>
            setParam({ gender: null, type: null, price: null, sort: null })
          }
          className="flex items-center gap-1 rounded-full px-2.5 py-1.5 text-sm text-ink-500 transition hover:bg-ink-100"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
          {t("clearFilters")}
        </button>
      ) : null}
    </div>
  );
}
