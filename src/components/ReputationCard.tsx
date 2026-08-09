import { getTranslations } from "next-intl/server";
import { ShieldCheck, EyeOff } from "lucide-react";
import type { ApplicantReputation } from "@/lib/types/database";

function ScoreBar({ label, value }: { label: string; value: number | null }) {
  if (value == null) return null;
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));

  return (
    <div className="flex items-center gap-3">
      <span className="w-32 shrink-0 text-xs text-ink-500">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-200">
        <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 shrink-0 text-right text-xs font-medium text-ink-700">
        {value.toFixed(1)}
      </span>
    </div>
  );
}

/**
 * The applicant's track record, shown to a prospective host at the moment they
 * accept or decline.
 *
 * `reputation` is null when the tenant did not attach their record — the RPC
 * enforces that, so this component can render the "not shared" state honestly
 * without ever having seen the underlying data.
 */
export async function ReputationCard({
  reputation,
}: {
  reputation: ApplicantReputation | null;
}) {
  const t = await getTranslations("Reputation");

  if (!reputation) {
    return (
      <div className="flex items-start gap-2.5 rounded-[var(--radius-card)] border border-ink-200 bg-ink-50 p-4">
        <EyeOff className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" aria-hidden />
        <p className="text-sm text-ink-500">{t("notShared")}</p>
      </div>
    );
  }

  if (reputation.reviews_count === 0) {
    return (
      <div className="rounded-[var(--radius-card)] border border-ink-200 p-4">
        <p className="text-sm font-medium text-ink-700">{t("noRecord")}</p>
        <p className="mt-1 text-sm text-ink-500">{t("noRecordHint")}</p>
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius-card)] border border-ink-200 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-brand-500" aria-hidden />
        <h3 className="text-base font-semibold text-ink-900">{t("title")}</h3>
        {reputation.avg_overall != null ? (
          <span className="ml-auto text-2xl font-bold text-ink-900">
            {reputation.avg_overall.toFixed(1)}
            <span className="text-sm font-normal text-ink-400"> / 5</span>
          </span>
        ) : null}
      </div>

      <p className="mt-1 text-xs text-ink-500">
        {t("staysCompleted")} {reputation.stays_completed} ·{" "}
        {t("reviewsCount", { count: reputation.reviews_count })}
      </p>

      <div className="mt-4 space-y-2">
        <ScoreBar label={t("payment")} value={reputation.avg_payment} />
        <ScoreBar label={t("cleanliness")} value={reputation.avg_cleanliness} />
        <ScoreBar label={t("quietHours")} value={reputation.avg_quiet_hours} />
        <ScoreBar label={t("communication")} value={reputation.avg_communication} />
        <ScoreBar
          label={t("ruleCompliance")}
          value={reputation.avg_rule_compliance}
        />
      </div>
    </div>
  );
}
