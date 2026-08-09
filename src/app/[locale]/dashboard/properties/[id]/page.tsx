import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getOwnerProperty } from "@/lib/data/owner";
import { getAmenities, getPropertyAmenitySlugs } from "@/lib/data/queries";
import { PropertyEditor } from "@/components/dashboard/PropertyEditor";

export default async function EditPropertyPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const property = await getOwnerProperty(id);
  if (!property) notFound();

  const [t, amenities, slugs] = await Promise.all([
    getTranslations("Dashboard"),
    getAmenities(),
    getPropertyAmenitySlugs(property.id),
  ]);

  // The editor works in amenity ids; the shared query returns slugs.
  const slugSet = new Set(slugs);
  const selectedAmenityIds = amenities
    .filter((a) => slugSet.has(a.slug))
    .map((a) => a.id);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link
          href="/dashboard/properties"
          className="inline-flex items-center gap-1.5 text-sm text-ink-500 transition hover:text-ink-800"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {t("myProperties")}
        </Link>

        {property.is_published ? (
          <Link
            href={`/property/${property.slug}`}
            className="ml-auto inline-flex items-center gap-1.5 text-sm text-brand-600 hover:underline"
          >
            <ExternalLink className="h-4 w-4" aria-hidden />
            {property.name_ko}
          </Link>
        ) : null}
      </div>

      <PropertyEditor
        property={property}
        amenities={amenities}
        selectedAmenityIds={selectedAmenityIds}
      />
    </div>
  );
}
