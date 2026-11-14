"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { List, Loader2, Map as MapIcon, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import { PropertyCard } from "./PropertyCard";
import { MapView, type MapBounds, type MapMarker } from "./MapView";
import { genderSwatch } from "./map-pin";
import { GenderGradientDefs } from "./GenderGradientDefs";
import type { Locale } from "@/i18n/routing";
import { publicImageUrl } from "@/lib/storage";
import type {
  GenderPolicy,
  HousingCategory,
  ListingSummary,
  PropertyType,
} from "@/lib/types/database";
import { displayName } from "@/lib/localize";

/** Filters the server already applied, replayed when browsing by map. */
export interface ActiveFilters {
  gender?: GenderPolicy;
  propertyType?: PropertyType;
  housingCategory?: HousingCategory;
  minPrice?: number;
  maxPrice?: number;
  sort?: "recommended" | "price_asc" | "price_desc" | "newest";
}

/** Cards rendered at a time; more appear as the list is scrolled. */
const LIST_PAGE = 40;

function inBounds(p: ListingSummary, b: MapBounds): boolean {
  return (
    p.lat != null &&
    p.lng != null &&
    p.lat >= b.swLat &&
    p.lat <= b.neLat &&
    p.lng >= b.swLng &&
    p.lng <= b.neLng
  );
}

/** The /api/search query string for these filters; also their identity. */
function filtersQuery(filters: ActiveFilters): string {
  const params = new URLSearchParams();
  if (filters.gender) params.set("gender", filters.gender);
  if (filters.propertyType) params.set("type", filters.propertyType);
  if (filters.housingCategory) params.set("category", filters.housingCategory);
  if (filters.minPrice != null) params.set("minPrice", String(filters.minPrice));
  if (filters.maxPrice != null) params.set("maxPrice", String(filters.maxPrice));
  if (filters.sort) params.set("sort", filters.sort);
  return params.toString();
}

/** The region / station / university the user arrived from, if any. */
export interface PlaceContext {
  /** URL param that selected it, e.g. "university". */
  param: "region" | "station" | "university";
  slug: string;
  label: string;
  /** English name (+ locality) to outline on the Google map, e.g.
   *  "Hanyang University, Seoul, South Korea". Kakao ignores it. */
  geocodeQuery?: string;
}

export function SearchResults({
  properties: initialProperties,
  isNationwide = false,
  center,
  filters = {},
  place = null,
}: {
  properties: ListingSummary[];
  /** True when `properties` is already every listing matching `filters`
   *  (no place or text search narrowed it). */
  isNationwide?: boolean;
  center?: { lat: number; lng: number };
  filters?: ActiveFilters;
  place?: PlaceContext | null;
}) {
  const t = useTranslations("Search");
  const tEnum = useTranslations("Enums");
  const tCommon = useTranslations("Common");
  const locale = useLocale() as Locale;

  // Hover highlights; a pin click also scrolls the list.
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"list" | "map">("list");
  // Stop re-fitting the viewport once the user starts driving the map.
  const [userMovedMap, setUserMovedMap] = useState(false);
  // The visible map area the list is narrowed to once the user drives the map.
  const [viewBounds, setViewBounds] = useState<MapBounds | null>(null);
  // Every listing matching the filters, fetched once the map takes over from
  // a place-narrowed search. Keyed by filters so a filter change refetches;
  // `items: null` records a failed fetch.
  const [fetched, setFetched] = useState<{
    key: string;
    items: ListingSummary[] | null;
  } | null>(null);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const listRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef(new Map<string, HTMLElement>());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set by a pin click so hovering a card never yanks the list around.
  const pendingScrollRef = useRef<string | null>(null);
  // Latest viewport, kept even when the user hasn't panned, so clearing the
  // place can switch to "this area" immediately without a map movement.
  const lastBoundsRef = useRef<MapBounds | null>(null);

  /**
   * A new server result set replaces the list.
   *
   * Whether the viewport also resets depends on why the props changed: picking
   * a NEW place should fly the map there, but CLEARING the place should leave
   * the map exactly where the user left it — they asked to widen the results,
   * not to be thrown somewhere else.
   *
   * Adjusting state during render rather than in an effect is React's
   * documented way to reset state when a prop changes.
   */
  const placeKey = place ? `${place.param}:${place.slug}` : "";
  const [syncedProperties, setSyncedProperties] = useState(initialProperties);
  const [syncedPlaceKey, setSyncedPlaceKey] = useState(placeKey);
  if (syncedProperties !== initialProperties) {
    const movedToNewPlace = Boolean(placeKey) && placeKey !== syncedPlaceKey;
    setSyncedProperties(initialProperties);
    setSyncedPlaceKey(placeKey);
    setSelectedId(null);
    if (movedToNewPlace) setUserMovedMap(false);
  }

  /**
   * Everything matching the filters, wherever it is — what the map browses
   * once the user moves it. A place-free search already has it; otherwise
   * it's fetched (from the server's shared cache) on the first map move.
   * Null while that fetch is pending.
   */
  const filtersKey = filtersQuery(filters);
  const nationwide: ListingSummary[] | null = isNationwide
    ? initialProperties
    : fetched?.key === filtersKey
      ? (fetched.items ?? initialProperties)
      : null;
  const loading = userMovedMap && nationwide == null;

  useEffect(() => {
    if (!userMovedMap || isNationwide || fetched?.key === filtersKey) return;
    const controller = new AbortController();
    fetch(`/api/search?${filtersKey}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((items: ListingSummary[]) => setFetched({ key: filtersKey, items }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        console.error("Loading listings for the map failed", err);
        setFetched({ key: filtersKey, items: null });
      });
    return () => controller.abort();
  }, [userMovedMap, isNationwide, fetched?.key, filtersKey]);

  /**
   * Once the map moves it — not the region or station that was clicked to get
   * here — decides what the list shows: every matching listing inside the
   * visible area. Filters still apply, so panning never quietly reintroduces
   * listings the user filtered out. Filtering happens here in the browser, so
   * panning and zooming cost no network requests.
   */
  const properties = useMemo(() => {
    if (!userMovedMap || !nationwide || !viewBounds) return initialProperties;
    return nationwide.filter((p) => inBounds(p, viewBounds));
  }, [userMovedMap, nationwide, viewBounds, initialProperties]);

  const onBoundsChange = useCallback(
    (bounds: MapBounds, userInitiated: boolean) => {
      lastBoundsRef.current = bounds;
      if (!userInitiated) return;
      setUserMovedMap(true);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => setViewBounds(bounds), 150);
    },
    [],
  );

  /**
   * Drop the starting place and keep browsing from here.
   *
   * The URL param goes so the heading and a shared link agree with what is on
   * screen, and the list switches to the current viewport immediately rather
   * than waiting for the user to nudge the map.
   */
  const clearPlace = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    if (place) next.delete(place.param);
    setUserMovedMap(true);
    if (lastBoundsRef.current) setViewBounds(lastBoundsRef.current);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [pathname, place, router, searchParams]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Pins: before the user takes over, exactly the results; after, every
  // matching listing (only those on screen are visible anyway), so zooming
  // out reveals pins instantly and panning never rebuilds them.
  const pinSource = userMovedMap && nationwide ? nationwide : initialProperties;
  const markers: MapMarker[] = useMemo(
    () =>
      pinSource
        .filter((p) => p.lat != null && p.lng != null)
        .map((p) => ({
          id: p.id,
          lat: p.lat!,
          lng: p.lng!,
          label: displayName(p, locale),
          gender: p.gender,
        })),
    [pinSource, locale],
  );

  /**
   * The list renders LIST_PAGE cards at a time — over a thousand cards at once
   * would make the page sluggish. Reset to the first page whenever the
   * results change; a pin selected further down extends it so its card exists.
   */
  const [shown, setShown] = useState({ list: properties, count: LIST_PAGE });
  const pagedCount = shown.list === properties ? shown.count : LIST_PAGE;
  const selectedIndex = selectedId ? properties.findIndex((p) => p.id === selectedId) : -1;
  const visibleCount = Math.max(
    pagedCount,
    Math.ceil((selectedIndex + 1) / LIST_PAGE) * LIST_PAGE,
  );
  const visibleProperties = properties.slice(0, visibleCount);
  const remaining = properties.length - visibleProperties.length;
  const showMore = useCallback(
    () => setShown({ list: properties, count: visibleCount + LIST_PAGE }),
    [properties, visibleCount],
  );

  // Load the next page of cards as the end of the list scrolls into view.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || remaining <= 0 || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) showMore();
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [remaining, showMore]);

  /**
   * Clicking a pin selects the listing. On desktop the effect below scrolls
   * the sidebar list to it; on mobile it instead surfaces as the peek card
   * below, without leaving map view — jumping the whole screen over to the
   * list just to show one card was the wrong amount of motion for what the
   * user asked to see.
   */
  const onMarkerClick = useCallback((id: string) => {
    setSelectedId(id);
    pendingScrollRef.current = id;
  }, []);

  /**
   * Scroll the chosen card into view AFTER React has committed.
   *
   * Doing this inside the click handler does not work: the scroll lands, then
   * the re-render triggered by the same click resets it. An effect runs after
   * commit, so the position sticks.
   *
   * scrollIntoView({behavior:"smooth"}) is avoided too — it silently does
   * nothing where smooth scrolling is unavailable, leaving the card selected
   * but off-screen. Scrolling the container to a computed offset always lands.
   */
  useEffect(() => {
    const id = pendingScrollRef.current;
    if (!id || id !== selectedId) return;
    pendingScrollRef.current = null;

    const card = cardRefs.current.get(id);
    const container = listRef.current;
    if (!card) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const behavior: ScrollBehavior = reduceMotion ? "auto" : "smooth";

    // Below `lg` the list is not its own scroll area — the page is.
    const scrollsInternally =
      container != null && container.scrollHeight > container.clientHeight + 1;

    if (!scrollsInternally) {
      card.scrollIntoView({ behavior, block: "center" });
      return;
    }

    const cardRect = card.getBoundingClientRect();
    const boxRect = container.getBoundingClientRect();
    const centred =
      container.scrollTop +
      (cardRect.top - boxRect.top) -
      (boxRect.height - cardRect.height) / 2;
    const top = Math.max(
      0,
      Math.min(centred, container.scrollHeight - container.clientHeight),
    );

    container.scrollTo({ top, behavior });
    // Some environments treat "smooth" as a no-op rather than an instant jump;
    // if nothing moved, place it directly.
    const timer = setTimeout(() => {
      if (Math.abs(container.scrollTop - top) > 4) container.scrollTop = top;
    }, 400);
    return () => clearTimeout(timer);
  }, [selectedId]);

  const activeId = hoveredId ?? selectedId;
  const selectedProperty = properties.find((p) => p.id === selectedId) ?? null;

  return (
    <>
      <GenderGradientDefs />

      <div className="mb-3 flex flex-wrap items-center gap-3">
        {/* The place that seeded this view. Removable: once the user is
            browsing the map, restricting results to the school or district
            they started from only hides inventory they can plainly see. */}
        {place ? (
          <button
            type="button"
            onClick={clearPlace}
            className="flex items-center gap-1.5 rounded-full border border-ink-300 bg-ink-900 py-1.5 pr-2 pl-3.5 text-sm font-medium text-white transition hover:bg-ink-700"
            aria-label={`${place.label} ✕`}
          >
            {place.label}
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20">
              <X className="h-3 w-3" aria-hidden />
            </span>
          </button>
        ) : null}

        {/* Legend — the pins encode who a place accepts, not its price. */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-ink-500">
          {(["male", "female", "any"] as GenderPolicy[]).map((g) => (
            <span key={g} className="flex items-center gap-1.5">
              <span
                className="flex h-5 w-5 items-center justify-center rounded-full border border-ink-200 bg-white"
                dangerouslySetInnerHTML={{ __html: genderSwatch(g) }}
              />
              {tEnum(`gender.${g}`)}
            </span>
          ))}
        </div>

        {/* Once the map drives the results, saying "85 in Gangnam-gu" while
            showing Gangdong-gu listings would be a lie — the count follows
            whichever is actually in charge. */}
        <span className="flex items-center gap-1.5 text-sm font-medium text-ink-700">
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : null}
          {userMovedMap
            ? t("resultsInView", { count: properties.length })
            : t("resultsCount", { count: properties.length })}
        </span>

        {/* Mobile list/map toggle */}
        <div className="ml-auto inline-flex rounded-full border border-ink-200 bg-white p-1 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileView("list")}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
              mobileView === "list" ? "bg-ink-900 text-white" : "text-ink-600"
            }`}
          >
            <List className="h-4 w-4" aria-hidden />
            {t("showList")}
          </button>
          <button
            type="button"
            onClick={() => setMobileView("map")}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
              mobileView === "map" ? "bg-ink-900 text-white" : "text-ink-600"
            }`}
          >
            <MapIcon className="h-4 w-4" aria-hidden />
            {t("showMap")}
          </button>
        </div>
      </div>

      {/* grid-cols-1 (not just the bare default single-column) matters here:
          Tailwind's grid-cols-N always sizes tracks as minmax(0,1fr), while an
          unconstrained implicit grid track sizes to `auto` — letting a long
          untruncated child (e.g. a wide title) silently stretch the whole row,
          and every card in it, past the visible edge on mobile. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,44%)]">
        {/* Its own scroll container, so selecting a pin scrolls the list
            rather than the whole page. */}
        <div
          ref={listRef}
          className={`flex flex-col gap-2 lg:h-[calc(100vh-9rem)] lg:overflow-y-auto lg:pr-2 ${
            mobileView === "map" ? "hidden lg:flex" : ""
          }`}
        >
          {properties.length === 0 ? (
            <div className="rounded-[var(--radius-card)] border border-ink-200 bg-ink-50 px-6 py-12 text-center">
              <p className="text-base font-medium text-ink-800">
                {userMovedMap ? t("noneInView") : t("noResults")}
              </p>
              <p className="mt-1 text-sm text-ink-500">
                {userMovedMap ? t("noneInViewHint") : t("noResultsHint")}
              </p>
            </div>
          ) : null}

          {visibleProperties.map((property) => (
            <div
              key={property.id}
              ref={(el) => {
                if (el) cardRefs.current.set(property.id, el);
                else cardRefs.current.delete(property.id);
              }}
            >
              <PropertyCard
                property={property}
                isActive={activeId === property.id}
                isSelected={selectedId === property.id}
                onHover={setHoveredId}
                imageUrl={property.cover_path ? publicImageUrl(property.cover_path) : null}
              />
            </div>
          ))}

          {remaining > 0 ? (
            <div ref={sentinelRef} className="flex justify-center py-4">
              <button
                type="button"
                onClick={showMore}
                className="rounded-full border border-ink-200 bg-white px-4 py-2 text-sm font-medium text-ink-700 transition hover:bg-ink-50"
              >
                {t("showMore", { remaining })}
              </button>
            </div>
          ) : null}
        </div>

        <div
          className={`lg:sticky lg:top-20 lg:h-[calc(100vh-9rem)] ${
            mobileView === "list" ? "hidden lg:block" : "h-[60vh]"
          }`}
        >
          <MapView
            // Force a full remount when the mobile tab switches to "map".
            // The map sat invisible (display:none) under "list", where a map
            // SDK measures its container as zero-size; a stale instance can
            // then misjudge its own viewport once revealed and — worse —
            // its idle-suppression window is keyed to when IT last moved,
            // not to this reveal, so a resize-triggered relayout can slip
            // through as a "user panned here" and silently refetch the wrong
            // bounds. A fresh instance is constructed only once genuinely
            // visible, sized correctly from the start, with its own clean
            // suppression window. No-op on desktop, where mobileView never
            // changes (its toggle buttons are mobile-only).
            key={mobileView}
            markers={markers}
            activeId={activeId}
            selectedId={selectedId}
            onMarkerClick={onMarkerClick}
            onBoundsChange={onBoundsChange}
            center={center}
            autoFit={!userMovedMap}
            // Kakao only understands Korean queries; Google's key wants the
            // English one it was built from — so pick by the site's own
            // locale, not by which map provider happens to be mounted.
            highlightQuery={(locale === "en" ? place?.geocodeQuery : place?.label) ?? null}
            className="h-full w-full"
          />
        </div>
      </div>

      {/* Mobile pin-tap preview: peeks up over the bottom of the map with
          just the tapped listing — the same card as the list, at the same
          size — so a tap doesn't yank the whole screen away from the map
          into the full list. Map and List/Show map toggle stay put. */}
      {mobileView === "map" && selectedProperty ? (
        <div className="fixed inset-x-0 bottom-0 z-30 px-3 pb-3 lg:hidden">
          <div className="relative rounded-[var(--radius-card)] bg-white shadow-lg">
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              aria-label={tCommon("close")}
              className="absolute -top-3 right-1 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-ink-200 bg-white text-ink-600 shadow-md"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
            <PropertyCard
              property={selectedProperty}
              isSelected
              imageUrl={
                selectedProperty.cover_path ? publicImageUrl(selectedProperty.cover_path) : null
              }
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
