"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Link } from "@/i18n/navigation";

const DISMISS_KEY = "hostPromoDismissedUntil";
const DISMISS_HOURS = 24;

const CONTACT_EMAIL = "admin@campusflat.com";

/**
 * Copy is picked from the browser's own language, not the site's next-intl
 * locale — a deliberate split from how the rest of the app is localized,
 * per the request that this go by navigator.language specifically.
 */
const COPY = {
  ko: {
    eyebrow: "사장님 첫 등록 이벤트",
    title: "사업자등록증 보내면 현금 2만원 드려요",
    steps: [
      "사장님(호스트) 계정 만들기",
      "고시원 · 셰어하우스 정보 등록하기",
      `사업자등록증을 ${CONTACT_EMAIL}로 보내기`,
      "현금 2만원 받기",
    ],
    cta: "지금 시작하기",
    close: "닫기",
    dismissHint: "닫으면 24시간 동안 다시 보이지 않아요.",
  },
  en: {
    eyebrow: "New Host Bonus",
    title: "Send your business registration, get ₩20,000 cash",
    steps: [
      "Create a host account",
      "Add your gosiwon / share-house details",
      `Email your business registration certificate to ${CONTACT_EMAIL}`,
      "Get ₩20,000 cash",
    ],
    cta: "Get started",
    close: "Close",
    dismissHint: "Closing hides this for 24 hours.",
  },
};

export function HostPromoInterstitial() {
  const [visible, setVisible] = useState(false);
  const [lang, setLang] = useState<"ko" | "en">("en");

  // navigator.language and localStorage don't exist during SSR, so unlike
  // this codebase's usual lazy-initializer pattern (which needs the same
  // value to be computable identically on server and client), this genuinely
  // has to wait until after hydration — an effect, not a render-time read.
  useEffect(() => {
    let dismissedUntil = 0;
    try {
      dismissedUntil = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    } catch {
      // Private browsing / storage blocked — just show it every time.
    }
    if (Date.now() < dismissedUntil) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLang(navigator.language.toLowerCase().startsWith("ko") ? "ko" : "en");
    setVisible(true);
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_HOURS * 60 * 60 * 1000));
    } catch {
      // Nothing to persist to — it'll just show again next time, which is fine.
    }
    setVisible(false);
  }

  if (!visible) return null;
  const t = COPY[lang];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-900/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t.title}
    >
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <button
          type="button"
          onClick={dismiss}
          aria-label={t.close}
          className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>

        <p className="text-sm font-semibold text-brand-600">{t.eyebrow}</p>
        <h2 className="mt-1 pr-8 text-xl font-bold tracking-tight text-ink-900">
          {t.title}
        </h2>

        <ol className="mt-4 space-y-2">
          {t.steps.map((step, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm text-ink-700">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>

        <Link
          href="/signup?role=owner"
          onClick={dismiss}
          className="mt-6 flex w-full items-center justify-center rounded-xl bg-brand-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-600"
        >
          {t.cta}
        </Link>

        <p className="mt-3 text-center text-xs text-ink-400">{t.dismissHint}</p>
      </div>
    </div>
  );
}
