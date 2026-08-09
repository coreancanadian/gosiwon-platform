import { getTranslations, setRequestLocale } from "next-intl/server";
import { LayoutDashboard, Home, MessageSquare } from "lucide-react";
import { Link, redirect } from "@/i18n/navigation";
import { getCurrentProfile } from "@/lib/auth";
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

  const navItems = [
    { href: "/dashboard", label: t("overview"), icon: LayoutDashboard },
    { href: "/dashboard/properties", label: t("myProperties"), icon: Home },
    { href: "/dashboard/inquiries", label: t("inquiries"), icon: MessageSquare },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight text-ink-900">
        {t("title")}
      </h1>

      <nav className="mt-6 flex gap-1 overflow-x-auto border-b border-ink-200 pb-px no-scrollbar">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex shrink-0 items-center gap-2 rounded-t-lg px-4 py-2.5 text-sm font-medium text-ink-600 transition hover:bg-ink-50 hover:text-ink-900"
          >
            <Icon className="h-4 w-4" aria-hidden />
            {label}
          </Link>
        ))}
      </nav>

      <div className="mt-8">{children}</div>
    </div>
  );
}
