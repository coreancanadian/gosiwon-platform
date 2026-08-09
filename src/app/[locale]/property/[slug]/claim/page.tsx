import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Check, LogIn } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getPropertyBySlug } from "@/lib/data/queries";
import { getCurrentUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { ClaimForm } from "@/components/ClaimForm";
import { DemoModeNotice } from "@/components/DemoModeNotice";
import type { Locale } from "@/i18n/routing";

export default async function ClaimPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const property = await getPropertyBySlug(slug);
  if (!property) notFound();

  const t = await getTranslations("Claim");
  const user = await getCurrentUser();
  const isKo = (locale as Locale) === "ko";
  const name = (isKo ? property.name_ko : property.name_en) || property.name_ko;

  return (
    <div className="mx-auto max-w-xl px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight text-ink-900">
        {t("title", { property: name })}
      </h1>
      <p className="mt-2 text-sm text-ink-500">{t("subtitle")}</p>

      {/* Lead with what they gain, not with what we need from them. */}
      <div className="mt-6 rounded-[var(--radius-card)] border border-ink-200 bg-ink-50 p-5">
        <p className="text-sm font-semibold text-ink-900">{t("whatYouGet")}</p>
        <ul className="mt-3 space-y-2">
          {["benefit1", "benefit2", "benefit3"].map((key) => (
            <li key={key} className="flex items-start gap-2 text-sm text-ink-600">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" aria-hidden />
              {t(key)}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-8">
        {!isSupabaseConfigured() ? (
          <DemoModeNotice />
        ) : property.claim_status === "claimed" ? (
          <p className="rounded-[var(--radius-card)] border border-ink-200 bg-ink-50 px-6 py-10 text-center text-sm text-ink-500">
            {t("alreadyClaimed")}
          </p>
        ) : !user ? (
          <div className="rounded-[var(--radius-card)] border border-ink-200 bg-ink-50 p-6 text-center">
            <p className="text-base font-semibold text-ink-900">
              {t("loginRequired")}
            </p>
            <Link
              href={`/signup?role=owner&next=/property/${slug}/claim`}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600"
            >
              <LogIn className="h-4 w-4" aria-hidden />
              {t("loginRequired")}
            </Link>
          </div>
        ) : (
          <ClaimForm propertySlug={slug} />
        )}
      </div>
    </div>
  );
}
