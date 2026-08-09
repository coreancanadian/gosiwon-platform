"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Check, Loader2, X } from "lucide-react";
import { approveClaim, rejectClaim } from "@/lib/actions/claims";

export function ClaimReviewActions({ claimId }: { claimId: string }) {
  const t = useTranslations("Claim");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onApprove() {
    setError(null);
    startTransition(async () => {
      const result = await approveClaim(claimId);
      if (!result.ok) return setError(result.error ?? "Failed.");
      router.refresh();
    });
  }

  function onReject() {
    const note = window.prompt(t("rejectPrompt"));
    if (note == null) return;
    setError(null);
    startTransition(async () => {
      const result = await rejectClaim(claimId, note);
      if (!result.ok) return setError(result.error ?? "Failed.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onApprove}
        disabled={pending}
        className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Check className="h-4 w-4" aria-hidden />
        )}
        {t("approve")}
      </button>
      <button
        type="button"
        onClick={onReject}
        disabled={pending}
        className="flex items-center gap-1.5 rounded-lg border border-ink-300 px-3.5 py-2 text-sm font-medium text-ink-700 transition hover:bg-ink-100 disabled:opacity-60"
      >
        <X className="h-4 w-4" aria-hidden />
        {t("reject")}
      </button>
      {error ? <span className="text-sm text-brand-600">{error}</span> : null}
    </div>
  );
}
