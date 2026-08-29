"use client";

import { useEffect, useRef, useState } from "react";
import { MapPinned } from "lucide-react";

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  label: string;
  /** Rendered inside the pin — usually the price. */
  badge?: string;
  href?: string;
}

declare global {
  interface Window {
    kakao?: KakaoNamespace;
  }
}

// Minimal shape of the parts of the Kakao Maps SDK we actually touch.
interface KakaoLatLng {
  getLat(): number;
  getLng(): number;
}
interface KakaoNamespace {
  maps: {
    load(cb: () => void): void;
    LatLng: new (lat: number, lng: number) => KakaoLatLng;
    LatLngBounds: new () => { extend(ll: KakaoLatLng): void; isEmpty(): boolean };
    Map: new (
      container: HTMLElement,
      options: { center: KakaoLatLng; level: number },
    ) => {
      setBounds(bounds: object, ...padding: number[]): void;
      setCenter(ll: KakaoLatLng): void;
      setLevel(level: number): void;
      /** Re-measures the container; needed if it resized after init. */
      relayout(): void;
    };
    CustomOverlay: new (options: {
      position: KakaoLatLng;
      content: HTMLElement;
      yAnchor?: number;
      zIndex?: number;
    }) => { setMap(map: object | null): void; setZIndex(z: number): void };
    event: {
      addListener(target: object, type: string, handler: () => void): void;
    };
  };
}

const SDK_ID = "kakao-maps-sdk";

function loadKakaoSdk(appKey: string): Promise<KakaoNamespace> {
  return new Promise((resolve, reject) => {
    if (window.kakao?.maps?.LatLng) return resolve(window.kakao);

    const existing = document.getElementById(SDK_ID) as HTMLScriptElement | null;
    const onReady = () => window.kakao!.maps.load(() => resolve(window.kakao!));

    if (existing) {
      existing.addEventListener("load", onReady);
      existing.addEventListener("error", () => reject(new Error("sdk-error")));
      return;
    }

    const script = document.createElement("script");
    script.id = SDK_ID;
    script.async = true;
    // autoload=false so we control init timing via kakao.maps.load().
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&autoload=false`;
    script.addEventListener("load", onReady);
    script.addEventListener("error", () => reject(new Error("sdk-error")));
    document.head.appendChild(script);
  });
}

function buildPin(marker: MapMarker, isActive: boolean): HTMLElement {
  const el = document.createElement("div");
  el.className = [
    "cursor-pointer select-none rounded-full border px-2.5 py-1 text-xs font-semibold shadow-md transition",
    isActive
      ? "border-brand-600 bg-brand-500 text-white scale-110"
      : "border-ink-200 bg-white text-ink-800 hover:border-ink-400",
  ].join(" ");
  el.textContent = marker.badge ?? marker.label;
  el.title = marker.label;
  return el;
}

export function KakaoMap({
  markers,
  activeId,
  onMarkerClick,
  center,
  className = "",
}: {
  markers: MapMarker[];
  activeId?: string | null;
  onMarkerClick?: (id: string) => void;
  center?: { lat: number; lng: number };
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<InstanceType<KakaoNamespace["maps"]["Map"]> | null>(null);
  const overlaysRef = useRef<Map<string, { overlay: { setMap(m: object | null): void; setZIndex(z: number): void }; el: HTMLElement }>>(new Map());
  const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;

  // Whether a key exists is known at render time — deriving it here avoids a
  // needless cascading render from setting it inside the effect.
  const [status, setStatus] = useState<"loading" | "ready" | "no-key" | "error">(
    appKey ? "loading" : "no-key",
  );

  // Boot the SDK and create the map once.
  useEffect(() => {
    if (!appKey) return;
    let cancelled = false;

    loadKakaoSdk(appKey)
      .then((kakao) => {
        if (cancelled || !containerRef.current) return;
        mapRef.current = new kakao.maps.Map(containerRef.current, {
          center: new kakao.maps.LatLng(
            center?.lat ?? 37.5665,
            center?.lng ?? 126.978,
          ),
          level: 6,
        });
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
    };
    // Intentionally one-shot: marker/center updates are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appKey]);

  // Sync markers whenever the result set changes.
  useEffect(() => {
    const kakao = window.kakao;
    const map = mapRef.current;
    if (status !== "ready" || !kakao || !map) return;

    overlaysRef.current.forEach(({ overlay }) => overlay.setMap(null));
    overlaysRef.current.clear();

    const bounds = new kakao.maps.LatLngBounds();

    markers.forEach((marker) => {
      const position = new kakao.maps.LatLng(marker.lat, marker.lng);
      const el = buildPin(marker, marker.id === activeId);
      el.addEventListener("click", () => onMarkerClick?.(marker.id));

      const overlay = new kakao.maps.CustomOverlay({
        position,
        content: el,
        yAnchor: 1.2,
      });
      overlay.setMap(map);
      overlaysRef.current.set(marker.id, { overlay, el });
      bounds.extend(position);
    });

    if (markers.length > 1) {
      map.setBounds(bounds, 48, 48, 48, 48);
    } else if (markers.length === 1) {
      map.setCenter(new kakao.maps.LatLng(markers[0].lat, markers[0].lng));
      map.setLevel(4);
    }

    // Kakao measures the container once, at construction. If the map was built
    // before layout settled — a slow first paint, a font swap, the sticky
    // column resolving its height — it keeps those stale dimensions and renders
    // the wrong region entirely. Re-measure whenever the container changes size
    // and re-apply the fit.
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      map.relayout();
      if (markers.length > 1) map.setBounds(bounds, 48, 48, 48, 48);
      else if (markers.length === 1) {
        map.setCenter(new kakao.maps.LatLng(markers[0].lat, markers[0].lng));
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers, status]);

  // Restyle the active pin without rebuilding every overlay.
  useEffect(() => {
    if (status !== "ready") return;
    overlaysRef.current.forEach(({ overlay, el }, id) => {
      const marker = markers.find((m) => m.id === id);
      if (!marker) return;
      const isActive = id === activeId;
      const fresh = buildPin(marker, isActive);
      el.className = fresh.className;
      overlay.setZIndex(isActive ? 10 : 1);
    });
  }, [activeId, markers, status]);

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
                Add <code className="font-mono">NEXT_PUBLIC_KAKAO_MAP_KEY</code>{" "}
                to <code className="font-mono">.env.local</code> to enable the
                map.{" "}
                {markers.length === 1
                  ? "1 listing has"
                  : `${markers.length} listings have`}{" "}
                coordinates ready.
              </>
            ) : (
              <>
                Check that your Kakao app has this domain registered under Web
                platform settings.
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
