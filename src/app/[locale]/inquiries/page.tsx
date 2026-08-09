import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { getMyInquiries } from "@/lib/data/inquiries";
import { getCurrentUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { InquiryCard } from "@/components/InquiryCard";
import { DemoModeNotice } from "@/components/DemoModeNotice";
import type { Locale } from "@/i18n/routing";

export default async function MyInquiriesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, tDash] = await Promise.all([
    getTranslations("Nav"),
    getTranslations("Dashboard"),
  ]);

  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">
          {t("myInquiries")}
        </h1>
        <div className="mt-6">
          <DemoModeNotice />
        </div>
      </div>
    );
  }

  const user = await getCurrentUser();
  if (!user) redirect({ href: "/login?next=/inquiries", locale });

  const inquiries = await getMyInquiries("tenant");

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight text-ink-900">
        {t("myInquiries")}
      </h1>

      <div className="mt-6 space-y-3">
        {inquiries.length === 0 ? (
          <p className="rounded-[var(--radius-card)] border border-ink-200 bg-ink-50 px-6 py-12 text-center text-sm text-ink-500">
            {tDash("noInquiries")}
          </p>
        ) : (
          inquiries.map((inquiry) => (
            <InquiryCard
              key={inquiry.id}
              inquiry={inquiry}
              href={`/inquiries/${inquiry.id}`}
              locale={locale as Locale}
            />
          ))
        )}
      </div>
    </div>
  );
}
