import { getTranslations } from "next-intl/server";
import { BadgeCheck, Clock } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { ClaimStatus } from "@/lib/types/database";

/**
 * Shown on a listing whose real operator hasn't registered yet.
 *
 * Framed as an invitation, not a warning: the operator should read this and
 * think "my listing is already live and someone built it for me", not "there's
 * a problem with my page".
 */
export async function ClaimBanner({
  slug,
  claimStatus,
}: {
  slug: string;
  claimStatus: ClaimStatus;
}) {
  if (claimStatus === "claimed") return null;
  const t = await getTranslations("Claim");

  if (claimStatus === "pending") {
    return (
      <div className="flex items-center gap-2.5 rounded-[var(--radius-card)] border border-ink-200 bg-ink-50 px-4 py-3">
        <Clock className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />
        <p className="text-sm text-ink-600">{t("pendingBanner")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-[var(--radius-card)] border border-brand-200 bg-brand-50 px-5 py-4">
      <BadgeCheck className="h-6 w-6 shrink-0 text-brand-500" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink-900">{t("banner")}</p>
        <p className="mt-0.5 text-sm text-ink-600">{t("bannerHint")}</p>
      </div>
      <Link
        href={`/property/${slug}/claim`}
        className="shrink-0 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600"
      >
        {t("bannerCta")}
      </Link>
    </div>
  );
}
