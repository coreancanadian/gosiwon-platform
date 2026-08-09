import type { Locale } from "@/i18n/routing";

/**
 * KRW is always whole-won. Korean listings conventionally write "380,000원";
 * English-facing sites use the ₩ symbol.
 */
export function formatKrw(amount: number, locale: Locale): string {
  const n = Math.round(amount).toLocaleString(locale === "ko" ? "ko-KR" : "en-US");
  return locale === "ko" ? `${n}원` : `₩${n}`;
}

/** Compact form for map pins, where space is tight: "38만" / "₩380k". */
export function formatKrwCompact(amount: number, locale: Locale): string {
  if (locale === "ko") {
    const man = amount / 10_000; // 만원 is the unit Koreans actually quote in
    return Number.isInteger(man) ? `${man}만` : `${man.toFixed(1)}만`;
  }
  return `₩${Math.round(amount / 1000)}k`;
}

export function formatSqm(size: number, locale: Locale): string {
  const n = Number(size).toLocaleString(locale === "ko" ? "ko-KR" : "en-US", {
    maximumFractionDigits: 1,
  });
  return locale === "ko" ? `${n}㎡` : `${n} m²`;
}

/** Price range across a property's rooms, collapsing when min === max. */
export function formatPriceRange(
  min: number | null,
  max: number | null,
  locale: Locale,
): string | null {
  if (min == null) return null;
  if (max == null || min === max) return formatKrw(min, locale);
  return `${formatKrw(min, locale)} – ${formatKrw(max, locale)}`;
}
