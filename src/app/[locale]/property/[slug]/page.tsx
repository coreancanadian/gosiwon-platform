import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  Users,
  CalendarRange,
  Building,
  Languages,
  MapPin,
  TrainFront,
  GraduationCap,
  Ruler,
  Wallet,
  CirclePlay,
} from "lucide-react";
import {
  getPropertyBySlug,
  getPropertyAmenitySlugs,
  getPropertyStations,
  getAmenities,
} from "@/lib/data/queries";
import { PhotoGallery, type GalleryImage } from "@/components/PhotoGallery";
import { AmenitySection } from "@/components/AmenitySection";
import { ContactHostCard } from "@/components/ContactHostCard";
import { ClaimBanner } from "@/components/ClaimBanner";
import { MapView } from "@/components/MapView";
import { GenderGradientDefs } from "@/components/GenderGradientDefs";
import type { Locale } from "@/i18n/routing";
import { formatKrw, formatSqm } from "@/lib/format";
import { publicImageUrl } from "@/lib/storage";
import {
  housingCategoryOf,
  type PropertyWithRelations,
} from "@/lib/types/database";

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const property = await getPropertyBySlug(slug);
  if (!property) return {};

  const isKo = (locale as Locale) === "ko";
  return {
    title: (isKo ? property.name_ko : property.name_en) || property.name_ko,
    description:
      (isKo ? property.description_ko : property.description_en) ?? undefined,
  };
}

/** Compact label/value pair used across the property header. */
function Fact({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" aria-hidden />
      <div className="min-w-0">
        <p className="text-xs text-ink-400">{label}</p>
        <p className="text-sm font-medium text-ink-800">{value}</p>
      </div>
    </div>
  );
}

export default async function PropertyPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const property = (await getPropertyBySlug(slug)) as PropertyWithRelations | null;
  if (!property) notFound();

  const [t, tEnum, tSearch, amenities, amenitySlugs, stations] = await Promise.all([
    getTranslations("Property"),
    getTranslations("Enums"),
    getTranslations("Search"),
    getAmenities(),
    getPropertyAmenitySlugs(property.id),
    getPropertyStations(property.id),
  ]);

  const isKo = (locale as Locale) === "ko";
  const loc = locale as Locale;

  const name = (isKo ? property.name_ko : property.name_en) || property.name_ko;
  const address =
    (isKo ? property.address_ko : property.address_en) || property.address_ko;
  const description = isKo ? property.description_ko : property.description_en;

  const images: GalleryImage[] = [...property.property_images]
    .sort((a, b) => Number(b.is_cover) - Number(a.is_cover) || a.sort_order - b.sort_order)
    .map((img) => ({
      url: publicImageUrl(img.storage_path),
      alt: (isKo ? img.alt_ko : img.alt_en) ?? name,
    }));

  const ageValue =
    property.age_min != null || property.age_max != null
      ? t("ageRangeValue", {
          min: property.age_min ?? "-",
          max: property.age_max ?? "-",
        })
      : t("ageNoLimit");

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      {property.claim_status !== "claimed" ? (
        <div className="mb-5">
          <ClaimBanner slug={property.slug} claimStatus={property.claim_status} />
        </div>
      ) : null}

      <PhotoGallery images={images} />

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* ---------------- Main column ---------------- */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {/* Private vs shared reads first — it's the biggest difference
                between a 고시원 and a 셰어하우스. */}
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                housingCategoryOf(property.property_type) === "shared"
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-sky-100 text-sky-800"
              }`}
            >
              {tEnum(`housingCategory.${housingCategoryOf(property.property_type)}`)}
            </span>
            <span className="rounded-full bg-ink-100 px-2.5 py-1 text-xs font-medium text-ink-600">
              {tEnum(`propertyType.${property.property_type}`)}
            </span>
            {property.gender !== "any" ? (
              <span className="rounded-full bg-brand-100 px-2.5 py-1 text-xs font-medium text-brand-700">
                {tEnum(`gender.${property.gender}`)}
              </span>
            ) : null}
          </div>

          <h1 className="mt-3 text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">
            {name}
          </h1>

          <p className="mt-2 flex items-start gap-1.5 text-sm text-ink-500">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {address}
            {property.address_detail ? ` ${property.address_detail}` : ""}
          </p>

          {/* Header facts — mirrors the reference site's spec block */}
          <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-y border-ink-200 py-5 sm:grid-cols-3">
            <Fact
              icon={Users}
              label={t("genderLabel")}
              value={tEnum(`gender.${property.gender}`)}
            />
            <Fact icon={CalendarRange} label={t("ageRange")} value={ageValue} />
            {property.floors_total ? (
              <Fact
                icon={Building}
                label={t("floors")}
                value={
                  property.floors_used
                    ? `${t("floorsTotal", { count: property.floors_total })} · ${property.floors_used}`
                    : t("floorsTotal", { count: property.floors_total })
                }
              />
            ) : null}
            {property.languages.length > 0 ? (
              <Fact
                icon={Languages}
                label={t("languages")}
                value={property.languages.join(", ")}
              />
            ) : null}
            {stations.length > 0 ? (
              <Fact
                icon={TrainFront}
                label={t("nearbyStations")}
                value={stations
                  .map(({ station, walkMinutes }) => {
                    const sName = isKo ? station.name_ko : station.name_en;
                    return walkMinutes != null
                      ? `${sName} · ${tSearch("walkMinutes", { minutes: walkMinutes })}`
                      : sName;
                  })
                  .join("   ")}
              />
            ) : null}
            {property.nearby_universities.length > 0 ? (
              <Fact
                icon={GraduationCap}
                label={t("nearbyUniversities")}
                value={property.nearby_universities.join(" · ")}
              />
            ) : null}
          </div>

          {description ? (
            <section className="border-b border-ink-200 py-8">
              <h2 className="text-xl font-semibold tracking-tight text-ink-900">
                {t("about")}
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed whitespace-pre-line text-ink-600">
                {description}
              </p>

              {property.video_url ? (
                <a
                  href={property.video_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-2 rounded-lg border border-ink-300 px-4 py-2.5 text-sm font-medium text-ink-800 transition hover:bg-ink-50"
                >
                  <CirclePlay className="h-4 w-4 text-brand-500" aria-hidden />
                  {t("watchVideo")}
                </a>
              ) : null}
            </section>
          ) : null}

          {/* ---------------- Rooms ----------------
              Only rendered when the host has itemised rooms. Imported listings
              carry a rent range on the property instead. */}
          {property.rooms.length > 0 ? (
          <section id="rooms" className="scroll-mt-20 border-b border-ink-200 py-8">
            <h2 className="text-xl font-semibold tracking-tight text-ink-900">
              {t("rooms")}
            </h2>

            <div className="mt-5 space-y-3">
              {[...property.rooms]
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((room) => (
                  <div
                    key={room.id}
                    className={`rounded-[var(--radius-card)] border p-4 ${
                      room.is_available
                        ? "border-ink-200"
                        : "border-ink-200 bg-ink-50 opacity-70"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-base font-semibold text-ink-900">
                          {room.name}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-500">
                          <span className="flex items-center gap-1">
                            <Wallet className="h-3.5 w-3.5" aria-hidden />
                            {t("deposit")} {formatKrw(room.deposit, loc)}
                          </span>
                          {room.size_sqm ? (
                            <span className="flex items-center gap-1">
                              <Ruler className="h-3.5 w-3.5" aria-hidden />
                              {formatSqm(room.size_sqm, loc)}
                            </span>
                          ) : null}
                          <span className="flex items-center gap-1">
                            <CalendarRange className="h-3.5 w-3.5" aria-hidden />
                            {room.min_contract_days
                              ? t("contractMin", { days: room.min_contract_days })
                              : t("contractUnlimited")}
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        <p className="text-lg font-semibold text-ink-900">
                          {formatKrw(room.monthly_rent, loc)}
                        </p>
                        <p className="text-xs text-ink-500">{t("perMonth")}</p>
                      </div>
                    </div>

                    {!room.is_available ? (
                      <p className="mt-2 text-xs font-medium text-brand-600">
                        {t("unavailable")}
                      </p>
                    ) : null}
                  </div>
                ))}
            </div>
          </section>
          ) : null}

          <AmenitySection amenities={amenities} slugs={amenitySlugs} />

          {/* ---------------- Location ---------------- */}
          <section className="border-t border-ink-200 py-8">
            <h2 className="text-xl font-semibold tracking-tight text-ink-900">
              {t("location")}
            </h2>
            <p className="mt-1.5 text-sm text-ink-500">{address}</p>

            <GenderGradientDefs />
            <div className="mt-4 h-80 w-full overflow-hidden rounded-[var(--radius-card)]">
              {property.lat != null && property.lng != null ? (
                <MapView
                  markers={[
                    {
                      id: property.id,
                      lat: property.lat,
                      lng: property.lng,
                      label: name,
                      gender: property.gender,
                    },
                  ]}
                  center={{ lat: property.lat, lng: property.lng }}
                  className="h-full w-full"
                />
              ) : null}
            </div>
          </section>
        </div>

        {/* ---------------- Sticky sidebar ---------------- */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <ContactHostCard property={property} locale={loc} />
        </aside>
      </div>
    </div>
  );
}
