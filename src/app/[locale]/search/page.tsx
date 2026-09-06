import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  getRegions,
  getFeaturedStations,
  getUniversities,
  getUniversityBySlug,
  searchProperties,
  type SearchFilters as Filters,
} from "@/lib/data/queries";
import { SearchBox, type SearchOption } from "@/components/SearchBox";
import { SearchFilters } from "@/components/SearchFilters";
import { SearchResults } from "@/components/SearchResults";
import { PRICE_BANDS } from "@/lib/search-bands";
import type { Locale } from "@/i18n/routing";
import type {
  GenderPolicy,
  HousingCategory,
  PropertyType,
} from "@/lib/types/database";

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
  const universitySlug = one("university");
  const band = PRICE_BANDS.find((b) => b.key === one("price"));

  const filters: Filters = {
    regionSlug,
    stationSlug,
    q: one("q"),
    gender: one("gender") as GenderPolicy | undefined,
    propertyType: one("type") as PropertyType | undefined,
    housingCategory: one("category") as HousingCategory | undefined,
    minPrice: band?.min,
    maxPrice: band?.max,
    sort: (one("sort") as Filters["sort"]) ?? "recommended",
  };

  // A university is addressed by slug in the URL but matched by its exact
  // Korean name inside properties.nearby_universities.
  const university = universitySlug
    ? await getUniversityBySlug(universitySlug)
    : null;
  if (university) filters.university = university.name_ko;

  const [properties, regions, stations, universities] = await Promise.all([
    searchProperties(filters),
    getRegions(),
    getFeaturedStations(),
    getUniversities(),
  ]);

  // Heading + initial map centre come from whichever place was selected.
  const region = regions.find((r) => r.slug === regionSlug);
  const station = stations.find((s) => s.slug === stationSlug);
  const regionLabel = region ? (isKo ? region.name_ko : region.name_en) : "";
  const stationLabel = station ? (isKo ? station.name_ko : station.name_en) : "";
  const universityLabel = university
    ? isKo
      ? (university.short_name_ko ?? university.name_ko)
      : university.name_en
    : "";

  const locationLabel = region
    ? isKo
      ? region.name_ko
      : region.name_en
    : station
      ? isKo
        ? station.name_ko
        : station.name_en
      : university
        ? isKo
          ? (university.short_name_ko ?? university.name_ko)
          : university.name_en
        : (filters.q ?? null);

  const anchor = region ?? station ?? university;
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
    ...universities.map((u) => ({
      kind: "university" as const,
      slug: u.slug,
      name_ko: u.name_ko,
      name_en: u.name_en,
      hint_ko: u.city_ko,
      hint_en: u.city_ko,
    })),
  ];

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <SearchBox options={searchOptions} initialQuery={filters.q ?? ""} />
      </div>

      <div className="mt-8">
        <h1 className="text-xl font-semibold tracking-tight text-ink-900 sm:text-2xl">
          {locationLabel ? t("resultsIn", { location: locationLabel }) : t("browseAll")}
        </h1>
      </div>

      <div className="mt-4 border-b border-ink-200 pb-4">
        <SearchFilters />
      </div>

      <div className="mt-6">
        <SearchResults
          properties={properties}
          center={center}
          /* Attribute filters only. The place deliberately does NOT travel to
             the client: it seeds the first result set and the viewport, but
             once the user is moving the map, filtering by the school or
             district they started from would hide listings plainly visible on
             screen. */
          filters={{
            gender: filters.gender,
            propertyType: filters.propertyType,
            housingCategory: filters.housingCategory,
            minPrice: filters.minPrice,
            maxPrice: filters.maxPrice,
          }}
          place={
            region
              ? {
                  param: "region",
                  slug: region.slug,
                  label: regionLabel,
                  geocodeQuery: [region.name_en, region.parent_en, "South Korea"]
                    .filter(Boolean)
                    .join(", "),
                }
              : station
                ? {
                    param: "station",
                    slug: station.slug,
                    label: stationLabel,
                    geocodeQuery: `${station.name_en}, South Korea`,
                  }
                : university
                  ? {
                      param: "university",
                      slug: university.slug,
                      label: universityLabel,
                      geocodeQuery: [university.name_en, university.city_en, "South Korea"]
                        .filter(Boolean)
                        .join(", "),
                    }
                  : null
          }
        />
      </div>
    </div>
  );
}
