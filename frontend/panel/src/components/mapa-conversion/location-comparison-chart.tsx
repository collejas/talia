"use client";

import { useMemo } from "react";
import { MapContainer, TileLayer, GeoJSON } from "react-leaflet";
import type { GeoJSONProps } from "react-leaflet";
import type { GeoJSON as GeoJSONType, Feature, FeatureCollection } from "geojson";
import "leaflet/dist/leaflet.css";
import type { Layer as LeafletLayer, Path as LeafletPath } from "leaflet";

import type { DemografiaMapResponse } from "@/lib/mapa-conversion/api";

type LocationComparisonChartProps = {
  data: DemografiaMapResponse["dataset"];
  nivel: DemografiaMapResponse["nivel"];
  shape: GeoJSONType | null;
};

function resolveFeatureKey(feature: Feature): string {
  const props = feature.properties || {};
  const candidates = [
    props.cvegeo,
    props.cve_ent,
    props.cve_entidad,
    props.iso_a3,
    props.iso_a2,
    props.id,
    props.name,
  ];
  const value = candidates.find((candidate) => typeof candidate === "string" && candidate.length);
  if (!value) return "UNK";
  return value.toString().trim();
}

export function LocationComparisonChart({ data, nivel, shape }: LocationComparisonChartProps) {
  const datasetMap = useMemo(() => {
    const map = new Map<string, (typeof data)[number]>();
    for (const entry of data) {
      map.set((entry.key || "UNK").toString(), entry);
    }
    return map;
  }, [data]);

  const enhancedGeojson = useMemo<GeoJSONType | null>(() => {
    if (!shape || typeof shape !== "object") return null;
    if (shape.type !== "FeatureCollection") return null;

    const collection = shape as FeatureCollection;

    const features = (collection.features || []).map((feature) => {
      const key = resolveFeatureKey(feature);
      const entry = datasetMap.get(key) || datasetMap.get(key.padStart(2, "0")) || datasetMap.get(key.toUpperCase());

      const properties = {
        ...(feature.properties || {}),
        dataset_key: key,
        dataset_name: entry?.name ?? feature.properties?.name ?? "Sin datos",
        dataset_leads: entry?.leads_total ?? 0,
        dataset_visitantes: entry?.visitantes_total ?? 0,
        dataset_webchat: entry?.leads_por_canal?.webchat ?? 0,
        dataset_whatsapp: entry?.leads_por_canal?.whatsapp ?? 0,
        dataset_voz: entry?.leads_por_canal?.voz ?? 0,
      };

      return {
        ...feature,
        properties,
      } as Feature;
    });

    return {
      ...collection,
      features,
    } satisfies FeatureCollection;
  }, [shape, datasetMap]);

  const maxLeads = useMemo(() => {
    return data.reduce((max, entry) => Math.max(max, entry.leads_total ?? 0), 0) || 1;
  }, [data]);

  const style = (feature?: Feature) => {
    const leads = typeof feature?.properties?.dataset_leads === "number" ? feature.properties.dataset_leads : 0;
    const intensity = Math.min(1, leads / maxLeads);
    const hue = 220 - intensity * 160;
    const fillColor = `hsl(${hue} 70% ${40 + intensity * 15}%)`;
    return {
      color: "hsl(var(--foreground)/0.12)",
      weight: 1,
      fillColor,
      fillOpacity: 0.65,
    };
  };

  const onEachFeature = (feature: Feature, layer: LeafletLayer) => {
    const props = feature.properties as Record<string, unknown> | undefined;
    if (!props || !("bindTooltip" in layer)) return;
    const tooltip = `
      <div style="font-size: 12px">
        <strong>${props.dataset_name ?? "Sin nombre"}</strong><br/>
        Leads: ${formatNumber(props.dataset_leads as number)}<br/>
        Visitantes sin chat: ${formatNumber(props.dataset_visitantes as number)}<br/>
        Webchat: ${formatNumber(props.dataset_webchat as number)} · WhatsApp: ${formatNumber(props.dataset_whatsapp as number)} · Voz: ${formatNumber(props.dataset_voz as number)}
      </div>
    `;
    const pathLayer = layer as LeafletPath;
    if (typeof pathLayer.bindTooltip === "function") {
      pathLayer.bindTooltip(tooltip, { sticky: true });
    }
  };

  const center =
    nivel === "pais"
      ? ([20, 0] as [number, number])
      : ([19.43, -99.13] as [number, number]);

  return (
    <div className="h-[320px] w-full overflow-hidden rounded-lg border">
      <MapContainer
        center={center}
        zoom={nivel === "pais" ? 2 : 5}
        className="h-full w-full"
        attributionControl={false}
        zoomControl={false}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {enhancedGeojson ? (
          <GeoJSON
            {...({
              data: enhancedGeojson,
              style,
              onEachFeature,
            } as unknown as GeoJSONProps)}
            key={JSON.stringify(enhancedGeojson)}
          />
        ) : null}
      </MapContainer>
    </div>
  );
}

function formatNumber(value: unknown): string {
  const numberValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : 0;
  if (!Number.isFinite(numberValue)) return "0";
  return new Intl.NumberFormat("es-MX").format(numberValue);
}
