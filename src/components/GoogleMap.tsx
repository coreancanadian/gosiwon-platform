"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MapPinned } from "lucide-react";
import { buildPinElement } from "./map-pin";
import { useIdleSuppression } from "@/lib/use-idle-suppression";
import type { MapProviderProps } from "./map-types";

/**
 * The English-locale map. Kakao's tiles have no language switch — see
 * MapView — so Google Maps (whose JS API takes a real `language` parameter)
 * stands in whenever a key is configured.
 */

declare global {
  interface Window {
    google?: GoogleNamespace;
    __gmapsCallback?: () => void;
  }
}

// Minimal surface of the Google Maps JS API actually used here.
interface GLatLng {
  lat(): number;
  lng(): number;
}
interface GLatLngBounds {
  extend(ll: GLatLng): void;
  getSouthWest(): GLatLng;
  getNorthEast(): GLatLng;
}
interface GMapInstance {
  setCenter(ll: GLatLng): void;
  setZoom(z: number): void;
  fitBounds(bounds: GLatLngBounds, padding?: number): void;
  getBounds(): GLatLngBounds | undefined;
}
interface GMapsEventListener {
  remove(): void;
}
interface GOverlayView {
  setMap(map: GMapInstance | null): void;
  getPanes(): { overlayMouseTarget: HTMLElement };
  getProjection(): {
    fromLatLngToDivPixel(ll: GLatLng): { x: number; y: number };
  };
}
interface GoogleNamespace {
  maps: {
    Map: new (
      el: HTMLElement,
      opts: {
        center: GLatLng;
        zoom: number;
        disableDefaultUI?: boolean;
        clickableIcons?: boolean;
        gestureHandling?: string;
      },
    ) => GMapInstance;
    LatLng: new (lat: number, lng: number) => GLatLng;
    LatLngBounds: new () => GLatLngBounds;
    OverlayView: { new (): GOverlayView };
    event: {
      addListener(
        target: object,
        type: string,
        handler: () => void,
      ): GMapsEventListener;
      trigger(target: object, type: string): void;
    };
  };
}

const SDK_ID = "google-maps-sdk";
const CALLBACK_NAME = "__gmapsCallback";

function loadGoogleMapsSdk(key: string): Promise<GoogleNamespace> {
  return new Promise((resolve, reject) => {
    if (window.google?.maps?.LatLng) return resolve(window.google);

    const existing = document.getElementById(SDK_ID) as HTMLScriptElement | null;
    if (existing) {
      // A load is already in flight (e.g. two maps mounting at once);
      // chain onto its callback rather than injecting the script twice.
      const prev = window.__gmapsCallback;
      window.__gmapsCallback = () => {
        prev?.();
        resolve(window.google!);
      };
      existing.addEventListener("error", () => reject(new Error("sdk-error")));
      return;
    }

    window.__gmapsCallback = () => resolve(window.google!);

    const script = document.createElement("script");
    script.id = SDK_ID;
    script.async = true;
    // language=en is the whole point of using Google here — Kakao's SDK has
    // no equivalent parameter.
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&language=en&callback=${CALLBACK_NAME}`;
    script.addEventListener("error", () => reject(new Error("sdk-error")));
    document.head.appendChild(script);
  });
}

/**
 * A custom HTML pin positioned via OverlayView's projection.
 *
 * Google's Map has no built-in "arbitrary DOM element at a LatLng" the way
 * Kakao's CustomOverlay does — OverlayView, subclassed by hand, is the
 * documented way to get one.
 */
function createPinOverlay(
  google: GoogleNamespace,
  map: GMapInstance,
  position: GLatLng,
  el: HTMLElement,
): GOverlayView {
  class PinOverlay extends google.maps.OverlayView {
    constructor() {
      super();
      el.style.position = "absolute";
      // Anchor at bottom-center, matching Kakao's yAnchor pin behaviour.
      el.style.transform = "translate(-50%, -100%)";
    }
    onAdd() {
      this.getPanes().overlayMouseTarget.appendChild(el);
    }
    draw() {
      const point = this.getProjection()?.fromLatLngToDivPixel(position);
      if (!point) return;
      el.style.left = `${point.x}px`;
      el.style.top = `${point.y}px`;
    }
    onRemove() {
      el.parentElement?.removeChild(el);
    }
  }
  const overlay = new PinOverlay();
  overlay.setMap(map);
  return overlay;
}

export function GoogleMap({
  markers,
  activeId,
  selectedId,
  onMarkerClick,
  onBoundsChange,
  center,
  autoFit = true,
  className = "",
}: MapProviderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GMapInstance | null>(null);
  const googleRef = useRef<GoogleNamespace | null>(null);
  const overlaysRef = useRef<Map<string, { overlay: GOverlayView; el: HTMLElement }>>(
    new Map(),
  );
  const listenersRef = useRef<GMapsEventListener[]>([]);

  const boundsCbRef = useRef(onBoundsChange);
  useEffect(() => {
    boundsCbRef.current = onBoundsChange;
  }, [onBoundsChange]);

  const { suppress, isSuppressed } = useIdleSuppression();

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const [status, setStatus] = useState<"loading" | "ready" | "no-key" | "error">(
    apiKey ? "loading" : "no-key",
  );

  const emitBounds = useCallback((userInitiated: boolean) => {
    const map = mapRef.current;
    if (!map || !boundsCbRef.current) return;
    const b = map.getBounds();
    if (!b) return;
    const sw = b.getSouthWest();
    const ne = b.getNorthEast();
    boundsCbRef.current(
      { swLat: sw.lat(), swLng: sw.lng(), neLat: ne.lat(), neLng: ne.lng() },
      userInitiated,
    );
  }, []);

  useEffect(() => {
    if (!apiKey) return;
    let cancelled = false;

    loadGoogleMapsSdk(apiKey)
      .then((google) => {
        if (cancelled || !containerRef.current) return;
        googleRef.current = google;

        const map = new google.maps.Map(containerRef.current, {
          center: new google.maps.LatLng(center?.lat ?? 37.5665, center?.lng ?? 126.978),
          zoom: 13,
          disableDefaultUI: true,
          clickableIcons: false,
          gestureHandling: "greedy",
        });
        mapRef.current = map;
        suppress(); // the initial render's own settle is not a user gesture

        listenersRef.current.push(
          google.maps.event.addListener(map, "idle", () => {
            emitBounds(!isSuppressed());
          }),
        );

        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
      listenersRef.current.forEach((l) => l.remove());
      listenersRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  // Rebuild overlays whenever the marker set changes.
  useEffect(() => {
    const google = googleRef.current;
    const map = mapRef.current;
    if (status !== "ready" || !google || !map) return;

    overlaysRef.current.forEach(({ overlay }) => overlay.setMap(null));
    overlaysRef.current.clear();

    const bounds = new google.maps.LatLngBounds();

    markers.forEach((marker) => {
      const position = new google.maps.LatLng(marker.lat, marker.lng);
      const el = buildPinElement({
        gender: marker.gender,
        label: marker.label,
        isActive: marker.id === activeId,
        isSelected: marker.id === selectedId,
      });
      el.addEventListener("click", () => onMarkerClick?.(marker.id));

      const overlay = createPinOverlay(google, map, position, el);
      overlaysRef.current.set(marker.id, { overlay, el });
      bounds.extend(position);
    });

    const fit = () => {
      if (!autoFit) return;
      suppress();
      if (markers.length > 1) map.fitBounds(bounds, 48);
      else if (markers.length === 1) {
        map.setCenter(new google.maps.LatLng(markers[0].lat, markers[0].lng));
        map.setZoom(16);
      }
    };
    fit();

    // Google does not auto-detect container resizes; without an explicit
    // "resize" trigger a map built before its layout settles keeps stale
    // dimensions — the same failure mode already found and fixed on Kakao.
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      google.maps.event.trigger(map, "resize");
      fit();
    });
    observer.observe(container);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers, status, autoFit]);

  // Restyle highlighted pins without rebuilding every overlay.
  useEffect(() => {
    if (status !== "ready") return;
    overlaysRef.current.forEach(({ el }, id) => {
      const marker = markers.find((m) => m.id === id);
      if (!marker) return;
      const fresh = buildPinElement({
        gender: marker.gender,
        label: marker.label,
        isActive: id === activeId,
        isSelected: id === selectedId,
      });
      el.className = fresh.className;
    });
  }, [activeId, selectedId, markers, status]);

  if (status === "no-key" || status === "error") {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-3 rounded-[var(--radius-card)] border border-dashed border-ink-300 bg-ink-50 p-8 text-center ${className}`}
      >
        <MapPinned className="h-8 w-8 text-ink-400" aria-hidden />
        <div>
          <p className="text-sm font-medium text-ink-700">
            {status === "no-key" ? "Map key not configured" : "Map failed to load"}
          </p>
          <p className="mt-1 max-w-xs text-xs text-ink-500">
            {status === "no-key" ? (
              <>
                Add <code className="font-mono">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code>{" "}
                to <code className="font-mono">.env.local</code>.
              </>
            ) : (
              <>
                Check the key&apos;s HTTP referrer restrictions and that
                billing is enabled on the Google Cloud project.
              </>
            )}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <div ref={containerRef} className="h-full w-full rounded-[var(--radius-card)]" />
      {status === "loading" ? (
        <div className="absolute inset-0 animate-pulse rounded-[var(--radius-card)] bg-ink-100" />
      ) : null}
    </div>
  );
}
