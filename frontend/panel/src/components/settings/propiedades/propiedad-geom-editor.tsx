"use client";

import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import { useEffect, useRef } from "react";
type PropiedadGeomEditorProps = {
  value: string;
  onGeometryChange: (geojson?: string) => void;
};

export function PropiedadGeomEditor({ value, onGeometryChange }: PropiedadGeomEditorProps) {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletModule.Map | null>(null);
  const layerRef = useRef<LeafletModule.FeatureGroup | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("leaflet").then(async (leafletModule) => {
      if (cancelled || !mapEl.current) return;
      await import("leaflet-draw");
      const L = leafletModule as typeof import("leaflet");
      const map = L.map(mapEl.current, {
        center: [19.4326, -99.1332],
        zoom: 5,
        scrollWheelZoom: true,
      });
      mapRef.current = map;
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);
      const featureGroup = L.featureGroup().addTo(map);
      layerRef.current = featureGroup;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const control = new (L as any).Control.Draw({
        draw: {
          polyline: false,
          rectangle: false,
          circlemarker: false,
          circle: false,
          marker: false,
          polygon: {
            allowIntersection: false,
            showArea: true,
          },
        },
        edit: {
          featureGroup,
        },
      });
      map.addControl(control);
      map.invalidateSize();

      const updateGeometry = () => {
        const geojson = featureGroup.toGeoJSON();
        const geometry =
          geojson.features.length > 0 ? JSON.stringify(geojson.features[0].geometry) : "";
        onGeometryChange(geometry || undefined);
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.on("draw:created", (event: any) => {
        featureGroup.clearLayers();
        featureGroup.addLayer(event.layer);
        updateGeometry();
      });
      map.on("draw:edited", () => {
        updateGeometry();
      });
      map.on("draw:deleted", () => {
        updateGeometry();
      });

      if (value) {
        try {
          const parsed = JSON.parse(value);
          featureGroup.clearLayers();
          featureGroup.addData({ type: "Feature", geometry: parsed });
          const bounds = featureGroup.getBounds();
          if (bounds.isValid()) {
            map.fitBounds(bounds);
          }
        } catch {
          // ignore invalid geometry
        }
      }
    });
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
      }
    };
  }, [value, onGeometryChange]);

  useEffect(() => {
    if (!value || !layerRef.current || !mapRef.current) {
      return;
    }
    try {
      const parsed = JSON.parse(value);
      layerRef.current.clearLayers();
      layerRef.current.addData({ type: "Feature", geometry: parsed });
      const bounds = layerRef.current.getBounds();
      if (bounds.isValid()) {
        mapRef.current.fitBounds(bounds);
      }
    } catch {
      // ignore invalid geometry
    }
  }, [value]);

  return (
    <div className="h-[520px] w-full min-h-[420px] rounded border border-slate-200 bg-white shadow-sm overflow-hidden relative">
      <div ref={mapEl} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
