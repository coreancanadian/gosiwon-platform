import { getTranslations, setRequestLocale } from "next-intl/server";
import { Plus } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getOwnerStats } from "@/lib/data/owner";

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-ink-200 p-5">
      <p className="text-sm text-ink-500">{label}</p>
      <p className="mt-1.5 text-3xl font-bold tracking-tight text-ink-900">
        {value}
      </p>
    </div>
  );
}

export default async function DashboardOverviewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("Dashboard");
  const stats = await getOwnerStats();

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label={t("pendingInquiries")}
          value={stats.pendingInquiries}
        />
        <StatTile
          label={t("publishedProperties")}
          value={stats.publishedProperties}
        />
        <StatTile label={t("totalRooms")} value={stats.totalRooms} />
      </div>

      {stats.totalProperties === 0 ? (
        <div className="mt-6 rounded-[var(--radius-card)] border border-dashed border-ink-300 bg-ink-50 px-6 py-12 text-center">
          <p className="text-sm text-ink-500">{t("noProperties")}</p>
          <Link
            href="/dashboard/properties"
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600"
          >
            <Plus className="h-4 w-4" aria-hidden />
            {t("addProperty")}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
