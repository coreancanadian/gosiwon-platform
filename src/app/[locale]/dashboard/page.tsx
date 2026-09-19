import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowRight, Gift, Plus } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { getOwnerStats } from "@/lib/data/owner";
import { getHostPlan } from "@/lib/data/plan";
import { PlanCard } from "@/components/dashboard/PlanCard";

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

  const [t, tSupport, stats, hostPlan, profile] = await Promise.all([
    getTranslations("Dashboard"),
    getTranslations("Support"),
    getOwnerStats(),
    getHostPlan(),
    getCurrentProfile(),
  ]);

  return (
    <div>
      {profile?.role === "owner" ? (
        <Link
          href="/support?topic=business"
          className="mb-6 flex items-center gap-3 rounded-[var(--radius-card)] border border-brand-200 bg-brand-50 p-4 transition hover:bg-brand-100/60"
        >
          <Gift className="h-5 w-5 shrink-0 text-brand-600" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ink-900">{tSupport("hostBonusTitle")}</span>
            <span className="mt-0.5 block text-sm text-ink-600">{tSupport("hostBonusBody")}</span>
          </span>
          <span className="hidden shrink-0 items-center gap-1 text-sm font-semibold text-brand-700 sm:flex">
            {tSupport("hostBonusCta")}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </span>
        </Link>
      ) : null}

      <div className="mb-6">
        <PlanCard hostPlan={hostPlan} />
      </div>

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
