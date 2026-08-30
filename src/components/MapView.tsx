"use client";

import { useLocale } from "next-intl";
import { KakaoMap } from "./KakaoMap";
import { GoogleMap } from "./GoogleMap";
import type { MapProviderProps } from "./map-types";

export type { MapMarker, MapBounds } from "./map-types";

/**
 * Picks the map engine by locale.
 *
 * Kakao's JS SDK has no language parameter — the base map (roads, district
 * names) stays Korean no matter what locale the site is in, confirmed by
 * loading it live. Google's does support one, so the English site uses Google
 * instead; Korean keeps Kakao, which has the more complete domestic coverage.
 *
 * Falls back to Kakao whenever no Google Maps key is configured, so the
 * English site keeps working — with Korean map labels — until one is added.
 * Never a blank map for want of a key.
 */
export function MapView(props: MapProviderProps) {
  const locale = useLocale();
  const hasGoogleKey = Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);

  if (locale === "en" && hasGoogleKey) {
    return <GoogleMap {...props} />;
  }
  return <KakaoMap {...props} />;
}
