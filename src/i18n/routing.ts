import { defineRouting } from "next-intl/routing";

export const locales = ["ko", "en"] as const;
export type Locale = (typeof locales)[number];

export const routing = defineRouting({
  locales,
  defaultLocale: "ko",
  // Korean visitors get bare paths (/), English gets /en. Keeps the domestic
  // URLs clean while still giving the English site its own indexable prefix.
  localePrefix: "as-needed",
});
