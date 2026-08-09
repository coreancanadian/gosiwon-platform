import { getTranslations, setRequestLocale } from "next-intl/server";
import { getMyInquiries } from "@/lib/data/inquiries";
import { InquiryCard } from "@/components/InquiryCard";
import type { Locale } from "@/i18n/routing";

export default async function DashboardInquiriesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("Dashboard");
  const inquiries = await getMyInquiries("owner");

  // Pending first — those are the ones needing a decision.
  const sorted = [...inquiries].sort((a, b) => {
    if (a.status === "pending" && b.status !== "pending") return -1;
    if (b.status === "pending" && a.status !== "pending") return 1;
    return b.created_at.localeCompare(a.created_at);
  });

  return (
    <div className="space-y-3">
      {sorted.length === 0 ? (
        <p className="rounded-[var(--radius-card)] border border-ink-200 bg-ink-50 px-6 py-12 text-center text-sm text-ink-500">
          {t("noInquiries")}
        </p>
      ) : (
        sorted.map((inquiry) => (
          <InquiryCard
            key={inquiry.id}
            inquiry={inquiry}
            href={`/inquiries/${inquiry.id}`}
            locale={locale as Locale}
          />
        ))
      )}
    </div>
  );
}
