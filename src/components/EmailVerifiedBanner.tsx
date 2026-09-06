"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";

/**
 * Confirms a just-verified email actually did something.
 *
 * Without this, clicking the confirmation link silently lands on the
 * homepage with no visible change — indistinguishable from the link being
 * broken. The `verified=1` param is set once, by the auth callback route,
 * and stripped from the URL here so refreshing or sharing the link doesn't
 * re-show it.
 */
export function EmailVerifiedBanner() {
  const t = useTranslations("Auth");
  const tCommon = useTranslations("Common");
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  // Read once, during the initial render, rather than setState-in-effect —
  // this only ever needs to fire off the URL param present on first mount.
  const [visible, setVisible] = useState(() => searchParams.get("verified") === "1");

  useEffect(() => {
    if (!visible) return;
    const next = new URLSearchParams(searchParams.toString());
    next.delete("verified");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!visible) return null;

  return (
    <div className="border-b border-emerald-200 bg-emerald-50">
      <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-4 py-3 sm:px-6">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
        <p className="flex-1 text-sm text-emerald-900">
          <span className="font-semibold">{t("emailVerifiedTitle")}</span>{" "}
          {t("emailVerifiedBody")}
        </p>
        <button
          type="button"
          onClick={() => setVisible(false)}
          aria-label={tCommon("close")}
          className="shrink-0 text-emerald-600 hover:text-emerald-800"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
