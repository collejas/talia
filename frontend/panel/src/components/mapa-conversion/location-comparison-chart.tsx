"use client";

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
    props.dataset_key,
    props.cvegeo,
    props.cve_ent,
    props.cve_entidad,
    props.iso_a2,
    props.ISO_A2,
    props.iso_a3,
    props.ISO_A3,
    props.id,
    props.name,
  ];
  const value = candidates.find((candidate) => typeof candidate === "string" && candidate.length);
  if (!value) return "UNK";
  return value.toString().trim();
}

export function LocationComparisonChart({ data, nivel, shape }: LocationComparisonChartProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const datasetMap = useMemo(() => {
    const map = new Map<string, (typeof data)[number]>();
    for (const entry of data) {
      map.set((entry.key || "UNK").toString(), entry);
      map.set((entry.key || "UNK").toString().padStart(2, "0"), entry);
      map.set((entry.key || "UNK").toString().toUpperCase(), entry);
    }
    return map;
  }, [data]);

  const enhancedGeojson = useMemo<GeoJSONType | null>(() => {
    if (!shape || typeof shape !== "object") return null;
    if (shape.type !== "FeatureCollection") return null;

    const collection = shape as FeatureCollection;
    const features = (collection.features || []).map((feature) => {
      const key = resolveFeatureKey(feature);
      return {
        ...feature,
        properties: {
          ...(feature.properties || {}),
          dataset_key: key,
        },
      } as Feature;
    });

    return {
      ...collection,
      features,
    } satisfies FeatureCollection;
  }, [shape]);

  const maxTotal = useMemo(() => {
    return data.reduce((max, entry) => Math.max(max, entry.total_canales ?? 0), 0) || 1;
  }, [data]);

  const handleFeatureClick = useCallback(
    (entry: DemografiaMapResponse["dataset"][number]) => {
      if (!entry.has_data) return;
      const nextLevel = entry.next_level;
      if (!nextLevel) return;

      const params = new URLSearchParams(searchParams.toString());
      if (nextLevel === "estado") {
        params.set("nivel", "estado");
        params.delete("estado");
      } else if (nextLevel === "municipio") {
        params.set("nivel", "municipio");
        const stateCode = (entry.key || "").padStart(2, "0").slice(0, 2);
        params.set("estado", stateCode);
      }
      router.replace(`/mapa-de-conversion?${params.toString()}`);
    },
    [router, searchParams],
  );

  const style = useCallback(
    (feature?: Feature) => {
      const key = resolveFeatureKey(feature ?? ({} as Feature));
      const entry = datasetMap.get(key);
      const total = entry?.total_canales ?? 0;

      if (!entry || !entry.has_data || maxTotal <= 0 || total <= 0) {
        return {
          color: "hsl(var(--foreground)/0.1)",
          weight: 1,
          fillColor: "hsl(var(--muted-foreground)/0.25)",
          fillOpacity: 0.1,
        };
      }

      const intensity = Math.min(1, total / maxTotal);
      const hue = 210 - intensity * 150;
      const fillColor = `hsl(${hue} 70% ${38 + intensity * 18}%)`;

      return {
        color: "hsl(var(--foreground)/0.18)",
        weight: 1,
        fillColor,
        fillOpacity: 0.72,
      };
    },
    [datasetMap, maxTotal],
  );

  const onEachFeature = useCallback(
    (feature: Feature, layer: LeafletLayer) => {
      const key = resolveFeatureKey(feature);
      const pathLayer = layer as LeafletPath;
      const interactiveLayer = pathLayer as unknown as {
        on?: (event: string, handler: (...args: unknown[]) => void) => void;
        off?: (event: string) => void;
      };
      interactiveLayer.off?.("click");

      const entry =
        datasetMap.get(key) ||
        datasetMap.get(key.padStart(2, "0")) ||
        datasetMap.get(key.toUpperCase());

      if (
        entry &&
        entry.has_data &&
        entry.next_level &&
        entry.key !== "UNK" &&
        entry.key.trim().length
      ) {
        interactiveLayer.on?.("click", () => handleFeatureClick(entry));
      }

      if (!("bindTooltip" in layer)) return;

      const totalesPorCanal = entry?.totales_por_canal ?? {};
      const webchat = entry?.webchat_breakdown ?? {
        sin_conversacion: 0,
        captado: 0,
        post_captado: 0,
      };

      const tooltip = `
        <div style="font-size: 12px; line-height: 1.45;">
          <strong>${entry?.name ?? feature.properties?.name ?? "Sin nombre"}</strong><br/>
          Total canales: ${formatNumber(entry?.total_canales ?? 0)}<br/>
          &bull; WhatsApp: ${formatNumber(totalesPorCanal.whatsapp ?? 0)}<br/>
          &bull; Webchat: ${formatNumber(totalesPorCanal.webchat ?? 0)}<br/>
          &ensp;· Sin conversación: ${formatNumber(webchat.sin_conversacion ?? 0)}<br/>
          &ensp;· Captado: ${formatNumber(webchat.captado ?? 0)}<br/>
          &ensp;· > Captado: ${formatNumber(webchat.post_captado ?? 0)}<br/>
          &bull; Voz: ${formatNumber(totalesPorCanal.voz ?? 0)}<br/>
          Visitas Webchat: ${formatNumber(entry?.visitantes_total ?? 0)}<br/>
          &ensp;· Con conversación: ${formatNumber(entry?.visitantes_con_chat ?? 0)}<br/>
          &ensp;· Sin conversación: ${formatNumber(entry?.visitantes_sin_chat ?? 0)}
        </div>
      `;

      if (typeof pathLayer.bindTooltip === "function") {
        pathLayer.bindTooltip(tooltip, { sticky: true });
      }
    },
    [datasetMap, handleFeatureClick],
  );

  const center =
    nivel === "pais"
      ? ([20.5, -1] as [number, number])
      : ([19.43, -99.13] as [number, number]);
  const zoom = nivel === "pais" ? 2 : nivel === "estado" ? 5 : 6;

  return (
    <div className="relative z-0 h-[320px] w-full overflow-hidden rounded-lg border">
      <MapContainer
        center={center}
        zoom={zoom}
        className="h-full w-full"
        attributionControl={false}
        zoomControl={false}
        style={{ zIndex: 0 }}
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
