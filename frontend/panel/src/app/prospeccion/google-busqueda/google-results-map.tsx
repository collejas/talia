"use client"

import { memo, useEffect, useMemo, useRef, useState } from "react";
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
};

export const GoogleResultsMap = memo(function GoogleResultsMap({
  center,
  radius,
  results,
  highlightIds,
  onCenterChange,
}: GoogleResultsMapProps) {
  const zoom = radiusToZoom(radius);
  const mapCenter: LatLngExpression = [center.lat, center.lng];
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
      <MapViewUpdater center={mapCenter} zoom={zoom} />
      <MapClickHandler onCenterChange={onCenterChange} />
      <Circle center={mapCenter} radius={radius} pathOptions={{ color: "#2563eb", weight: 1.5, fillOpacity: 0.08 }} />
      <DraggableCenterMarker position={mapCenter} onChange={onCenterChange} />
      {validResults.map((item) => {
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
              <div className="space-y-1">
                <p className="font-medium">{item.display_name ?? "Sin nombre"}</p>
                {item.actividad ? <p className="text-xs">{item.actividad}</p> : null}
                {item.phone ? <p className="text-xs">Tel: {item.phone}</p> : null}
                {typeof item.rating === "number" ? <p className="text-xs">Rating: {item.rating.toFixed(1)}</p> : null}
              </div>
            </Tooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
});

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
