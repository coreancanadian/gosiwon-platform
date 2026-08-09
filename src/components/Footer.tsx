import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export async function Footer() {
  const [t, tNav] = await Promise.all([
    getTranslations("Footer"),
    getTranslations("Nav"),
  ]);

  return (
    <footer className="mt-20 border-t border-ink-200 bg-ink-50">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-2">
          <p className="text-base font-semibold text-ink-900">{tNav("brand")}</p>
          <p className="mt-2 max-w-sm text-sm text-ink-500">{t("tagline")}</p>
        </div>

        <div>
          <p className="text-sm font-semibold text-ink-900">{t("forHosts")}</p>
          <ul className="mt-3 space-y-2 text-sm text-ink-500">
            <li>
              <Link href="/signup?role=owner" className="hover:text-brand-600">
                {t("listYourProperty")}
              </Link>
            </li>
            <li>
              <Link href="/dashboard" className="hover:text-brand-600">
                {tNav("dashboard")}
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <p className="text-sm font-semibold text-ink-900">{t("legal")}</p>
          <ul className="mt-3 space-y-2 text-sm text-ink-500">
            <li>
              <Link href="/faq" className="hover:text-brand-600">
                {tNav("faq")}
              </Link>
            </li>
            <li>
              <Link href="/terms" className="hover:text-brand-600">
                {tNav("terms")}
              </Link>
            </li>
            <li>
              <Link href="/privacy" className="hover:text-brand-600">
                {tNav("privacy")}
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-ink-200 py-6 text-center text-xs text-ink-400">
        {t("copyright", { year: new Date().getFullYear() })}
      </div>
    </footer>
  );
}
