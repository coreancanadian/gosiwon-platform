"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MapPinned } from "lucide-react";
import { buildPinElement } from "./map-pin";
import { useIdleSuppression } from "@/lib/use-idle-suppression";
import type { MapProviderProps } from "./map-types";

export type { MapMarker, MapBounds } from "./map-types";

declare global {
  interface Window {
    kakao?: KakaoNamespace;
  }
}

interface KakaoLatLng {
  getLat(): number;
  getLng(): number;
}
interface KakaoBounds {
  extend(ll: KakaoLatLng): void;
  getSouthWest(): KakaoLatLng;
  getNorthEast(): KakaoLatLng;
}
interface KakaoMapInstance {
  setBounds(bounds: object, ...padding: number[]): void;
  setCenter(ll: KakaoLatLng): void;
  setLevel(level: number): void;
  getBounds(): KakaoBounds;
  relayout(): void;
}
interface KakaoNamespace {
  maps: {
    load(cb: () => void): void;
    LatLng: new (lat: number, lng: number) => KakaoLatLng;
    LatLngBounds: new () => KakaoBounds;
    Map: new (
      container: HTMLElement,
      options: { center: KakaoLatLng; level: number },
    ) => KakaoMapInstance;
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
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&autoload=false`;
    script.addEventListener("load", onReady);
    script.addEventListener("error", () => reject(new Error("sdk-error")));
    document.head.appendChild(script);
  });
}

export function KakaoMap({
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
  const mapRef = useRef<KakaoMapInstance | null>(null);
  const overlaysRef = useRef<
    Map<string, { overlay: { setMap(m: object | null): void; setZIndex(z: number): void }; el: HTMLElement }>
  >(new Map());
  // Holds the latest callback so the map's "idle" listener never has to be
  // torn down and re-registered when the parent re-renders.
  const boundsCbRef = useRef(onBoundsChange);
  useEffect(() => {
    boundsCbRef.current = onBoundsChange;
  }, [onBoundsChange]);

  const { suppress, isSuppressed } = useIdleSuppression();

  const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;
  const [status, setStatus] = useState<"loading" | "ready" | "no-key" | "error">(
    appKey ? "loading" : "no-key",
  );

  const emitBounds = useCallback((userInitiated: boolean) => {
    const map = mapRef.current;
    if (!map || !boundsCbRef.current) return;
    const b = map.getBounds();
    const sw = b.getSouthWest();
    const ne = b.getNorthEast();
    boundsCbRef.current(
      {
        swLat: sw.getLat(),
        swLng: sw.getLng(),
        neLat: ne.getLat(),
        neLng: ne.getLng(),
      },
      userInitiated,
    );
  }, []);

  useEffect(() => {
    if (!appKey) return;
    let cancelled = false;

    loadKakaoSdk(appKey)
      .then((kakao) => {
        if (cancelled || !containerRef.current) return;
        const map = new kakao.maps.Map(containerRef.current, {
          center: new kakao.maps.LatLng(center?.lat ?? 37.5665, center?.lng ?? 126.978),
          level: 6,
        });
        mapRef.current = map;
        suppress(); // the initial render's own settle is not a user gesture

        // Always report the viewport — the parent needs it to refetch on
        // demand even before the user has panned — but flag whether the
        // movement came from the user or from our own fitting.
        kakao.maps.event.addListener(map, "idle", () => {
          emitBounds(!isSuppressed());
        });

        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appKey]);

  // Rebuild overlays whenever the marker set changes.
  useEffect(() => {
    const kakao = window.kakao;
    const map = mapRef.current;
    if (status !== "ready" || !kakao || !map) return;

    overlaysRef.current.forEach(({ overlay }) => overlay.setMap(null));
    overlaysRef.current.clear();

    const bounds = new kakao.maps.LatLngBounds();

    markers.forEach((marker) => {
      const position = new kakao.maps.LatLng(marker.lat, marker.lng);
      const el = buildPinElement({
        gender: marker.gender,
        label: marker.label,
        isActive: marker.id === activeId,
        isSelected: marker.id === selectedId,
      });
      el.addEventListener("click", () => onMarkerClick?.(marker.id));

      const overlay = new kakao.maps.CustomOverlay({
        position,
        content: el,
        yAnchor: 1.1,
      });
      overlay.setMap(map);
      overlaysRef.current.set(marker.id, { overlay, el });
      bounds.extend(position);
    });

    const fit = () => {
      if (!autoFit) return;
      suppress();
      if (markers.length > 1) map.setBounds(bounds, 48, 48, 48, 48);
      else if (markers.length === 1) {
        map.setCenter(new kakao.maps.LatLng(markers[0].lat, markers[0].lng));
        map.setLevel(4);
      }
    };
    fit();

    // Kakao measures the container once, at construction. If layout settles
    // afterwards it keeps stale dimensions and renders the wrong region, so
    // re-measure on resize and re-apply the fit.
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      map.relayout();
      fit();
    });
    observer.observe(container);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers, status, autoFit]);

  // Restyle highlighted pins without rebuilding every overlay.
  useEffect(() => {
    if (status !== "ready") return;
    overlaysRef.current.forEach(({ overlay, el }, id) => {
      const marker = markers.find((m) => m.id === id);
      if (!marker) return;
      const isActive = id === activeId;
      const isSelected = id === selectedId;
      const fresh = buildPinElement({
        gender: marker.gender,
        label: marker.label,
        isActive,
        isSelected,
      });
      el.className = fresh.className;
      overlay.setZIndex(isSelected ? 20 : isActive ? 10 : 1);
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
                Add <code className="font-mono">NEXT_PUBLIC_KAKAO_MAP_KEY</code> to{" "}
                <code className="font-mono">.env.local</code>.
              </>
            ) : (
              <>
                Register this domain under the JavaScript key&apos;s SDK domain
                settings in the Kakao console.
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
