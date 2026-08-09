import { getTranslations } from "next-intl/server";
import { House, LayoutDashboard, MessageSquare, ShieldCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { LogoutButton } from "./LogoutButton";

export async function Header() {
  const [t, tRep] = await Promise.all([
    getTranslations("Nav"),
    getTranslations("Reputation"),
  ]);

  // Null in demo mode, so the header renders its signed-out state.
  const profile = await getCurrentProfile();
  const user = profile;
  const role = profile?.role ?? null;

  return (
    <header className="sticky top-0 z-40 border-b border-ink-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 text-lg font-semibold tracking-tight text-ink-900"
        >
          <House className="h-6 w-6 text-brand-500" aria-hidden />
          <span>{t("brand")}</span>
        </Link>

        <nav className="ml-auto flex items-center gap-1 sm:gap-2">
          <Link
            href="/search"
            className="hidden rounded-full px-3 py-2 text-sm text-ink-600 transition hover:bg-ink-100 sm:block"
          >
            {t("search")}
          </Link>

          {user ? (
            <>
              {role === "owner" || role === "admin" ? (
                <Link
                  href="/dashboard"
                  className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-ink-600 transition hover:bg-ink-100"
                >
                  <LayoutDashboard className="h-4 w-4" aria-hidden />
                  <span className="hidden sm:inline">{t("dashboard")}</span>
                </Link>
              ) : (
                <>
                  <Link
                    href="/inquiries"
                    className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-ink-600 transition hover:bg-ink-100"
                  >
                    <MessageSquare className="h-4 w-4" aria-hidden />
                    <span className="hidden sm:inline">{t("myInquiries")}</span>
                  </Link>
                  {/* A tenant can always read the record hosts see. */}
                  <Link
                    href="/my-record"
                    className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-ink-600 transition hover:bg-ink-100"
                  >
                    <ShieldCheck className="h-4 w-4" aria-hidden />
                    <span className="hidden sm:inline">{tRep("myRecord")}</span>
                  </Link>
                </>
              )}
              <LogoutButton label={t("logout")} />
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-full px-3 py-2 text-sm text-ink-600 transition hover:bg-ink-100"
              >
                {t("login")}
              </Link>
              <Link
                href="/signup"
                className="rounded-full bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600"
              >
                {t("signup")}
              </Link>
            </>
          )}

          <LocaleSwitcher />
        </nav>
      </div>
    </header>
  );
}
