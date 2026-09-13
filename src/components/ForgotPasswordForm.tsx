"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";

export function ForgotPasswordForm() {
  const t = useTranslations("Auth");

  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/api/auth/callback?next=/reset-password`,
    });
    setPending(false);

    if (error) {
      setError(error.message);
      return;
    }

    // Supabase never reveals whether the address is registered here either
    // (same anti-enumeration reasoning as signup) — this "check your email"
    // state shows regardless of whether the address actually has an account.
    setSent(true);
  }

  if (sent) {
    return (
      <div className="rounded-[var(--radius-card)] border border-ink-200 bg-white p-6 text-center">
        <p className="text-base font-semibold text-ink-900">{t("checkEmail")}</p>
        <p className="mt-2 text-sm text-ink-500">{t("checkEmailHint", { email })}</p>
      </div>
    );
  }

  const inputClass =
    "w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm text-ink-800 transition focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20 focus:outline-none";

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-ink-700">
          {t("email")}
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-brand-600">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        {t("sendResetLink")}
      </button>

      <p className="text-center text-sm text-ink-500">
        <Link href="/login" className="font-medium text-brand-600 hover:underline">
          {t("backToLogin")}
        </Link>
      </p>
    </form>
  );
}
