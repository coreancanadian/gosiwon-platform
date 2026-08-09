import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthForm } from "@/components/AuthForm";
import { DemoModeNotice } from "@/components/DemoModeNotice";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default async function SignupPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ role?: string; next?: string }>;
}) {
  const [{ locale }, { role, next }] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);
  const t = await getTranslations("Auth");

  return (
    <div className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight text-ink-900">
        {t("signupTitle")}
      </h1>

      <div className="mt-6 space-y-4">
        {isSupabaseConfigured() ? (
          <AuthForm
            mode="signup"
            defaultRole={role === "owner" ? "owner" : "tenant"}
            redirectTo={next ?? "/"}
          />
        ) : (
          <DemoModeNotice />
        )}
      </div>
    </div>
  );
}
