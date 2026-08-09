"use client";

import { useLocale } from "next-intl";
import { useParams } from "next/navigation";
import { useTransition } from "react";
import { Globe } from "lucide-react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";

const LABELS: Record<Locale, string> = { ko: "한국어", en: "English" };

export function LocaleSwitcher() {
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const [isPending, startTransition] = useTransition();

  function onChange(next: string) {
    startTransition(() => {
      // `params` carries any dynamic segments ([slug], [id]) so the same
      // page is preserved across the locale switch instead of dropping home.
      router.replace(
        // @ts-expect-error -- pathname and params are correlated at runtime
        { pathname, params },
        { locale: next as Locale },
      );
    });
  }

  return (
    <label className="relative inline-flex items-center">
      <Globe
        className="pointer-events-none absolute left-2.5 h-4 w-4 text-ink-500"
        aria-hidden
      />
      <select
        value={locale}
        onChange={(e) => onChange(e.target.value)}
        disabled={isPending}
        aria-label={LABELS[locale]}
        className="appearance-none rounded-full border border-ink-200 bg-white py-1.5 pr-3 pl-8 text-sm text-ink-700 transition hover:border-ink-300 focus:ring-2 focus:ring-brand-500 focus:outline-none disabled:opacity-60"
      >
        {routing.locales.map((l) => (
          <option key={l} value={l}>
            {LABELS[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
