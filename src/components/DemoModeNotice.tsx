import { getTranslations } from "next-intl/server";
import { Info } from "lucide-react";

/** Shown on auth-gated pages when the app is running without Supabase creds. */
export async function DemoModeNotice() {
  const t = await getTranslations("Common");

  return (
    <div className="flex gap-3 rounded-[var(--radius-card)] border border-amber-300 bg-amber-50 p-4">
      <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
      <div>
        <p className="text-sm font-semibold text-amber-900">{t("demoMode")}</p>
        <p className="mt-1 text-sm text-amber-800">{t("demoModeHint")}</p>
      </div>
    </div>
  );
}
