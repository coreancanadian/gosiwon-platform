"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Lands here only via the reset-password email link, which the auth callback
 * route has already exchanged for a real session before redirecting here —
 * so "no session" means someone opened this page directly rather than
 * through a valid, unexpired link.
 */
export function ResetPasswordForm() {
  const t = useTranslations("Auth");
  const router = useRouter();

  const [ready, setReady] = useState<"checking" | "ready" | "invalid">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    createClient()
      .auth.getSession()
      .then(({ data }) => setReady(data.session ? "ready" : "invalid"));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError(t("passwordMismatch"));
      return;
    }

    setPending(true);
    setError(null);

    const { error } = await createClient().auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setPending(false);
      return;
    }

    router.replace("/");
    router.refresh();
  }

  if (ready === "checking") {
    return <Loader2 className="h-5 w-5 animate-spin text-ink-400" aria-hidden />;
  }

  if (ready === "invalid") {
    return (
      <div className="rounded-[var(--radius-card)] border border-ink-200 bg-white p-6 text-center">
        <p className="text-sm text-ink-600">{t("invalidResetLink")}</p>
      </div>
    );
  }

  const inputClass =
    "w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm text-ink-800 transition focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20 focus:outline-none";

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-ink-700">
          {t("newPassword")}
        </label>
        <input
          id="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
      </div>

      <div>
        <label
          htmlFor="confirmPassword"
          className="mb-1.5 block text-sm font-medium text-ink-700"
        >
          {t("confirmPassword")}
        </label>
        <input
          id="confirmPassword"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
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
        {t("resetPasswordButton")}
      </button>
    </form>
  );
}
