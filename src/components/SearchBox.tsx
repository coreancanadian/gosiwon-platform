"use client";

import { useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Search, MapPin, TrainFront, GraduationCap } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

export interface SearchOption {
  kind: "region" | "station" | "university";
  slug: string;
  name_ko: string;
  name_en: string;
  hint_ko?: string | null;
  hint_en?: string | null;
}

export function SearchBox({
  options,
  autoFocus = false,
  initialQuery = "",
}: {
  options: SearchOption[];
  autoFocus?: boolean;
  initialQuery?: string;
}) {
  const t = useTranslations("Home");
  const locale = useLocale() as Locale;
  const router = useRouter();

  const [query, setQuery] = useState(initialQuery);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const label = (o: SearchOption) => (locale === "ko" ? o.name_ko : o.name_en);
  const hint = (o: SearchOption) =>
    locale === "ko" ? o.hint_ko : o.hint_en;

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    // Match on both languages regardless of active locale — a Korean user may
    // type "Gangnam" and an English user may paste 강남.
    return options
      .filter((o) =>
        [o.name_ko, o.name_en, o.hint_ko, o.hint_en]
          .filter(Boolean)
          .some((field) => field!.toLowerCase().includes(needle)),
      )
      .slice(0, 8);
  }, [options, query]);

  function go(option?: SearchOption) {
    if (option) {
      router.push(`/search?${option.kind}=${encodeURIComponent(option.slug)}`);
      return;
    }
    const trimmed = query.trim();
    if (trimmed) router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || matches.length === 0) {
      if (e.key === "Enter") go();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % matches.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + matches.length) % matches.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(matches[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const showDropdown = open && query.trim().length > 0;

  return (
    <div className="relative w-full">
      <div className="flex items-center gap-2 rounded-full border border-ink-200 bg-white p-2 pl-5 shadow-lg shadow-ink-900/5 focus-within:border-brand-400 focus-within:ring-4 focus-within:ring-brand-500/10">
        <Search className="h-5 w-5 shrink-0 text-ink-400" aria-hidden />
        <input
          type="text"
          value={query}
          autoFocus={autoFocus}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Delay so a click on an option lands before the list unmounts.
            blurTimer.current = setTimeout(() => setOpen(false), 120);
          }}
          onKeyDown={onKeyDown}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          aria-autocomplete="list"
          aria-expanded={showDropdown}
          role="combobox"
          aria-controls="search-suggestions"
          className="min-w-0 flex-1 bg-transparent py-2 text-[15px] text-ink-800 placeholder:text-ink-400 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => go(showDropdown ? matches[activeIndex] : undefined)}
          className="shrink-0 rounded-full bg-brand-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-brand-600"
        >
          {t("searchButton")}
        </button>
      </div>

      {showDropdown ? (
        <ul
          id="search-suggestions"
          role="listbox"
          className="absolute inset-x-0 top-full z-50 mt-2 max-h-80 overflow-y-auto rounded-2xl border border-ink-200 bg-white py-2 shadow-xl shadow-ink-900/10"
        >
          {matches.length === 0 ? (
            <li className="px-4 py-3 text-sm text-ink-400">
              {t("noSuggestions")}
            </li>
          ) : (
            matches.map((option, i) => (
              <li key={`${option.kind}-${option.slug}`} role="option" aria-selected={i === activeIndex}>
                <button
                  type="button"
                  onMouseEnter={() => setActiveIndex(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    if (blurTimer.current) clearTimeout(blurTimer.current);
                    go(option);
                  }}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition ${
                    i === activeIndex ? "bg-ink-100" : ""
                  }`}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-100 text-ink-500">
                    {option.kind === "region" ? (
                      <MapPin className="h-4 w-4" aria-hidden />
                    ) : option.kind === "station" ? (
                      <TrainFront className="h-4 w-4" aria-hidden />
                    ) : (
                      <GraduationCap className="h-4 w-4" aria-hidden />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink-800">
                      {label(option)}
                    </span>
                    <span className="block truncate text-xs text-ink-400">
                      {hint(option) ??
                        t(
                          option.kind === "region"
                            ? "suggestionsRegions"
                            : option.kind === "station"
                              ? "suggestionsStations"
                              : "suggestionsUniversities",
                        )}
                    </span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
