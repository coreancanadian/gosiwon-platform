import { getTranslations, setRequestLocale } from "next-intl/server";
import { Paperclip } from "lucide-react";
import { Link, redirect } from "@/i18n/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { listSupportInbox } from "@/lib/data/support";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/** Admin-only inbox: every user's conversation, newest activity first. */
export default async function SupportInboxPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Support");

  if (!isSupabaseConfigured()) return null;

  const profile = await getCurrentProfile();
  if (profile?.role !== "admin") {
    redirect({ href: "/dashboard", locale });
    return null;
  }

  const rows = await listSupportInbox();
  const roleLabel = { owner: t("roleOwner"), tenant: t("roleTenant"), admin: t("roleAdmin") };

  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight text-ink-900">{t("inboxTitle")}</h2>

      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-ink-500">{t("inboxEmpty")}</p>
      ) : (
        <ul className="mt-5 divide-y divide-ink-200 overflow-hidden rounded-[var(--radius-card)] border border-ink-200">
          {rows.map((row) => (
            <li key={row.userId}>
              <Link
                href={`/dashboard/support/${row.userId}`}
                className={`flex items-start gap-3 px-4 py-3.5 transition hover:bg-ink-50 ${
                  row.unread ? "bg-brand-50/50" : ""
                }`}
              >
                <span
                  aria-hidden
                  className={`mt-2 h-2 w-2 shrink-0 rounded-full ${row.unread ? "bg-brand-500" : "bg-transparent"}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className={`text-sm text-ink-900 ${row.unread ? "font-semibold" : "font-medium"}`}>
                      {row.name ?? t("unnamed")}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        row.role === "owner" ? "bg-brand-100 text-brand-700" : "bg-ink-100 text-ink-600"
                      }`}
                    >
                      {roleLabel[row.role]}
                    </span>
                    {row.unread ? (
                      <span className="rounded-full bg-brand-500 px-2 py-0.5 text-[11px] font-semibold text-white">
                        {t("newBadge")}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-1 flex items-center gap-1.5 text-sm text-ink-500">
                    {row.hasAttachment ? <Paperclip className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
                    <span className="truncate">{row.preview || t("attachmentOnly")}</span>
                  </span>
                </span>
                <span
                  suppressHydrationWarning
                  className="shrink-0 pt-0.5 text-xs text-ink-400"
                >
                  {new Date(row.lastMessageAt).toLocaleDateString(locale === "ko" ? "ko-KR" : "en-US")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
