"use client"

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LatLngExpression } from "leaflet";
import { Circle } from "react-leaflet/Circle";
import { CircleMarker } from "react-leaflet/CircleMarker";
import { MapContainer } from "react-leaflet/MapContainer";
import { Marker } from "react-leaflet/Marker";
import { TileLayer } from "react-leaflet/TileLayer";
import { Tooltip } from "react-leaflet/Tooltip";
import { useMap, useMapEvents } from "react-leaflet/hooks";

import type { GoogleResultadoItem } from "@/lib/prospeccion/google-client";

import "leaflet/dist/leaflet.css";

const SELECTED_COLOR = "#f97316";
const DEFAULT_COLOR = "#0ea5e9";

function radiusToZoom(radius: number): number {
  if (radius <= 200) return 16;
  if (radius <= 500) return 15;
  if (radius <= 1000) return 14;
  if (radius <= 3000) return 13;
  if (radius <= 6000) return 12;
  if (radius <= 10000) return 11;
  if (radius <= 20000) return 10;
  return 9;
}

type GoogleResultsMapProps = {
  center: { lat: number; lng: number };
  radius: number;
  results: GoogleResultadoItem[];
  highlightIds?: Set<string>;
  onCenterChange?: (coords: { lat: number; lng: number }) => void;
  onViewportChange?: (viewport: { bounds: { west: number; south: number; east: number; north: number }; zoom: number }) => void;
  fitBounds?: { west: number; south: number; east: number; north: number } | null;
  fitBoundsKey?: string;
  autoFitBounds?: boolean;
  autoFitKey?: string;
  showSearchCircle?: boolean;
  enableCenterControls?: boolean;
};

export const GoogleResultsMap = memo(function GoogleResultsMap({
  center,
  radius,
  results,
  highlightIds,
  onCenterChange,
  onViewportChange,
  fitBounds = null,
  fitBoundsKey,
  autoFitBounds = false,
  autoFitKey,
  showSearchCircle = true,
  enableCenterControls = true,
}: GoogleResultsMapProps) {
  const zoom = radiusToZoom(radius);
  const mapCenter: LatLngExpression = [center.lat, center.lng];
  const [currentZoom, setCurrentZoom] = useState<number>(zoom);
  const validResults = useMemo(
    () =>
      results.filter((item) => typeof item.lat === "number" && typeof item.lng === "number") as Array<
        GoogleResultadoItem & { lat: number; lng: number }
      >,
    [results],
  );

  return (
    <MapContainer center={mapCenter} zoom={zoom} scrollWheelZoom className="h-full min-h-[420px] w-full rounded-xl">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapAutoResize />
      {autoFitBounds ? (
        <MapAutoFit results={validResults} fallbackCenter={mapCenter} fallbackZoom={zoom} fitKey={autoFitKey} />
      ) : (
        <MapViewUpdater center={mapCenter} zoom={zoom} />
      )}
      {fitBounds ? <MapFitBounds bounds={fitBounds} fitKey={fitBoundsKey} /> : null}
      <MapZoomReporter onZoomChange={setCurrentZoom} />
      {onViewportChange ? <MapViewportReporter onViewportChange={onViewportChange} /> : null}
      {enableCenterControls ? <MapClickHandler onCenterChange={onCenterChange} /> : null}
      {showSearchCircle ? (
        <Circle center={mapCenter} radius={radius} pathOptions={{ color: "#2563eb", weight: 1.5, fillOpacity: 0.08 }} />
      ) : null}
      {enableCenterControls ? <DraggableCenterMarker position={mapCenter} onChange={onCenterChange} /> : null}
      {validResults.map((item) => {
        const kind = (item as unknown as { kind?: unknown }).kind;
        const clusterCount = (item as unknown as { cluster_count?: unknown; count?: unknown }).cluster_count ?? (item as unknown as { count?: unknown }).count;
        if (kind === "cluster" || (typeof clusterCount === "number" && clusterCount > 0)) {
          const countValue = typeof clusterCount === "number" ? clusterCount : Number(clusterCount);
          return (
            <ClusterCircleMarker
              key={`cluster:${(item as unknown as { id?: unknown }).id ?? item.resultado_id ?? `${item.lat},${item.lng}`}`}
              position={[item.lat, item.lng]}
              count={Number.isFinite(countValue) ? countValue : 0}
              zoom={currentZoom}
            />
          );
        }
        const position: LatLngExpression = [item.lat, item.lng];
        const isHighlighted = highlightIds?.has(item.resultado_id ?? "");
        return (
          <CircleMarker
            key={item.resultado_id}
            center={position}
            radius={8}
            pathOptions={{
              color: isHighlighted ? SELECTED_COLOR : DEFAULT_COLOR,
              weight: isHighlighted ? 3 : 2,
              fillOpacity: 0.9,
              fillColor: isHighlighted ? SELECTED_COLOR : DEFAULT_COLOR,
            }}
          >
            <Tooltip direction="top">
              <ResultTooltipContent item={item} />
            </Tooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
});

function MapAutoResize() {
  const map = useMap();

  useEffect(() => {
    let raf = window.requestAnimationFrame(() => {
      map.invalidateSize({ pan: false });
    });

    const container = map.getContainer?.() as HTMLElement | undefined;
    if (!container || typeof ResizeObserver === "undefined") {
      return () => {
        window.cancelAnimationFrame(raf);
      };
    }

    const observer = new ResizeObserver(() => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => {
        map.invalidateSize({ pan: false });
      });
    });
    observer.observe(container);

    const onWindowResize = () => {
      map.invalidateSize({ pan: false });
    };
    window.addEventListener("resize", onWindowResize);

    return () => {
      window.cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener("resize", onWindowResize);
    };
  }, [map]);

  return null;
}

function ClusterCircleMarker({ position, count, zoom }: { position: LatLngExpression; count: number; zoom: number }) {
  const map = useMap();
  const clusterIcon = useClusterIcon(count, zoom);

  if (!clusterIcon) {
    return null;
  }

  return (
    <Marker
      position={position}
      icon={clusterIcon}
      eventHandlers={{
        click() {
          const nextZoom = Math.min(22, map.getZoom() + 2);
          map.setView(position, nextZoom);
        },
      }}
    />
  );
}

function ResultTooltipContent({ item }: { item: GoogleResultadoItem & Record<string, unknown> }) {
  const entries = useMemo(() => {
    const rows: Array<{ label: string; value: string; href?: string }> = [];
    const push = (label: string, value: unknown, href?: string) => {
      if (value === null || value === undefined) return;
      if (typeof value === "string" && !value.trim()) return;
      if (Array.isArray(value) && value.length === 0) return;
      const text = Array.isArray(value) ? value.map(String).filter(Boolean).join(", ") : String(value);
      if (!text.trim()) return;
      rows.push({ label, value: text, href });
    };

    push("Nombre", item.display_name ?? "Sin nombre");
    push("Actividad", item.actividad);
    push("Tipo", item.google_primary_type_display_name ?? item.google_primary_type);
    push("Tipos", item.google_types);
    push("Dirección", item.address);
    push("Teléfono", item.phone);
    push("Email", item.email);
    push("Sitio web", item.website, typeof item.website === "string" ? formatWebsiteUrl(item.website) : undefined);
    push("Tamaño", (item as Record<string, unknown>).estrato);
    if (typeof item.rating === "number") {
      push("Rating", item.rating.toFixed(1));
    }
    if (typeof item.reviews === "number") {
      push("Reseñas", item.reviews);
    }
    if (typeof item.lat === "number" && typeof item.lng === "number") {
      push("Coordenadas", `${item.lat.toFixed(6)}, ${item.lng.toFixed(6)}`);
    }
    return rows;
  }, [item]);

  return (
    <div className="max-w-[340px] space-y-1 text-xs">
      {entries.map((entry) => (
        <div key={entry.label} className="grid grid-cols-[92px_1fr] gap-2">
          <span className="text-muted-foreground">{entry.label}</span>
          {entry.href ? (
            <a
              href={entry.href}
              target="_blank"
              rel="noreferrer"
              className="break-words whitespace-normal text-primary underline underline-offset-2"
            >
              {entry.value}
            </a>
          ) : (
            <span className="break-words whitespace-normal">{entry.value}</span>
          )}
        </div>
      ))}
    </div>
  );
}

function formatWebsiteUrl(raw: string): string {
  const value = raw.trim();
  if (!value) {
    return raw;
  }
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }
  return `https://${value}`;
}

function MapViewUpdater({ center, zoom }: { center: LatLngExpression; zoom: number }) {
  const map = useMap();
  const lastCenterKey = useRef<string>(latLngToKey(center));
  const lastZoom = useRef<number>(zoom);
  const nextCenterKey = latLngToKey(center);

  useEffect(() => {
    if (!map) return;
    if (lastCenterKey.current === nextCenterKey && lastZoom.current === zoom) {
      return;
    }
    map.setView(center, zoom);
    lastCenterKey.current = nextCenterKey;
    lastZoom.current = zoom;
  }, [center, map, nextCenterKey, zoom]);

  return null;
}

function MapAutoFit({
  results,
  fallbackCenter,
  fallbackZoom,
  fitKey,
}: {
  results: Array<GoogleResultadoItem & { lat: number; lng: number }>;
  fallbackCenter: LatLngExpression;
  fallbackZoom: number;
  fitKey?: string;
}) {
  const map = useMap();
  const lastFitKey = useRef<string>("");

  const bounds = useMemo(() => {
    if (!results.length) {
      return null;
    }
    let minLat = results[0]!.lat;
    let maxLat = results[0]!.lat;
    let minLng = results[0]!.lng;
    let maxLng = results[0]!.lng;
    for (const item of results) {
      minLat = Math.min(minLat, item.lat);
      maxLat = Math.max(maxLat, item.lat);
      minLng = Math.min(minLng, item.lng);
      maxLng = Math.max(maxLng, item.lng);
    }
    return { minLat, maxLat, minLng, maxLng };
  }, [results]);

  useEffect(() => {
    if (!map) return;
    const nextKey = fitKey ?? `${results.length}`;
    if (lastFitKey.current === nextKey) {
      return;
    }
    if (!bounds) {
      map.setView(fallbackCenter, fallbackZoom);
      lastFitKey.current = nextKey;
      return;
    }
    if (results.length === 1) {
      map.setView([bounds.minLat, bounds.minLng], 14);
      lastFitKey.current = nextKey;
      return;
    }
    map.fitBounds(
      [
        [bounds.minLat, bounds.minLng],
        [bounds.maxLat, bounds.maxLng],
      ],
      { padding: [28, 28], maxZoom: 14 },
    );
    lastFitKey.current = nextKey;
  }, [bounds, fallbackCenter, fallbackZoom, fitKey, map, results.length]);

  return null;
}

function MapFitBounds({
  bounds,
  fitKey,
}: {
  bounds: { west: number; south: number; east: number; north: number };
  fitKey?: string;
}) {
  const map = useMap();
  const lastFitKey = useRef<string>("");

  useEffect(() => {
    if (!map) return;
    const nextKey =
      fitKey ??
      `${bounds.west.toFixed(5)},${bounds.south.toFixed(5)},${bounds.east.toFixed(5)},${bounds.north.toFixed(5)}`;
    if (lastFitKey.current === nextKey) {
      return;
    }
    map.fitBounds(
      [
        [bounds.south, bounds.west],
        [bounds.north, bounds.east],
      ],
      { padding: [28, 28], maxZoom: 14 },
    );
    lastFitKey.current = nextKey;
  }, [bounds.east, bounds.north, bounds.south, bounds.west, fitKey, map]);

  return null;
}

function latLngToKey(value: LatLngExpression): string {
  if (Array.isArray(value)) {
    return value.map((coord) => Number(coord).toFixed(6)).join(",");
  }
  if (typeof value === "object" && value) {
    const maybeLat = (value as { lat?: number }).lat;
    const maybeLng = (value as { lng?: number }).lng;
    if (typeof maybeLat === "number" && typeof maybeLng === "number") {
      return `${maybeLat.toFixed(6)},${maybeLng.toFixed(6)}`;
    }
  }
  return String(value);
}

function MapClickHandler({
  onCenterChange,
}: {
  onCenterChange?: (coords: { lat: number; lng: number }) => void;
}) {
  useMapEvents({
    click(event: { latlng: { lat: number; lng: number } }) {
      if (!onCenterChange) return;
      onCenterChange({ lat: event.latlng.lat, lng: event.latlng.lng });
    },
  });
  return null;
}

function MapViewportReporter({
  onViewportChange,
}: {
  onViewportChange: (viewport: { bounds: { west: number; south: number; east: number; north: number }; zoom: number }) => void;
}) {
  const lastKey = useRef<string>("");

  const emit = useCallback(
    (mapInstance: unknown) => {
      if (!mapInstance || typeof mapInstance !== "object") return;
      const map = mapInstance as {
        getZoom: () => number;
        getBounds: () => { getWest: () => number; getSouth: () => number; getEast: () => number; getNorth: () => number };
      };
      const zoom = map.getZoom();
      const bounds = map.getBounds();
      const payload = {
        bounds: { west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(), north: bounds.getNorth() },
        zoom,
      };
      const key = `${payload.zoom}:${payload.bounds.west.toFixed(5)},${payload.bounds.south.toFixed(5)},${payload.bounds.east.toFixed(
        5,
      )},${payload.bounds.north.toFixed(5)}`;
      if (key === lastKey.current) return;
      lastKey.current = key;
      onViewportChange(payload);
    },
    [onViewportChange],
  );

  const map = useMapEvents({
    moveend() {
      emit(map);
    },
    zoomend() {
      emit(map);
    },
  });

  useEffect(() => {
    emit(map);
  }, [emit, map]);

  return null;
}

function MapZoomReporter({ onZoomChange }: { onZoomChange: (zoom: number) => void }) {
  const lastZoom = useRef<number>(-1);
  const map = useMapEvents({
    zoomend() {
      const next = map.getZoom();
      if (next === lastZoom.current) return;
      lastZoom.current = next;
      onZoomChange(next);
    },
  });

  useEffect(() => {
    const next = map.getZoom();
    if (next === lastZoom.current) return;
    lastZoom.current = next;
    onZoomChange(next);
  }, [map, onZoomChange]);

  return null;
}

type LeafletMarker = {
  getLatLng: () => { lat: number; lng: number };
};

function DraggableCenterMarker({
  position,
  onChange,
}: {
  position: LatLngExpression;
  onChange?: (coords: { lat: number; lng: number }) => void;
}) {
  const markerRef = useRef<LeafletMarker | null>(null);
  const centerIcon = useCenterIcon();
  const eventHandlers = useMemo(
    () => ({
      dragend() {
        if (!onChange) return;
        const marker = markerRef.current;
        if (marker) {
          const { lat, lng } = marker.getLatLng();
          onChange({ lat, lng });
        }
      },
    }),
    [onChange],
  );

  if (!centerIcon) {
    return null;
  }

  return (
    <Marker
      position={position}
      draggable
      icon={centerIcon}
      eventHandlers={eventHandlers}
      ref={(instance: LeafletMarker | null) => {
        markerRef.current = instance as LeafletMarker | null;
      }}
    >
      <Tooltip direction="bottom">Arrastra para ajustar el centro de búsqueda</Tooltip>
    </Marker>
  );
}

function useCenterIcon() {
  const [icon, setIcon] = useState<unknown>(null);
  useEffect(() => {
    let isMounted = true;
    void import("leaflet").then((LeafletModule) => {
      if (!isMounted) return;
      type DivIconCtor = new (options: Record<string, unknown>) => unknown;
      type LeafletModuleType = {
        DivIcon?: DivIconCtor;
        default?: {
          DivIcon?: DivIconCtor;
        };
      };
      const Leaflet = LeafletModule as LeafletModuleType;
      const DivIconCtor = Leaflet.DivIcon ?? Leaflet.default?.DivIcon;
      if (!DivIconCtor) return;
      const node = new DivIconCtor({
        html: '<div style="width:22px;height:22px;border-radius:9999px;border:2px solid white;background:#2563eb;box-shadow:0 0 8px rgba(37,99,235,0.6);"></div>',
        className: "",
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      setIcon(node);
    });
    return () => {
      isMounted = false;
    };
  }, []);
  return icon as { html: string } | null;
}

const clusterIconCache = new Map<string, unknown>();

function useClusterIcon(count: number, zoom: number) {
  const [icon, setIcon] = useState<unknown>(null);
  const label = useMemo(() => {
    if (!Number.isFinite(count) || count <= 0) return "0";
    return count.toLocaleString("es-MX");
  }, [count]);
  const style = useMemo(() => {
    const safeCount = Number.isFinite(count) ? Math.max(0, count) : 0;
    const tier =
      safeCount >= 1000 ? "xl" : safeCount >= 100 ? "lg" : safeCount >= 10 ? "md" : "sm";
    const palette: Record<
      string,
      { fill: string; border: string; text: string; shadow: string }
    > = {
      sm: { fill: "rgba(37, 99, 235, 0.30)", border: "rgba(37, 99, 235, 0.95)", text: "rgba(30, 41, 59, 0.95)", shadow: "rgba(37, 99, 235, 0.18)" },
      md: { fill: "rgba(22, 163, 74, 0.30)", border: "rgba(22, 163, 74, 0.95)", text: "rgba(30, 41, 59, 0.95)", shadow: "rgba(22, 163, 74, 0.18)" },
      lg: { fill: "rgba(249, 115, 22, 0.30)", border: "rgba(249, 115, 22, 0.95)", text: "rgba(30, 41, 59, 0.95)", shadow: "rgba(249, 115, 22, 0.18)" },
      xl: { fill: "rgba(220, 38, 38, 0.30)", border: "rgba(220, 38, 38, 0.95)", text: "rgba(30, 41, 59, 0.95)", shadow: "rgba(220, 38, 38, 0.18)" },
    };
    const zoomBucket = zoom <= 9 ? "far" : zoom <= 13 ? "mid" : "near";
    const borderWidth = zoomBucket === "far" ? 3 : zoomBucket === "mid" ? 2.5 : 2;
    return { ...palette[tier], zoomBucket, borderWidth };
  }, [count, zoom]);

  const size = useMemo(() => {
    if (!Number.isFinite(count) || count <= 1) return 30;
    const extra = Math.min(22, Math.log10(Math.max(10, count)) * 12);
    const base = Math.round(34 + extra);
    if (zoom <= 9) return Math.round(base * 1.12);
    if (zoom >= 15) return Math.round(base * 0.96);
    return base;
  }, [count, zoom]);
  const fontSize = useMemo(() => {
    if (label.length >= 7) return 11;
    if (label.length >= 5) return 12;
    return 13;
  }, [label.length]);
  const cacheKey = `${style.zoomBucket}:${style.borderWidth}:${style.fill}:${style.border}:${size}:${fontSize}:${label}`;

  useEffect(() => {
    const cached = clusterIconCache.get(cacheKey);
    if (cached) {
      setIcon(cached);
      return;
    }
    let isMounted = true;
    void import("leaflet").then((LeafletModule) => {
      if (!isMounted) return;
      type DivIconCtor = new (options: Record<string, unknown>) => unknown;
      type LeafletModuleType = {
        DivIcon?: DivIconCtor;
        default?: {
          DivIcon?: DivIconCtor;
        };
      };
      const Leaflet = LeafletModule as LeafletModuleType;
      const DivIconCtor = Leaflet.DivIcon ?? Leaflet.default?.DivIcon;
      if (!DivIconCtor) return;

      const html = `
        <div style="
          width:${size}px;height:${size}px;
          border-radius:9999px;
          background:${style.fill};
          border:${style.borderWidth}px solid ${style.border};
          box-shadow:0 0 12px ${style.shadow};
          display:flex;align-items:center;justify-content:center;
          color:${style.text};
          font-weight:700;
          font-size:${fontSize}px;
          line-height:1;
          backdrop-filter:saturate(120%);
        ">${label}</div>
      `.trim();

      const node = new DivIconCtor({
        html,
        className: "",
        iconSize: [size, size],
        iconAnchor: [Math.round(size / 2), Math.round(size / 2)],
      });
      clusterIconCache.set(cacheKey, node);
      setIcon(node);
    });
    return () => {
      isMounted = false;
    };
  }, [cacheKey, fontSize, label, size, style.border, style.borderWidth, style.fill, style.shadow, style.text]);

  return icon as unknown | null;
}
