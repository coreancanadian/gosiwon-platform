"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { BadgeCheck, Loader2 } from "lucide-react";
import { submitClaim } from "@/lib/actions/claims";

export function ClaimForm({ propertySlug }: { propertySlug: string }) {
  const t = useTranslations("Claim");
  const [pending, startTransition] = useTransition();
  const [evidence, setEvidence] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await submitClaim({
        propertySlug,
        evidence,
        contactPhone: contactPhone.trim() || null,
      });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setDone(true);
    });
  }

  if (done) {
    return (
      <div className="rounded-[var(--radius-card)] border border-emerald-300 bg-emerald-50 p-6 text-center">
        <BadgeCheck className="mx-auto h-8 w-8 text-emerald-600" aria-hidden />
        <p className="mt-3 text-base font-semibold text-ink-900">{t("success")}</p>
        <p className="mt-1 text-sm text-ink-600">{t("successHint")}</p>
      </div>
    );
  }

  const inputClass =
    "w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm text-ink-800 transition focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20 focus:outline-none";

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="evidence" className="mb-1.5 block text-sm font-medium text-ink-700">
          {t("evidence")}
        </label>
        <textarea
          id="evidence"
          required
          rows={5}
          minLength={10}
          maxLength={2000}
          value={evidence}
          onChange={(e) => setEvidence(e.target.value)}
          placeholder={t("evidencePlaceholder")}
          className={`${inputClass} resize-y`}
        />
      </div>

      <div>
        <label htmlFor="phone" className="mb-1.5 block text-sm font-medium text-ink-700">
          {t("contactPhone")}
        </label>
        <input
          id="phone"
          type="tel"
          value={contactPhone}
          onChange={(e) => setContactPhone(e.target.value)}
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
        {pending ? t("submitting") : t("submit")}
      </button>
    </form>
  );
}
