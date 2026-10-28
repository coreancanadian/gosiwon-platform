import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { AdminPlatformStats, UserRole } from "@/lib/types/database";

type Tone = "default" | "alert";

function Tile({
  label,
  value,
  hint,
  href,
  tone = "default",
}: {
  label: string;
  value: number;
  hint?: string;
  href?: string;
  tone?: Tone;
}) {
  const alert = tone === "alert" && value > 0;
  const body = (
    <>
      <p className="text-sm text-ink-500">{label}</p>
      <p
        className={`mt-1.5 text-3xl font-bold tracking-tight tabular-nums ${
          alert ? "text-brand-600" : "text-ink-900"
        }`}
      >
        {value.toLocaleString()}
      </p>
      {hint ? <p className="mt-1 text-xs text-ink-500">{hint}</p> : null}
    </>
  );
  const cls = `block min-w-0 rounded-[var(--radius-card)] border p-5 ${
    alert ? "border-brand-200 bg-brand-50" : "border-ink-200"
  }`;
  return href ? (
    <Link href={href} className={`${cls} transition hover:border-brand-400`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 first:mt-0">
      <h2 className="mb-3 text-sm font-semibold tracking-wide text-ink-500">{title}</h2>
      {children}
    </section>
  );
}

function SignupChart({
  days,
  locale,
  title,
  totalLabel,
  peakLabel,
}: {
  days: AdminPlatformStats["signups_by_day"];
  locale: string;
  title: string;
  totalLabel: string;
  peakLabel: string;
}) {
  const max = Math.max(1, ...days.map((d) => d.count));
  const fmt = new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    month: "short",
    day: "numeric",
    timeZone: "Asia/Seoul",
  });
  const label = (day: string) => fmt.format(new Date(`${day}T12:00:00+09:00`));
  const first = days[0];
  const last = days[days.length - 1];

  return (
    <div className="rounded-[var(--radius-card)] border border-ink-200 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm font-medium text-ink-800">{title}</p>
        <p className="text-xs text-ink-500">
          {totalLabel} · {peakLabel}
        </p>
      </div>
      <div className="mt-4 flex h-28 items-end gap-[3px]" role="img" aria-label={title}>
        {days.map((d) => (
          <div
            key={d.day}
            title={`${label(d.day)}: ${d.count}`}
            className={`min-w-0 flex-1 rounded-t-sm ${
              d.count > 0 ? "bg-brand-500" : "bg-ink-200"
            }`}
            style={{ height: d.count > 0 ? `${Math.max(8, (d.count / max) * 100)}%` : "3px" }}
          />
        ))}
      </div>
      {first && last ? (
        <div className="mt-2 flex justify-between text-xs text-ink-400">
          <span>{label(first.day)}</span>
          <span>{label(last.day)}</span>
        </div>
      ) : null}
    </div>
  );
}

/** Platform-wide numbers for the operator. Admin-only; the data call enforces that. */
export async function AdminOverview({
  stats,
  locale,
}: {
  stats: AdminPlatformStats;
  locale: string;
}) {
  const t = await getTranslations("AdminOverview");
  const { users, listings, inquiries } = stats;

  // One decimal, so 4 of 1,887 reads 0.2% rather than a misleading 0%.
  const claimedPct = listings.total > 0 ? Math.round((listings.claimed / listings.total) * 1000) / 10 : 0;
  const days = stats.signups_by_day;
  const total30 = days.reduce((sum, d) => sum + d.count, 0);
  const peak = Math.max(0, ...days.map((d) => d.count));

  const dateFmt = new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Seoul",
  });
  const roleLabel: Record<UserRole, string> = {
    tenant: t("roleTenant"),
    owner: t("roleOwner"),
    admin: t("roleAdmin"),
  };

  return (
    <div>
      <p className="mb-6 max-w-2xl text-sm text-ink-500">{t("subtitle")}</p>

      <Section title={t("attention")}>
        <div className="grid gap-4 sm:grid-cols-3">
          <Tile
            label={t("supportUnread")}
            value={stats.support_unread}
            href="/dashboard/support"
            tone="alert"
          />
          <Tile
            label={t("claimsWaiting")}
            value={stats.claims_waiting}
            href="/dashboard/claims"
            tone="alert"
          />
          <Tile label={t("pendingInquiries")} value={inquiries.pending} />
        </div>
      </Section>

      <Section title={t("members")}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Tile label={t("totalMembers")} value={users.total} />
          <Tile
            label={t("new7d")}
            value={users.new_7d}
            hint={t("last24h", { count: users.new_24h })}
          />
          <Tile label={t("seekers")} value={users.tenants} />
          <Tile label={t("hosts")} value={users.owners} />
          <Tile label={t("active7d")} value={users.active_7d} />
          <Tile label={t("unconfirmed")} value={users.unconfirmed} />
        </div>
        <div className="mt-4">
          <SignupChart
            days={days}
            locale={locale}
            title={t("signupsTitle")}
            totalLabel={t("signupsTotal", { count: total30 })}
            peakLabel={t("peak", { count: peak })}
          />
        </div>
      </Section>

      <Section title={t("listings")}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Tile label={t("totalListings")} value={listings.total} />
          <Tile
            label={t("claimed")}
            value={listings.claimed}
            hint={t("claimedShare", { pct: claimedPct })}
          />
          <Tile label={t("unclaimed")} value={listings.unclaimed} />
          <Tile
            label={t("inquiriesOnUnclaimed")}
            value={inquiries.on_unclaimed}
            hint={t("inquiriesOnUnclaimedHint")}
          />
        </div>
      </Section>

      <Section title={t("activity")}>
        <div className="grid gap-4 sm:grid-cols-3">
          <Tile label={t("inquiriesTotal")} value={inquiries.total} />
          <Tile label={t("inquiries7d")} value={inquiries.new_7d} />
          <Tile label={t("messages7d")} value={stats.messages_7d} />
        </div>
      </Section>

      <Section title={t("recent")}>
        <div className="overflow-x-auto rounded-[var(--radius-card)] border border-ink-200">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <thead className="bg-ink-50 text-xs text-ink-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">{t("colName")}</th>
                <th className="px-4 py-2.5 font-medium">{t("colEmail")}</th>
                <th className="px-4 py-2.5 font-medium">{t("colRole")}</th>
                <th className="px-4 py-2.5 font-medium">{t("colJoined")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {stats.recent_signups.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-2.5 text-ink-900">{u.name || t("unnamed")}</td>
                  <td className="px-4 py-2.5 text-ink-600">
                    {u.email ?? "—"}
                    {!u.confirmed ? (
                      <span className="ml-2 rounded-full bg-ink-100 px-2 py-0.5 text-[11px] text-ink-600">
                        {t("notConfirmed")}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5 text-ink-600">{roleLabel[u.role]}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-ink-600 tabular-nums">
                    {dateFmt.format(new Date(u.created_at))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
