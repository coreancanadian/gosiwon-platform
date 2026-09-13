"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "login" | "signup";

export function AuthForm({
  mode,
  defaultRole = "tenant",
  redirectTo = "/",
}: {
  mode: Mode;
  defaultRole?: "tenant" | "owner";
  redirectTo?: string;
}) {
  const t = useTranslations("Auth");
  const tCommon = useTranslations("Common");
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"tenant" | "owner">(defaultRole);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const supabase = createClient();

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(t("invalidCredentials"));
        setPending(false);
        return;
      }
      router.replace(redirectTo);
      router.refresh();
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // Consumed by the handle_new_user() trigger to seed public.profiles.
        data: { full_name: fullName, role },
        emailRedirectTo: `${window.location.origin}/api/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
      setPending(false);
      return;
    }

    // Supabase deliberately returns a success-shaped response for an email
    // that's already registered and confirmed — no error, no session, and no
    // email actually sent — so a real signup can't be used to probe which
    // addresses exist. An empty identities array is the documented way to
    // tell the two apart on the client: a genuine new signup (or a resend
    // for an unconfirmed address) always has at least one.
    if (data.user && data.user.identities?.length === 0) {
      setError(t("emailAlreadyRegistered"));
      setPending(false);
      return;
    }

    // Supabase returns a session immediately when email confirmation is off.
    if (data.session) {
      router.replace(role === "owner" ? "/dashboard" : redirectTo);
      router.refresh();
      return;
    }

    setSentTo(email);
    setPending(false);
  }

  if (sentTo) {
    return (
      <div className="rounded-[var(--radius-card)] border border-ink-200 bg-white p-6 text-center">
        <p className="text-base font-semibold text-ink-900">{t("checkEmail")}</p>
        <p className="mt-2 text-sm text-ink-500">
          {t("checkEmailHint", { email: sentTo })}
        </p>
      </div>
    );
  }

  const inputClass =
    "w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm text-ink-800 transition focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20 focus:outline-none";

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {mode === "signup" ? (
        <>
          <div>
            <label htmlFor="fullName" className="mb-1.5 block text-sm font-medium text-ink-700">
              {t("fullName")}
            </label>
            <input
              id="fullName"
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={inputClass}
            />
          </div>

          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-ink-700">
              {t("iAmA")}
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(["tenant", "owner"] as const).map((r) => (
                <label
                  key={r}
                  className={`cursor-pointer rounded-xl border px-3.5 py-3 text-sm transition ${
                    role === r
                      ? "border-brand-400 bg-brand-50 text-brand-800"
                      : "border-ink-200 text-ink-600 hover:border-ink-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="role"
                    value={r}
                    checked={role === r}
                    onChange={() => setRole(r)}
                    className="sr-only"
                  />
                  {t(r === "tenant" ? "roleTenant" : "roleOwner")}
                </label>
              ))}
            </div>
          </fieldset>
        </>
      ) : null}

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

      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-ink-700">
          {t("password")}
        </label>
        <input
          id="password"
          type="password"
          required
          minLength={8}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
        {mode === "login" ? (
          <Link
            href="/forgot-password"
            className="mt-1.5 inline-block text-sm text-brand-600 hover:underline"
          >
            {t("forgotPasswordLink")}
          </Link>
        ) : null}
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
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : null}
        {pending
          ? tCommon("loading")
          : t(mode === "login" ? "loginButton" : "signupButton")}
      </button>

      <p className="text-center text-sm text-ink-500">
        {t(mode === "login" ? "noAccount" : "haveAccount")}{" "}
        <Link
          href={mode === "login" ? "/signup" : "/login"}
          className="font-medium text-brand-600 hover:underline"
        >
          {t(mode === "login" ? "signupTitle" : "loginTitle")}
        </Link>
      </p>
    </form>
  );
}
