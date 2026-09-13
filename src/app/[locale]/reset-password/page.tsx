import { getTranslations, setRequestLocale } from "next-intl/server";
import { ResetPasswordForm } from "@/components/ResetPasswordForm";
import { DemoModeNotice } from "@/components/DemoModeNotice";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default async function ResetPasswordPage({
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
        {t("resetPasswordTitle")}
      </h1>

      <div className="mt-6">
        {isSupabaseConfigured() ? <ResetPasswordForm /> : <DemoModeNotice />}
      </div>
    </div>
  );
}
