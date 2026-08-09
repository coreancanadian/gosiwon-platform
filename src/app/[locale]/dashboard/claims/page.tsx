import { getTranslations, setRequestLocale } from "next-intl/server";
import { Phone } from "lucide-react";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { ClaimReviewActions } from "@/components/dashboard/ClaimReviewActions";
import type { Locale } from "@/i18n/routing";

interface ClaimRow {
  id: string;
  evidence: string | null;
  contact_phone: string | null;
  created_at: string;
  properties: { slug: string; name_ko: string; name_en: string | null } | null;
  profiles: { full_name: string | null } | null;
}

/** Admin-only queue for approving operator claims on imported listings. */
export default async function ClaimsReviewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, tAdmin] = await Promise.all([
    getTranslations("Claim"),
    getTranslations("Admin"),
  ]);

  if (!isSupabaseConfigured()) return null;

  const profile = await getCurrentProfile();
  if (profile?.role !== "admin") {
    redirect({ href: "/dashboard", locale });
    return null;
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("property_claims")
    .select(
      "id, evidence, contact_phone, created_at, properties (slug, name_ko, name_en), profiles (full_name)",
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  const claims = (data ?? []) as unknown as ClaimRow[];
  const isKo = (locale as Locale) === "ko";

  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight text-ink-900">
        {tAdmin("claims")}
      </h2>

      <div className="mt-5 space-y-4">
        {claims.length === 0 ? (
          <p className="rounded-[var(--radius-card)] border border-ink-200 bg-ink-50 px-6 py-12 text-center text-sm text-ink-500">
            {t("noClaims")}
          </p>
        ) : (
          claims.map((claim) => {
            const name = claim.properties
              ? (isKo ? claim.properties.name_ko : claim.properties.name_en) ||
                claim.properties.name_ko
              : "—";

            return (
              <div
                key={claim.id}
                className="rounded-[var(--radius-card)] border border-ink-200 p-5"
              >
                <p className="text-base font-semibold text-ink-900">{name}</p>
                <p className="mt-0.5 text-xs text-ink-400">
                  {tAdmin("claimant")}: {claim.profiles?.full_name ?? "—"} ·{" "}
                  {tAdmin("submittedAt")}{" "}
                  {new Date(claim.created_at).toLocaleDateString()}
                </p>

                {claim.contact_phone ? (
                  <p className="mt-2 flex items-center gap-1.5 text-sm text-ink-600">
                    <Phone className="h-3.5 w-3.5 text-ink-400" aria-hidden />
                    {claim.contact_phone}
                  </p>
                ) : null}

                {claim.evidence ? (
                  <div className="mt-3 rounded-lg bg-ink-50 p-3">
                    <p className="text-xs font-medium text-ink-500">
                      {tAdmin("evidence")}
                    </p>
                    <p className="mt-1 text-sm whitespace-pre-line text-ink-700">
                      {claim.evidence}
                    </p>
                  </div>
                ) : null}

                <div className="mt-4">
                  <ClaimReviewActions claimId={claim.id} />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
