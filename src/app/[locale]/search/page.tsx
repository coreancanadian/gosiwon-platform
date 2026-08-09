import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  getRegions,
  getFeaturedStations,
  searchProperties,
  type SearchFilters as Filters,
} from "@/lib/data/queries";
import { SearchBox, type SearchOption } from "@/components/SearchBox";
import { SearchFilters } from "@/components/SearchFilters";
import { SearchResults } from "@/components/SearchResults";
import { PRICE_BANDS } from "@/lib/search-bands";
import type { Locale } from "@/i18n/routing";
import type { GenderPolicy, PropertyType } from "@/lib/types/database";

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale }, sp] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);

  const t = await getTranslations("Search");
  const isKo = (locale as Locale) === "ko";

  const one = (key: string): string | undefined => {
    const value = sp[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const regionSlug = one("region");
  const stationSlug = one("station");
  const band = PRICE_BANDS.find((b) => b.key === one("price"));

  const filters: Filters = {
    regionSlug,
    stationSlug,
    q: one("q"),
    gender: one("gender") as GenderPolicy | undefined,
    propertyType: one("type") as PropertyType | undefined,
    minPrice: band?.min,
    maxPrice: band?.max,
    sort: (one("sort") as Filters["sort"]) ?? "recommended",
  };

  const [properties, regions, stations] = await Promise.all([
    searchProperties(filters),
    getRegions(),
    getFeaturedStations(),
  ]);

  // Heading + initial map centre come from whichever place was selected.
  const region = regions.find((r) => r.slug === regionSlug);
  const station = stations.find((s) => s.slug === stationSlug);
  const locationLabel = region
    ? isKo
      ? region.name_ko
      : region.name_en
    : station
      ? isKo
        ? station.name_ko
        : station.name_en
      : (filters.q ?? null);

  const anchor = region ?? station;
  const center =
    anchor?.lat != null && anchor?.lng != null
      ? { lat: anchor.lat, lng: anchor.lng }
      : undefined;

  const searchOptions: SearchOption[] = [
    ...regions.map((r) => ({
      kind: "region" as const,
      slug: r.slug,
      name_ko: r.name_ko,
      name_en: r.name_en,
      hint_ko: r.parent_ko,
      hint_en: r.parent_en,
    })),
    ...stations.map((s) => ({
      kind: "station" as const,
      slug: s.slug,
      name_ko: s.name_ko,
      name_en: s.name_en,
      hint_ko: s.lines_ko.join(" · "),
      hint_en: s.lines_en.join(" · "),
    })),
  ];

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <SearchBox options={searchOptions} initialQuery={filters.q ?? ""} />
      </div>

      <div className="mt-8">
        <h1 className="text-xl font-semibold tracking-tight text-ink-900 sm:text-2xl">
          {locationLabel
            ? t("resultsIn", { location: locationLabel })
            : t("resultsCount", { count: properties.length })}
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          {t("resultsCount", { count: properties.length })}
        </p>
      </div>

      <div className="mt-4 border-b border-ink-200 pb-4">
        <SearchFilters />
      </div>

      <div className="mt-6">
        <SearchResults properties={properties} center={center} />
      </div>
    </div>
  );
}
