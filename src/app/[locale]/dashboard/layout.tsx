import { getTranslations, setRequestLocale } from "next-intl/server";
import { LayoutDashboard, Home, MessageSquare, BadgeCheck, LifeBuoy } from "lucide-react";
import { Link, redirect } from "@/i18n/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { getSupportUnreadCount } from "@/lib/data/support";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { DemoModeNotice } from "@/components/DemoModeNotice";

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Dashboard");

  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">
          {t("title")}
        </h1>
        <div className="mt-6">
          <DemoModeNotice />
        </div>
      </div>
    );
  }

  const profile = await getCurrentProfile();
  if (!profile) {
    redirect({ href: "/login?next=/dashboard", locale });
    return null;
  }
  // Tenants have no listings to manage; send them to their own inquiry list.
  if (profile.role !== "owner" && profile.role !== "admin") {
    redirect({ href: "/inquiries", locale });
    return null;
  }

  const [tAdmin, tSupport, supportUnread] = await Promise.all([
    getTranslations("Admin"),
    getTranslations("Support"),
    getSupportUnreadCount(profile.role),
  ]);

  const navItems: Array<{
    href: string;
    label: string;
    icon: typeof Home;
    badge?: number;
  }> = [
    { href: "/dashboard", label: t("overview"), icon: LayoutDashboard },
    { href: "/dashboard/properties", label: t("myProperties"), icon: Home },
    { href: "/dashboard/inquiries", label: t("inquiries"), icon: MessageSquare },
    // Approving operator claims transfers a listing, so it stays admin-only.
    ...(profile.role === "admin"
      ? [{ href: "/dashboard/claims", label: tAdmin("claims"), icon: BadgeCheck }]
      : []),
    // Admins read every conversation in the inbox; hosts write to the team.
    profile.role === "admin"
      ? { href: "/dashboard/support", label: tSupport("inboxTitle"), icon: LifeBuoy, badge: supportUnread }
      : { href: "/support", label: tSupport("navLabel"), icon: LifeBuoy, badge: supportUnread },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight text-ink-900">
        {t("title")}
      </h1>

      <nav className="mt-6 flex gap-1 overflow-x-auto border-b border-ink-200 pb-px no-scrollbar">
        {navItems.map(({ href, label, icon: Icon, badge }) => (
          <Link
            key={href}
            href={href}
            className="flex shrink-0 items-center gap-2 rounded-t-lg px-4 py-2.5 text-sm font-medium text-ink-600 transition hover:bg-ink-50 hover:text-ink-900"
          >
            <Icon className="h-4 w-4" aria-hidden />
            {label}
            {badge ? (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-500 px-1.5 text-[11px] font-semibold text-white">
                {badge}
              </span>
            ) : null}
          </Link>
        ))}
      </nav>

      <div className="mt-8">{children}</div>
    </div>
  );
}
