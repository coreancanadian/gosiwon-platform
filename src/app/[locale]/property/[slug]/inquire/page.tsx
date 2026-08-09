import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LogIn } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getPropertyBySlug } from "@/lib/data/queries";
import { getCurrentUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { InquiryForm } from "@/components/InquiryForm";
import { DemoModeNotice } from "@/components/DemoModeNotice";
import type { Locale } from "@/i18n/routing";
import type { PropertyWithRelations } from "@/lib/types/database";

export default async function InquirePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const property = (await getPropertyBySlug(slug)) as PropertyWithRelations | null;
  if (!property) notFound();

  const t = await getTranslations("Inquiry");
  const user = await getCurrentUser();
  const isKo = (locale as Locale) === "ko";
  const name = (isKo ? property.name_ko : property.name_en) || property.name_ko;

  return (
    <div className="mx-auto max-w-xl px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight text-ink-900">
        {t("title", { property: name })}
      </h1>
      <p className="mt-2 text-sm text-ink-500">{t("subtitle")}</p>

      <div className="mt-8">
        {!isSupabaseConfigured() ? (
          <DemoModeNotice />
        ) : !user ? (
          <div className="rounded-[var(--radius-card)] border border-ink-200 bg-ink-50 p-6 text-center">
            <p className="text-base font-semibold text-ink-900">
              {t("loginRequired")}
            </p>
            <p className="mt-1.5 text-sm text-ink-500">
              {t("loginRequiredHint")}
            </p>
            <Link
              href={`/login?next=/property/${slug}/inquire`}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600"
            >
              <LogIn className="h-4 w-4" aria-hidden />
              {t("loginRequired")}
            </Link>
          </div>
        ) : (
          <InquiryForm propertySlug={slug} rooms={property.rooms} />
        )}
      </div>
    </div>
  );
}
