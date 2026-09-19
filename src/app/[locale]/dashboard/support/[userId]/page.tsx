import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Link, redirect } from "@/i18n/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { getSupportThread } from "@/lib/data/support";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { SupportChat } from "@/components/SupportChat";

/** Admin view of one user's conversation, with a reply box. */
export default async function SupportConversationPage({
  params,
}: {
  params: Promise<{ locale: string; userId: string }>;
}) {
  const { locale, userId } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Support");

  if (!isSupabaseConfigured()) return null;

  const me = await getCurrentProfile();
  if (me?.role !== "admin") {
    redirect({ href: "/dashboard", locale });
    return null;
  }

  const supabase = await createClient();
  const [{ data: person }, thread] = await Promise.all([
    supabase.from("profiles").select("full_name, role").eq("id", userId).maybeSingle(),
    getSupportThread(userId),
  ]);
  const name = person?.full_name ?? t("unnamed");
  const roleLabel = { owner: t("roleOwner"), tenant: t("roleTenant"), admin: t("roleAdmin") };

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/dashboard/support"
        className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-800"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {t("back")}
      </Link>

      <div className="mt-3 flex items-center gap-2">
        <h2 className="text-lg font-semibold tracking-tight text-ink-900">{name}</h2>
        {person ? (
          <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-medium text-ink-600">
            {roleLabel[person.role]}
          </span>
        ) : null}
      </div>

      <div className="mt-5">
        <SupportChat thread={thread} viewerId={me.id} viewerIsAdmin peerName={name} />
      </div>
    </div>
  );
}
