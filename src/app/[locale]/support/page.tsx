import { getTranslations, setRequestLocale } from "next-intl/server";
import { Gift } from "lucide-react";
import { redirect } from "@/i18n/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { getSupportThread } from "@/lib/data/support";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { DemoModeNotice } from "@/components/DemoModeNotice";
import { SupportChat } from "@/components/SupportChat";

/** A signed-in user's private line to the Campusflat team. */
export default async function SupportPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ topic?: string }>;
}) {
  const [{ locale }, { topic }] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);
  const t = await getTranslations("Support");

  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <DemoModeNotice />
      </div>
    );
  }

  const profile = await getCurrentProfile();
  if (!profile) {
    redirect({ href: "/login?next=/support", locale });
    return null;
  }
  // The operator reads and answers from the inbox, not from a thread of their own.
  if (profile.role === "admin") {
    redirect({ href: "/dashboard/support", locale });
    return null;
  }

  const thread = await getSupportThread(profile.id);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight text-ink-900">{t("title")}</h1>
      <p className="mt-2 text-sm text-ink-500">{t("subtitle")}</p>

      {profile.role === "owner" ? (
        <div className="mt-6 flex gap-3 rounded-[var(--radius-card)] border border-brand-200 bg-brand-50 p-4">
          <Gift className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-ink-900">{t("hostBonusTitle")}</p>
            <p className="mt-1 text-sm text-ink-600">{t("hostBonusBody")}</p>
          </div>
        </div>
      ) : null}

      <div className="mt-6">
        <SupportChat
          thread={thread}
          viewerId={profile.id}
          viewerIsAdmin={false}
          peerName={t("teamName")}
          // Arriving from the host promo pre-fills the message so the host
          // only has to attach the file.
          initialBody={topic === "business" ? t("businessTemplate") : ""}
        />
      </div>
    </div>
  );
}
