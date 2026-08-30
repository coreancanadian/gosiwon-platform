import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";

interface FaqItem {
  q: string;
  a: string;
}

export default async function FaqPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("Legal");
  const items = t.raw("faqItems") as FaqItem[];

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <Link href="/" className="text-sm text-ink-500 hover:text-ink-800">
        ← {t("backHome")}
      </Link>

      <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">
        {t("faqTitle")}
      </h1>

      <div className="mt-8 divide-y divide-ink-200 rounded-[var(--radius-card)] border border-ink-200">
        {items.map((item) => (
          <details key={item.q} className="group p-5 open:bg-ink-50/50">
            <summary className="cursor-pointer text-[15px] font-medium text-ink-900 marker:content-none">
              <span className="flex items-center justify-between gap-4">
                {item.q}
                <span className="shrink-0 text-ink-400 transition group-open:rotate-45">
                  +
                </span>
              </span>
            </summary>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-600">{item.a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
