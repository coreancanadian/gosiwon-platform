import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Link, redirect } from "@/i18n/navigation";
import { getInquiryThread } from "@/lib/data/inquiries";
import { getCurrentUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { MessageThread } from "@/components/MessageThread";
import { ReputationCard } from "@/components/ReputationCard";
import { StayPanel } from "@/components/StayPanel";
import type { Locale } from "@/i18n/routing";

export default async function InquiryThreadPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  if (!isSupabaseConfigured()) notFound();

  const user = await getCurrentUser();
  if (!user) redirect({ href: `/login?next=/inquiries/${id}`, locale });

  const thread = await getInquiryThread(id);
  if (!thread) notFound();

  const [t, tMessages] = await Promise.all([
    getTranslations("Nav"),
    getTranslations("Messages"),
  ]);

  const isKo = (locale as Locale) === "ko";
  const property = thread.properties;
  const name = property
    ? (isKo ? property.name_ko : property.name_en) || property.name_ko
    : "—";

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Link
        href={thread.viewerIsOwner ? "/dashboard/inquiries" : "/inquiries"}
        className="inline-flex items-center gap-1.5 text-sm text-ink-500 transition hover:text-ink-800"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {thread.viewerIsOwner ? t("dashboard") : t("myInquiries")}
      </Link>

      <div className="mt-4 mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">
          {tMessages("title")}
        </h1>
        {property ? (
          <Link
            href={`/property/${property.slug}`}
            className="mt-1 inline-block text-sm text-brand-600 hover:underline"
          >
            {name}
          </Link>
        ) : null}
        {thread.counterparty?.full_name ? (
          <p className="mt-0.5 text-sm text-ink-500">
            {thread.counterparty.full_name}
          </p>
        ) : null}
      </div>

      {/* The host sees the applicant's record right where they decide. */}
      {thread.viewerIsOwner ? (
        <div className="mb-6">
          <ReputationCard reputation={thread.applicantReputation} />
        </div>
      ) : null}

      <div className="mb-6">
        <StayPanel thread={thread} />
      </div>

      <MessageThread thread={thread} />
    </div>
  );
}
