import type { GenderPolicy } from "@/lib/types/database";

/**
 * Shared between every map provider (Kakao, Google, …) so SearchResults and
 * the property page can swap the underlying map without caring which one is
 * mounted.
 */
export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  label: string;
  gender: GenderPolicy;
}

export interface MapBounds {
  swLat: number;
  swLng: number;
  neLat: number;
  neLng: number;
}

/** Props every map provider component accepts, so MapView can spread blindly. */
export interface MapProviderProps {
  markers: MapMarker[];
  activeId?: string | null;
  selectedId?: string | null;
  onMarkerClick?: (id: string) => void;
  /** `userInitiated` is false for our own fitBounds/setCenter calls. */
  onBoundsChange?: (bounds: MapBounds, userInitiated: boolean) => void;
  center?: { lat: number; lng: number };
  /** Fit the view to the markers. Off once the user takes control by panning. */
  autoFit?: boolean;
  className?: string;
}
