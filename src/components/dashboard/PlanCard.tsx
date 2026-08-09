import { getLocale, getTranslations } from "next-intl/server";
import { Check, Sparkles } from "lucide-react";
import type { Locale } from "@/i18n/routing";
import { formatKrw } from "@/lib/format";
import type { HostPlan } from "@/lib/data/plan";

/**
 * The host's plan, shown as standing rather than as a meter running down.
 *
 * There is intentionally no expiry date, no "days remaining", no progress bar,
 * and no upgrade prompt. A host reading this should come away thinking they are
 * on a good plan — not that they are on the clock.
 */
export async function PlanCard({ hostPlan }: { hostPlan: HostPlan | null }) {
  if (!hostPlan) return null;

  const t = await getTranslations("Plan");
  const locale = (await getLocale()) as Locale;
  const { plan } = hostPlan;
  const isKo = locale === "ko";

  const description = isKo ? plan.description_ko : plan.description_en;

  const features: Array<{ label: string; value: string }> = [
    {
      label: t("featureListings"),
      value:
        plan.features.listings === null
          ? t("unlimited")
          : String(plan.features.listings ?? "—"),
    },
    {
      label: t("featurePhotos"),
      value: String(plan.features.photos_per_listing ?? "—"),
    },
    {
      label: t("featureInquiries"),
      value:
        plan.features.inquiries === null
          ? t("unlimited")
          : String(plan.features.inquiries ?? "—"),
    },
  ];

  return (
    <div className="rounded-[var(--radius-card)] border border-ink-200 bg-gradient-to-br from-brand-50 to-white p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="h-5 w-5 text-brand-500" aria-hidden />
        <p className="text-xs font-medium tracking-wide text-ink-500 uppercase">
          {t("yourPlan")}
        </p>
      </div>

      <div className="mt-2 flex flex-wrap items-baseline gap-2">
        <h2 className="text-xl font-bold tracking-tight text-ink-900">
          {isKo ? plan.name_ko : plan.name_en}
        </h2>
        <span className="text-sm font-medium text-brand-700">
          {plan.monthly_price_krw === 0
            ? t("priceFree")
            : `${formatKrw(plan.monthly_price_krw, locale)}${t("perMonth")}`}
        </span>
      </div>

      {description ? (
        <p className="mt-2 text-sm text-ink-600">{description}</p>
      ) : null}

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {features.map((f) => (
          <div key={f.label} className="rounded-lg bg-white/70 px-3 py-2">
            <p className="text-xs text-ink-500">{f.label}</p>
            <p className="text-sm font-semibold text-ink-800">{f.value}</p>
          </div>
        ))}
      </div>

      {plan.features.tenant_reputation ? (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-ink-600">
          <Check className="h-4 w-4 text-brand-500" aria-hidden />
          {t("featureReputation")}
        </p>
      ) : null}
    </div>
  );
}
