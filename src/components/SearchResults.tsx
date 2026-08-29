"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { List, Loader2, Map as MapIcon, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import { PropertyCard } from "./PropertyCard";
import { KakaoMap, type MapBounds, type MapMarker } from "./KakaoMap";
import { genderSwatch } from "./map-pin";
import { GenderGradientDefs } from "./GenderGradientDefs";
import { createClient } from "@/lib/supabase/client";
import type { Locale } from "@/i18n/routing";
import { publicImageUrl } from "@/lib/storage";
import { TYPES_BY_CATEGORY } from "@/lib/search-bands";
import type {
  GenderPolicy,
  HousingCategory,
  PropertyType,
  PropertyWithRelations,
} from "@/lib/types/database";

/** Filters the server already applied, replayed when refetching by map bounds. */
export interface ActiveFilters {
  gender?: GenderPolicy;
  propertyType?: PropertyType;
  housingCategory?: HousingCategory;
  minPrice?: number;
  maxPrice?: number;
  university?: string;
}

const MAX_IN_VIEW = 300;

function coverUrl(property: PropertyWithRelations): string | null {
  const images = property.property_images ?? [];
  if (images.length === 0) return null;
  const cover =
    images.find((i) => i.is_cover) ??
    [...images].sort((a, b) => a.sort_order - b.sort_order)[0];
  return cover ? publicImageUrl(cover.storage_path) : null;
}

/** The region / station / university the user arrived from, if any. */
export interface PlaceContext {
  /** URL param that selected it, e.g. "university". */
  param: "region" | "station" | "university";
  slug: string;
  label: string;
}

export function SearchResults({
  properties: initialProperties,
  center,
  filters = {},
  place = null,
}: {
  properties: PropertyWithRelations[];
  center?: { lat: number; lng: number };
  filters?: ActiveFilters;
  place?: PlaceContext | null;
}) {
  const t = useTranslations("Search");
  const tEnum = useTranslations("Enums");
  const locale = useLocale() as Locale;

  const [properties, setProperties] = useState(initialProperties);
  const [loading, setLoading] = useState(false);
  // Hover highlights; a pin click also scrolls the list.
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"list" | "map">("list");
  // Stop re-fitting the viewport once the user starts driving the map.
  const [userMovedMap, setUserMovedMap] = useState(false);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const listRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef(new Map<string, HTMLElement>());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set by a pin click so hovering a card never yanks the list around.
  const pendingScrollRef = useRef<string | null>(null);
  // Latest viewport, kept even when the user hasn't panned, so clearing the
  // place can refetch immediately without waiting for a map movement.
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

    // Once the map is in charge it owns the list. Adopting the server's set
    // here would undo that — clearing the place navigates, and the unfiltered
    // response would replace the viewport's results with a nationwide list
    // labelled as if it were "in this area".
    if (movedToNewPlace || !userMovedMap) {
      setProperties(initialProperties);
      if (movedToNewPlace) setUserMovedMap(false);
    }
  }

  /**
   * Refetch whatever is inside the viewport.
   *
   * Once the map moves it — not the region or station that was clicked to get
   * here — decides what the list shows. Filters are replayed so panning never
   * quietly reintroduces listings the user filtered out.
   */
  const fetchInBounds = useCallback(
    async (bounds: MapBounds) => {
      setLoading(true);
      const supabase = createClient();

      let query = supabase
        .from("properties")
        .select("*, rooms (*), property_images (*), regions (*)")
        .eq("is_published", true)
        .gte("lat", bounds.swLat)
        .lte("lat", bounds.neLat)
        .gte("lng", bounds.swLng)
        .lte("lng", bounds.neLng)
        .limit(MAX_IN_VIEW);

      if (filters.gender && filters.gender !== "any") {
        query = query.in("gender", [filters.gender, "any"]);
      }
      if (filters.propertyType) {
        query = query.eq("property_type", filters.propertyType);
      } else if (filters.housingCategory) {
        query = query.in("property_type", TYPES_BY_CATEGORY[filters.housingCategory]);
      }
      if (filters.minPrice != null) query = query.gte("price_max", filters.minPrice);
      if (filters.maxPrice != null) query = query.lte("price_min", filters.maxPrice);
      if (filters.university) {
        query = query.contains("nearby_universities", [filters.university]);
      }

      const { data, error } = await query;
      setLoading(false);
      if (error) return;
      setProperties((data ?? []) as unknown as PropertyWithRelations[]);
    },
    [filters],
  );

  const onBoundsChange = useCallback(
    (bounds: MapBounds, userInitiated: boolean) => {
      lastBoundsRef.current = bounds;
      if (!userInitiated) return;
      setUserMovedMap(true);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => fetchInBounds(bounds), 350);
    },
    [fetchInBounds],
  );

  /**
   * Drop the starting place and keep browsing from here.
   *
   * The URL param goes so the heading and a shared link agree with what is on
   * screen, and the current viewport is refetched immediately rather than
   * waiting for the user to nudge the map.
   */
  const clearPlace = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    if (place) next.delete(place.param);
    setUserMovedMap(true);
    if (lastBoundsRef.current) fetchInBounds(lastBoundsRef.current);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [fetchInBounds, pathname, place, router, searchParams]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const markers: MapMarker[] = useMemo(
    () =>
      properties
        .filter((p) => p.lat != null && p.lng != null)
        .map((p) => ({
          id: p.id,
          lat: p.lat!,
          lng: p.lng!,
          label: (locale === "ko" ? p.name_ko : p.name_en) || p.name_ko,
          gender: p.gender,
        })),
    [properties, locale],
  );

  /** Clicking a pin selects the listing; the effect below scrolls to it. */
  const onMarkerClick = useCallback((id: string) => {
    setSelectedId(id);
    setMobileView("list");
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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,44%)]">
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

          {properties.map((property) => (
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
                imageUrl={coverUrl(property)}
              />
            </div>
          ))}
        </div>

        <div
          className={`lg:sticky lg:top-20 lg:h-[calc(100vh-9rem)] ${
            mobileView === "list" ? "hidden lg:block" : "h-[60vh]"
          }`}
        >
          <KakaoMap
            markers={markers}
            activeId={activeId}
            selectedId={selectedId}
            onMarkerClick={onMarkerClick}
            onBoundsChange={onBoundsChange}
            center={center}
            autoFit={!userMovedMap}
            className="h-full w-full"
          />
        </div>
      </div>
    </>
  );
}
