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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layerRef = useRef<any>(null);
  const onGeometryChangeRef = useRef(onGeometryChange);

  useEffect(() => {
    onGeometryChangeRef.current = onGeometryChange;
  }, [onGeometryChange]);

  useEffect(() => {
    if (mapRef.current) {
      return;
    }
    let cancelled = false;
    import("leaflet").then(async (leafletModule) => {
      if (cancelled || !mapEl.current) return;
      await import("leaflet-draw");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = leafletModule as any;
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
      const control = new L.Control.Draw({
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

      const captureGeometry = () => {
        const layerGroup = layerRef.current;
        if (!layerGroup) {
          onGeometryChangeRef.current?.(undefined);
          return;
        }
        const geojson = layerGroup.toGeoJSON();
        if (!geojson || !Array.isArray(geojson.features) || !geojson.features.length) {
          onGeometryChangeRef.current?.(undefined);
          return;
        }
        const geometry = geojson.features[0].geometry;
        if (!geometry || typeof geometry !== "object") {
          onGeometryChangeRef.current?.(undefined);
          return;
        }
        onGeometryChangeRef.current?.(JSON.stringify(geometry));
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.on("draw:created", (event: any) => {
        featureGroup.clearLayers();
        featureGroup.addLayer(event.layer);
        captureGeometry();
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.on("draw:edited", (event: any) => {
        featureGroup.clearLayers();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        event.layers.eachLayer((layer: any) => {
          featureGroup.addLayer(layer);
        });
        captureGeometry();
      });
      map.on("draw:deleted", () => {
        featureGroup.clearLayers();
        captureGeometry();
      });

    });
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
      }
    };
  }, []);

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
