import { getTranslations } from "next-intl/server";
import { getCurrentProfile } from "@/lib/auth";
import { getSupportUnreadCount } from "@/lib/data/support";
import { SupportFab } from "./SupportFab";

/** Signed-in users only — there's no thread to open without an account. */
export async function SupportButton() {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const [t, unread] = await Promise.all([
    getTranslations("Support"),
    getSupportUnreadCount(profile.role),
  ]);

  return (
    <SupportFab
      href={profile.role === "admin" ? "/dashboard/support" : "/support"}
      label={t("navLabel")}
      unread={unread}
    />
  );
}
