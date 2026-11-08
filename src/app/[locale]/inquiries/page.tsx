import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChevronRight, LifeBuoy } from "lucide-react";
import { Link, redirect } from "@/i18n/navigation";
import { getMyInquiries } from "@/lib/data/inquiries";
import { getSupportUnreadCount } from "@/lib/data/support";
import { getCurrentProfile } from "@/lib/auth";
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

  const [t, tDash, tSupport] = await Promise.all([
    getTranslations("Nav"),
    getTranslations("Dashboard"),
    getTranslations("Support"),
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

  const profile = await getCurrentProfile();
  if (!profile) {
    redirect({ href: "/login?next=/inquiries", locale });
    return null;
  }

  // The admin answers these from the dashboard inbox, not as a member.
  const showTeamCard = profile.role !== "admin";
  const [inquiries, teamUnread] = await Promise.all([
    getMyInquiries("tenant"),
    showTeamCard ? getSupportUnreadCount(profile.role) : 0,
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight text-ink-900">
        {t("myInquiries")}
      </h1>

      {showTeamCard ? (
        <Link
          href="/support"
          className="mt-6 flex items-center gap-3 rounded-[var(--radius-card)] border border-ink-200 p-4 transition hover:border-brand-400"
        >
          <LifeBuoy className="h-5 w-5 shrink-0 text-brand-600" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 text-sm font-semibold text-ink-900">
              {tSupport("teamName")}
              {teamUnread > 0 ? (
                <span className="rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-bold text-white">
                  {tSupport("newBadge")}
                </span>
              ) : null}
            </span>
            <span className="mt-0.5 block text-sm text-ink-500">{tSupport("teamCardBody")}</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />
        </Link>
      ) : null}

      <div className="mt-3 space-y-3">
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
