"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import type { GeoJSONProps } from "react-leaflet";
import type { GeoJSON as GeoJSONType, Feature, FeatureCollection } from "geojson";
import type { Layer as LeafletLayer, Path as LeafletPath } from "leaflet";

import type { DemografiaMapResponse } from "@/lib/mapa-conversion/api";

export type LocationComparisonChartProps = {
  data: DemografiaMapResponse["dataset"];
  nivel: DemografiaMapResponse["nivel"];
  shape: GeoJSONType | null;
  colorMode: "sequential" | "channel";
};

const NIVEL_LABELS: Record<DemografiaMapResponse["nivel"], string> = {
  pais: "País",
  estado: "Estado",
  municipio: "Municipio",
};

const STAGE_LABELS: Record<string, string> = {
  captado: "Captado",
  precalificado: "Precalificado",
  negociacion: "Negociación",
  ganado: "Ganado",
  perdido: "Perdido",
};

type LeafletGeoJSONOptions = {
  filter?: (feature: Feature) => boolean;
};

type MetricsPayload = {
  scope: "dataset" | "location";
  title: string;
  subtitle?: string;
  totalVisitas: number;
  conversation: {
    con_conversacion: number;
    sin_conversacion: number;
  };
  channels: {
    webchat: number;
    whatsapp: number;
    voz: number;
  };
  stages: {
    captado: number;
    precalificado: number;
    negociacion: number;
    ganado: number;
    perdido: number;
  };
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

const CHANNEL_COLORS: Record<string, [number, number, number]> = {
  webchat: [59, 130, 246], // #3b82f6
  whatsapp: [34, 197, 94], // #22c55e
  voz: [249, 115, 22], // #f97316
};
const DEFAULT_CHANNEL_COLOR: [number, number, number] = [148, 163, 184]; // slate

export function LocationComparisonChart({ data, nivel, shape, colorMode }: LocationComparisonChartProps) {
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

  const [manualSelectedKey, setManualSelectedKey] = useState<string | null>(null);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const selectedKey = useMemo(() => {
    if (manualSelectedKey && data.some((entry) => entry.key === manualSelectedKey)) {
      return manualSelectedKey;
    }
    return data.find((entry) => entry.has_data)?.key ?? data[0]?.key ?? null;
  }, [data, manualSelectedKey]);

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
    return data.reduce((max, entry) => Math.max(max, entry.total_visitas ?? 0), 0) || 1;
  }, [data]);

  const keysWithData = useMemo(() => {
    const set = new Set<string>();
    for (const entry of data) {
      if (!entry.has_data) continue;
      if (entry.key) {
        set.add(entry.key);
      }
    }
    return set;
  }, [data]);

  const selectedEntry = selectedKey ? datasetMap.get(selectedKey) ?? null : null;
  const hoveredEntry = hoveredKey ? datasetMap.get(hoveredKey) ?? null : null;
  const activeEntry = hoveredEntry ?? selectedEntry ?? null;

  const datasetSummary = useMemo<MetricsPayload>(() => {
    const summary: MetricsPayload = {
      scope: "dataset",
      title: "Resumen general",
      subtitle:
        data.length === 1
          ? "1 ubicación con datos"
          : `${formatNumber(data.length)} ubicaciones con datos`,
      totalVisitas: 0,
      conversation: {
        con_conversacion: 0,
        sin_conversacion: 0,
      },
      channels: {
        webchat: 0,
        whatsapp: 0,
        voz: 0,
      },
      stages: {
        captado: 0,
        precalificado: 0,
        negociacion: 0,
        ganado: 0,
        perdido: 0,
      },
    };

    for (const entry of data) {
      const conversation = entry.conversacion_totales ?? {
        con_conversacion: entry.visitantes_con_chat ?? 0,
        sin_conversacion: entry.visitantes_sin_chat ?? 0,
      };
      summary.totalVisitas += entry.total_visitas ?? 0;
      summary.conversation.con_conversacion += conversation.con_conversacion ?? 0;
      summary.conversation.sin_conversacion += conversation.sin_conversacion ?? 0;
      summary.channels.webchat += entry.totales_por_canal?.webchat ?? entry.visitantes_total ?? 0;
      summary.channels.whatsapp += entry.totales_por_canal?.whatsapp ?? 0;
      summary.channels.voz += entry.totales_por_canal?.voz ?? 0;
      summary.stages.captado += entry.etapas_totales?.captado ?? 0;
      summary.stages.precalificado += entry.etapas_totales?.precalificado ?? 0;
      summary.stages.negociacion += entry.etapas_totales?.negociacion ?? 0;
      summary.stages.ganado += entry.etapas_totales?.ganado ?? 0;
      summary.stages.perdido += entry.etapas_totales?.perdido ?? 0;
    }

    const locationSubtitle =
      data.length === 1
        ? "1 ubicación"
        : `${formatNumber(data.length)} ubicaciones`;
    summary.subtitle = `${formatNumber(summary.totalVisitas)} visitas totales · ${locationSubtitle}`;
    return summary;
  }, [data]);

  const activeMetrics = useMemo<MetricsPayload | null>(() => {
    if (!activeEntry) return null;

    const conversation = activeEntry.conversacion_totales ?? {
      con_conversacion: activeEntry.visitantes_con_chat ?? 0,
      sin_conversacion: activeEntry.visitantes_sin_chat ?? 0,
    };

    return {
      scope: "location",
      title: activeEntry.name,
      subtitle: `${NIVEL_LABELS[activeEntry.nivel as keyof typeof NIVEL_LABELS] ?? "Ubicación"} · ${formatNumber(activeEntry.total_visitas ?? 0)} visitas`,
      totalVisitas: activeEntry.total_visitas ?? 0,
      conversation: {
        con_conversacion: conversation.con_conversacion ?? 0,
        sin_conversacion: conversation.sin_conversacion ?? 0,
      },
      channels: {
        webchat: activeEntry.totales_por_canal?.webchat ?? activeEntry.visitantes_total ?? 0,
        whatsapp: activeEntry.totales_por_canal?.whatsapp ?? 0,
        voz: activeEntry.totales_por_canal?.voz ?? 0,
      },
      stages: {
        captado: activeEntry.etapas_totales?.captado ?? 0,
        precalificado: activeEntry.etapas_totales?.precalificado ?? 0,
        negociacion: activeEntry.etapas_totales?.negociacion ?? 0,
        ganado: activeEntry.etapas_totales?.ganado ?? 0,
        perdido: activeEntry.etapas_totales?.perdido ?? 0,
      },
    };
  }, [activeEntry]);

  const metrics = activeMetrics ?? datasetSummary;

  const handleFeatureClick = useCallback(
    (entry: DemografiaMapResponse["dataset"][number]) => {
      if (!entry || !entry.key) {
        return;
      }
      if (entry.key !== manualSelectedKey) {
        setManualSelectedKey(entry.key);
      }
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
    [router, searchParams, manualSelectedKey, setManualSelectedKey],
  );

  const style = useCallback(
    (feature?: Feature) => {
      const key = resolveFeatureKey(feature ?? ({} as Feature));
      const entry =
        datasetMap.get(key) ||
        datasetMap.get(key.padStart(2, "0")) ||
        datasetMap.get(key.toUpperCase());
      const total = entry?.total_visitas ?? 0;
      const isSelected = entry?.key && selectedKey && entry.key === selectedKey;
      const isHovered = entry?.key && hoveredKey && entry.key === hoveredKey;

      if (!entry || !entry.has_data || maxTotal <= 0 || total <= 0) {
        return {
          color: isSelected || isHovered ? "hsl(var(--primary)/0.4)" : "hsl(var(--foreground)/0.1)",
          weight: isSelected || isHovered ? 1.75 : 1,
          fillColor: "transparent",
          fillOpacity: 0,
        };
      }

      const intensity = Math.min(1, total / maxTotal);
      if (colorMode === "channel") {
        const { fillColor, fillOpacity } = resolveChannelStyle(entry, intensity, isSelected || isHovered);
        return {
          color: isSelected || isHovered ? "hsl(var(--primary)/0.6)" : "hsl(var(--foreground)/0.18)",
          weight: isSelected || isHovered ? 2.2 : 1,
          fillColor,
          fillOpacity,
        };
      }

      const hue = 210 - intensity * 150;
      const fillColor = `hsl(${hue} 70% ${38 + intensity * 18}%)`;

      return {
        color: isSelected || isHovered ? "hsl(var(--primary)/0.6)" : "hsl(var(--foreground)/0.18)",
        weight: isSelected || isHovered ? 2.2 : 1,
        fillColor,
        fillOpacity: isSelected || isHovered ? 0.82 : 0.72,
      };
    },
    [colorMode, datasetMap, hoveredKey, maxTotal, selectedKey],
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
      interactiveLayer.off?.("mouseover");
      interactiveLayer.off?.("mouseout");

      const entry =
        datasetMap.get(key) ||
        datasetMap.get(key.padStart(2, "0")) ||
        datasetMap.get(key.toUpperCase());

      const tooltipLayer = pathLayer as unknown as {
        bindTooltip?: (content: string, options?: LeafletTooltipOptions) => void;
        unbindTooltip?: () => void;
      };

      if (!entry) {
        tooltipLayer.unbindTooltip?.();
        return;
      }

      interactiveLayer.on?.("mouseover", () => {
        if (entry.key) {
          setHoveredKey(entry.key);
        }
      });
      interactiveLayer.on?.("mouseout", () => setHoveredKey(null));
      interactiveLayer.on?.("click", () => handleFeatureClick(entry));

      if (typeof tooltipLayer.bindTooltip !== "function") return;

      const totalesPorCanal = entry.totales_por_canal ?? {};
      const conversation = entry.conversacion_totales ?? {
        con_conversacion: entry.visitantes_con_chat ?? 0,
        sin_conversacion: entry.visitantes_sin_chat ?? 0,
      };
      const channelEntries = Object.entries(totalesPorCanal);
      const topChannel = channelEntries
        .filter(([, totalValue]) => (totalValue ?? 0) > 0)
        .sort(([, totalA], [, totalB]) => (totalB ?? 0) - (totalA ?? 0))[0];
      const topChannelLabel = topChannel ? topChannel[0] : null;

      const tooltip = `
        <div style="font-size: 12px; line-height: 1.45;">
          <strong>${entry.name ?? feature.properties?.name ?? "Sin nombre"}</strong><br/>
          Visitas totales: ${formatNumber(entry.total_visitas ?? 0)}<br/>
          Con conversación: ${formatNumber(conversation.con_conversacion ?? 0)}<br/>
          Sin conversación: ${formatNumber(conversation.sin_conversacion ?? 0)}<br/>
          ${topChannelLabel ? `Canal principal: ${topChannelLabel} (${formatNumber(topChannel?.[1] ?? 0)})` : ""}
        </div>
      `;

      tooltipLayer.bindTooltip?.(tooltip, { sticky: true });
    },
    [datasetMap, handleFeatureClick, setHoveredKey],
  );

  const center =
    nivel === "pais"
      ? ([20.5, -1] as [number, number])
      : ([19.43, -99.13] as [number, number]);
  const zoom = nivel === "pais" ? 2 : nivel === "estado" ? 5 : 6;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="relative z-0 h-[320px] w-full overflow-hidden rounded-lg border">
        <MapContainer
          key={nivel}
          center={center}
          zoom={zoom}
          className="h-full w-full"
          attributionControl={false}
          zoomControl={false}
          style={{ zIndex: 0 }}
        >
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {enhancedGeojson ? (
            <>
              <GeoJSON
                {...({
                  data: enhancedGeojson,
                  style,
                  onEachFeature,
                } as unknown as GeoJSONProps)}
                key={JSON.stringify(enhancedGeojson)}
              />
              <FitToData activeKeys={keysWithData} nivel={nivel} shape={enhancedGeojson} />
            </>
          ) : null}
        </MapContainer>
      </div>
      <aside className="flex h-[320px] flex-col gap-4 rounded-lg border bg-card p-4 text-sm shadow-sm">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {metrics.scope === "dataset" ? "Resumen" : "Ubicación seleccionada"}
          </span>
          <span className="text-base font-semibold leading-tight">{metrics.title}</span>
          <span className="text-xs text-muted-foreground">
            {metrics.subtitle ?? `${formatNumber(metrics.totalVisitas)} visitas totales`}
          </span>
        </div>
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto pr-1">
          <MetricSection
            title="Conversaciones"
            items={[
              { label: "Total con conversación", value: metrics.conversation.con_conversacion },
              { label: "Total sin conversación", value: metrics.conversation.sin_conversacion },
            ]}
          />
          <MetricSection
            title="Canales"
            items={[
              { label: "Canal Webchat", value: metrics.channels.webchat },
              { label: "Canal WhatsApp", value: metrics.channels.whatsapp },
              { label: "Canal Voz", value: metrics.channels.voz },
            ]}
          />
          <MetricSection
            title="Etapas"
            items={[
              { label: STAGE_LABELS.captado, value: metrics.stages.captado },
              { label: STAGE_LABELS.precalificado, value: metrics.stages.precalificado },
              { label: STAGE_LABELS.negociacion, value: metrics.stages.negociacion },
              { label: STAGE_LABELS.ganado, value: metrics.stages.ganado },
              { label: STAGE_LABELS.perdido, value: metrics.stages.perdido },
            ]}
          />
        </div>
      </aside>
    </div>
  );
}

function FitToData({
  shape,
  activeKeys,
  nivel,
}: {
  shape: GeoJSONType | null;
  activeKeys: Set<string>;
  nivel: DemografiaMapResponse["nivel"];
}) {
  const map = useMap();

  useEffect(() => {
    if (!shape || shape.type !== "FeatureCollection") return;
    let cancelled = false;

    const loadLeaflet = async () => {
      if (typeof window === "undefined") return;
      const [{ default: Leaflet }] = await Promise.all([import("leaflet"), import("leaflet/dist/leaflet.css")]);
      if (cancelled) return;
      const geoJsonFactory: LeafletGeoJSONFactory | undefined =
        (Leaflet as { geoJSON?: LeafletGeoJSONFactory }).geoJSON;
      if (!geoJsonFactory) return;

      const layer = geoJsonFactory(shape as FeatureCollection, {
        filter: (feature) => {
          if (!activeKeys.size) return true;
          const key = resolveFeatureKey(feature as Feature);
          return (
            activeKeys.has(key) ||
            activeKeys.has(key.padStart(2, "0")) ||
            activeKeys.has(key.toUpperCase())
          );
        },
      });
      const bounds = layer?.getBounds?.();
      if (bounds?.isValid?.()) {
        const leafletMap = map as unknown as LeafletMapType;
        leafletMap.flyToBounds?.(bounds, {
          padding: [24, 24],
          maxZoom: nivel === "pais" ? 5 : nivel === "estado" ? 8 : 12,
        });
      }
    };

    void loadLeaflet();

    return () => {
      cancelled = true;
    };
  }, [activeKeys, map, nivel, shape]);

  return null;
}

function MetricSection({
  title,
  items,
}: {
  title: string;
  items: Array<{ label: string; value: number }>;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </span>
      <div className="space-y-1">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-4">
            <span className="text-xs text-muted-foreground">{item.label}</span>
            <span className="font-medium">{formatNumber(item.value)}</span>
          </div>
        ))}
      </div>
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

function resolveChannelStyle(
  entry: DemografiaMapResponse["dataset"][number],
  intensity: number,
  isActive: boolean,
): { fillColor: string; fillOpacity: number } {
  const totals = entry.totales_por_canal || {};
  const sorted = Object.entries(totals).sort(([, totalA], [, totalB]) => (totalB ?? 0) - (totalA ?? 0));
  const topChannel = sorted.find(([, value]) => (value ?? 0) > 0)?.[0] ?? "webchat";
  const baseColor = CHANNEL_COLORS[topChannel] ?? DEFAULT_CHANNEL_COLOR;
  const factor = Math.min(1, Math.max(0, Math.pow(intensity || 0.25, 0.75)));
  const [r, g, b] = mixWithWhite(baseColor, factor);
  const baseOpacity = 0.55 + factor * 0.35;
  const fillOpacity = isActive ? Math.min(1, baseOpacity + 0.15) : baseOpacity;
  return {
    fillColor: `rgb(${r}, ${g}, ${b})`,
    fillOpacity,
  };
}

function mixWithWhite(color: [number, number, number], factor: number): [number, number, number] {
  const clamped = Math.min(1, Math.max(0, factor));
  const mix = color.map((component) => Math.round(255 + (component - 255) * clamped)) as [
    number,
    number,
    number,
  ];
  return mix;
}
type LeafletTooltipOptions = Parameters<NonNullable<LeafletPath["bindTooltip"]>>[1];

type LeafletGeoJSONFactory = (geojson?: GeoJSONType, options?: LeafletGeoJSONOptions) => {
  getBounds?: () => {
    isValid?: () => boolean;
  } & Record<string, unknown>;
};

type LeafletMapType = {
  flyToBounds?: (bounds: unknown, options?: { padding?: [number, number]; maxZoom?: number }) => void;
};
