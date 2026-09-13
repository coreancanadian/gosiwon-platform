import { getTranslations, setRequestLocale } from "next-intl/server";
import { ForgotPasswordForm } from "@/components/ForgotPasswordForm";
import { DemoModeNotice } from "@/components/DemoModeNotice";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default async function ForgotPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Auth");

  return (
    <div className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight text-ink-900">
        {t("forgotPasswordTitle")}
      </h1>
      <p className="mt-2 text-sm text-ink-500">{t("forgotPasswordHint")}</p>

      <div className="mt-6">
        {isSupabaseConfigured() ? <ForgotPasswordForm /> : <DemoModeNotice />}
      </div>
    </div>
  );
}
