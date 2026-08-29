import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  getRegionsByTier,
  getFeaturedStations,
  getUniversities,
} from "@/lib/data/queries";
import { SearchBox, type SearchOption } from "@/components/SearchBox";
import { PlaceTile } from "@/components/PlaceTile";
import type { Locale } from "@/i18n/routing";
import type { Region, SubwayStation, University } from "@/lib/types/database";

function TileGrid({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-14">
      <h2 className="text-xl font-semibold tracking-tight text-ink-900 sm:text-2xl">
        {heading}
      </h2>
      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {children}
      </div>
    </section>
  );
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("Home");
  // Featured tiles for the three groups; the full university list feeds search.
  const [{ seoul }, stations, featuredUniversities, allUniversities] =
    await Promise.all([
      getRegionsByTier(),
      getFeaturedStations(),
      getUniversities(true),
      getUniversities(),
    ]);

  const isKo = (locale as Locale) === "ko";
  const regionName = (r: Region) => (isKo ? r.name_ko : r.name_en);
  const regionParent = (r: Region) => (isKo ? r.parent_ko : r.parent_en);
  const stationName = (s: SubwayStation) => (isKo ? s.name_ko : s.name_en);
  const stationLines = (s: SubwayStation) =>
    (isKo ? s.lines_ko : s.lines_en).join(" · ");
  const universityName = (u: University) =>
    isKo ? (u.short_name_ko ?? u.name_ko) : u.name_en;

  /**
   * One flat autocomplete list across all three groups, so a visitor can type a
   * district, a station, or a school without choosing a mode first. Every
   * university is searchable even though only eight get a tile.
   */
  const searchOptions: SearchOption[] = [
    ...seoul.map((r) => ({
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
    ...allUniversities.map((u) => ({
      kind: "university" as const,
      slug: u.slug,
      name_ko: u.name_ko,
      name_en: u.name_en,
      hint_ko: u.city_ko,
      hint_en: u.city_ko,
    })),
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 pb-8 sm:px-6">
      <section className="pt-12 pb-2 text-center sm:pt-20">
        <h1 className="mx-auto max-w-3xl text-3xl font-bold tracking-tight text-balance text-ink-900 sm:text-5xl">
          {t("title")}
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-pretty text-ink-500 sm:text-lg">
          {t("subtitle")}
        </p>
        <div className="mx-auto mt-8 max-w-2xl">
          <SearchBox options={searchOptions} />
        </div>
      </section>

      <TileGrid heading={t("seoulHeading")}>
        {seoul.map((r) => (
          <PlaceTile
            key={r.slug}
            href={`/search?region=${r.slug}`}
            slug={r.slug}
            title={regionName(r)}
            subtitle={regionParent(r)}
            imageUrl={r.image_url}
            kind="region"
          />
        ))}
      </TileGrid>

      <TileGrid heading={t("subwayHeading")}>
        {stations.map((s) => (
          <PlaceTile
            key={s.slug}
            href={`/search?station=${s.slug}`}
            slug={s.slug}
            title={stationName(s)}
            subtitle={stationLines(s)}
            imageUrl={s.image_url}
            kind="station"
            lines={s.lines_ko}
          />
        ))}
      </TileGrid>

      {featuredUniversities.length > 0 ? (
        <TileGrid heading={t("universityHeading")}>
          {featuredUniversities.map((u) => (
            <PlaceTile
              key={u.slug}
              href={`/search?university=${u.slug}`}
              slug={u.slug}
              title={universityName(u)}
              subtitle={
                u.listing_count > 0 ? t("listingCount", { count: u.listing_count }) : u.city_ko
              }
              imageUrl={u.image_url}
              kind="university"
            />
          ))}
        </TileGrid>
      ) : null}
    </div>
  );
}
