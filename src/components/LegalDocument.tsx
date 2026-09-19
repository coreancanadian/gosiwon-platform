import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

interface Section {
  heading: string;
  body: string;
}

/**
 * Shared shell for Terms and Privacy: a title, a last-updated stamp, and a
 * list of heading/body sections pulled via t.raw() since next-intl only
 * interpolates strings, not arrays.
 *
 * The content itself is a plain-language description of what this specific
 * site actually does — not boilerplate — but it is not a substitute for
 * review by a lawyer before real commercial launch.
 */
export async function LegalDocument({
  titleKey,
  sectionsKey,
  updatedOn,
}: {
  titleKey: "termsTitle" | "privacyTitle";
  sectionsKey: "termsSections" | "privacySections";
  /** ISO date this document last actually changed — bump it when editing the text. */
  updatedOn: string;
}) {
  const t = await getTranslations("Legal");
  const sections = t.raw(sectionsKey) as Section[];

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <Link href="/" className="text-sm text-ink-500 hover:text-ink-800">
        ← {t("backHome")}
      </Link>

      <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">
        {t(titleKey)}
      </h1>
      <p className="mt-1 text-sm text-ink-400">{t("lastUpdated", { date: updatedOn })}</p>

      <div className="mt-8 space-y-8">
        {sections.map((section) => (
          <section key={section.heading}>
            <h2 className="text-base font-semibold text-ink-900">
              {section.heading}
            </h2>
            <p className="mt-2 text-[15px] leading-relaxed whitespace-pre-line text-ink-600">
              {section.body}
            </p>
          </section>
        ))}
      </div>
    </div>
  );
}
