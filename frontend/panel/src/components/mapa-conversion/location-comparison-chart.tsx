"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import type { GeoJSONProps } from "react-leaflet";
import type { GeoJSON as GeoJSONType, Feature, FeatureCollection } from "geojson";
import type { Layer as LeafletLayer, Path as LeafletPath } from "leaflet";
import { renderToStaticMarkup } from "react-dom/server";

import type { DemografiaMapResponse } from "@/lib/mapa-conversion/api";
import {
  MAPA_STAGE_LABELS,
  MAPA_STAGE_KEYS,
  createEmptyStageTotals,
} from "@/lib/mapa-conversion/stages";
import { cn } from "@/lib/utils";

const CHANNEL_KEYS = ["webchat", "whatsapp", "voz", "correo"] as const;
type ChannelKey = (typeof CHANNEL_KEYS)[number];

export type LocationComparisonChartProps = {
  data: DemografiaMapResponse["dataset"];
  nivel: DemografiaMapResponse["nivel"];
  shape: GeoJSONType | null;
  colorMode: "sequential" | "channel";
  channelFilter?: ChannelKey[];
  globalStages?: Record<string, number>;
  stageKeys?: string[];
  attributionFilterActive?: boolean;
};

const NIVEL_LABELS: Record<DemografiaMapResponse["nivel"], string> = {
  pais: "País",
  estado: "Estado",
  municipio: "Municipio",
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
  whatsappConversations: number;
  channels: {
    [key in ChannelKey]: number;
  };
  stages: Record<string, number>;
};

function resolveFeatureKey(feature: Feature): string {
  const candidates = resolveFeatureCandidates(feature);
  const value = candidates.find((candidate) => typeof candidate === "string" && candidate.length);
  if (!value) return "UNK";
  return value.toString().trim();
}

function resolveFeatureCandidates(feature: Feature): string[] {
  const props = feature.properties || {};
  const rawCandidates = [
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
  const variants = new Set<string>();
  for (const candidate of rawCandidates) {
    if (typeof candidate !== "string") continue;
    const value = candidate.trim();
    if (!value) continue;
    variants.add(value);
    variants.add(value.toUpperCase());
    variants.add(value.toLowerCase());
    if (/^\d+$/.test(value)) {
      variants.add(value.padStart(2, "0"));
      variants.add(value.padStart(3, "0"));
      variants.add(value.padStart(5, "0"));
    }
  }
  return Array.from(variants);
}

const CHANNEL_COLORS: Record<ChannelKey, [number, number, number]> = {
  webchat: [59, 130, 246], // #3b82f6
  whatsapp: [34, 197, 94], // #22c55e
  voz: [249, 115, 22], // #f97316
  correo: [14, 116, 144], // #0e7490
};
const DEFAULT_CHANNEL_COLOR: [number, number, number] = [148, 163, 184]; // slate
const CHANNEL_LABELS: Record<ChannelKey, string> = {
  webchat: "Webchat",
  whatsapp: "WhatsApp",
  voz: "Voz",
  correo: "Correo",
};

function normalizeChannelKey(value: string | null | undefined): ChannelKey | null {
  if (typeof value !== "string") return null;
  const normalized = value.toLowerCase();
  return CHANNEL_KEYS.includes(normalized as ChannelKey) ? (normalized as ChannelKey) : null;
}

function resolveChannelTotal(
  entry: DemografiaMapResponse["dataset"][number],
  channel: ChannelKey,
  allowedChannels?: Set<ChannelKey>,
): number {
  if (allowedChannels && allowedChannels.size && !allowedChannels.has(channel)) {
    return 0;
  }
  const visitantes = entry.visitantes_totales_por_canal?.[channel];
  if (typeof visitantes === "number" && Number.isFinite(visitantes)) {
    return visitantes;
  }
  const totales = entry.totales_por_canal?.[channel];
  if (typeof totales === "number" && Number.isFinite(totales)) {
    return totales;
  }
  // En mapa de conversion, los canales deben reflejar solo metricas de visitantes/
  // conversaciones (webchat, whatsapp, voz), no fallback de leads historicos.
  return 0;
}

function resolveWhatsappConversationTotal(
  entry: DemografiaMapResponse["dataset"][number],
  allowedChannels?: Set<ChannelKey>,
): number {
  if (allowedChannels && allowedChannels.size && !allowedChannels.has("whatsapp")) {
    return 0;
  }
  const candidates = [
    entry.conversation_channels?.conversaciones_whatsapp,
    entry.visitantes_totales_por_canal?.whatsapp,
    entry.totales_por_canal?.whatsapp,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
  }
  return 0;
}

function resolveFilteredEntryTotal(
  entry: DemografiaMapResponse["dataset"][number],
  allowedChannels?: Set<ChannelKey>,
  allowLeadFallback: boolean = true,
): number {
  if (!allowedChannels || !allowedChannels.size || allowedChannels.size === CHANNEL_KEYS.length) {
    return resolveEntryTotal(entry, allowLeadFallback);
  }
  let total = 0;
  for (const channel of allowedChannels) {
    total += resolveChannelTotal(entry, channel, undefined);
  }
  return total;
}

function resolveEntryTotal(
  entry: DemografiaMapResponse["dataset"][number],
  allowLeadFallback: boolean = true,
): number {
  const webVisits = entry.total_visitas ?? 0;
  const channelTotals = entry.visitantes_totales_por_canal || {};
  let channelSum = 0;
  for (const channel of CHANNEL_KEYS) {
    const value = channelTotals[channel];
    if (typeof value === "number" && Number.isFinite(value)) {
      channelSum += value;
    }
  }
  const combined = webVisits + channelSum;
  if (combined > 0) return combined;
  if (!allowLeadFallback) return 0;
  return entry.leads_total ?? 0;
}

export function LocationComparisonChart({
  data,
  nivel,
  shape,
  colorMode,
  channelFilter,
  globalStages,
  stageKeys: stageKeysProp,
  attributionFilterActive = false,
}: LocationComparisonChartProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const activeChannels = useMemo<ChannelKey[]>(() => {
    const source = channelFilter?.length ? channelFilter : CHANNEL_KEYS;
    const normalized = source
      .map((channel) => channel.toLowerCase() as ChannelKey)
      .filter(
        (channel, index, array): channel is ChannelKey =>
          CHANNEL_KEYS.includes(channel) && array.indexOf(channel) === index,
      );
    return normalized.length ? normalized : [...CHANNEL_KEYS];
  }, [channelFilter]);
  const activeChannelSet = useMemo(() => new Set<ChannelKey>(activeChannels), [activeChannels]);
  const showConversationMetrics = activeChannelSet.has("webchat");
  const showWhatsappConversationMetrics = activeChannelSet.has("whatsapp");
  const allowLeadFallback = !attributionFilterActive;
  const displayedChannelKeys = activeChannels.length ? activeChannels : CHANNEL_KEYS;

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
    if (nivel === "pais" || nivel === "municipio") {
      return null;
    }
    return data.find((entry) => entry.has_data)?.key ?? data[0]?.key ?? null;
  }, [data, manualSelectedKey, nivel]);

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

  const dataSignature = useMemo(() => {
    return data
      .map((entry) => {
        const channels = entry.visitantes_totales_por_canal || {};
        return [
          entry.key || "UNK",
          entry.total_visitas ?? 0,
          channels.webchat ?? 0,
          channels.whatsapp ?? 0,
          channels.voz ?? 0,
        ].join(":");
      })
      .join("|");
  }, [data]);

  const mapLayerKey = useMemo(() => {
    if (!enhancedGeojson) return `empty-${activeChannels.join("|")}`;
    return `${JSON.stringify(enhancedGeojson)}-${activeChannels.join("|")}-${colorMode}-${attributionFilterActive ? "attr-on" : "attr-off"}-${dataSignature}`;
  }, [activeChannels, attributionFilterActive, colorMode, dataSignature, enhancedGeojson]);

  const maxTotal = useMemo(() => {
    return (
      data.reduce(
        (max, entry) =>
          Math.max(
            max,
            resolveFilteredEntryTotal(entry, activeChannelSet, allowLeadFallback),
          ),
        0,
      ) || 1
    );
  }, [activeChannelSet, allowLeadFallback, data]);

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
  const unknownEntry = useMemo(
    () => data.find((entry) => (entry.key || "").toString().toUpperCase() === "UNK") ?? null,
    [data],
  );
  const unknownVisitsTotal = unknownEntry
    ? resolveFilteredEntryTotal(unknownEntry, activeChannelSet, allowLeadFallback)
    : 0;

  const stageKeys = useMemo(
    () => (stageKeysProp && stageKeysProp.length ? stageKeysProp : MAPA_STAGE_KEYS),
    [stageKeysProp],
  );

  const aggregatedStages = useMemo(() => {
    const totals = createEmptyStageTotals(stageKeys);
    if (attributionFilterActive) {
      return totals;
    }
    for (const entry of data) {
      const stages = (entry.etapas_totales || {}) as Record<string, number | undefined>;
      for (const stageKey of stageKeys) {
        totals[stageKey] += stages[stageKey] ?? 0;
      }
    }
    return totals;
  }, [attributionFilterActive, data, stageKeys]);

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
      whatsappConversations: 0,
      channels: {
        webchat: 0,
        whatsapp: 0,
        voz: 0,
        correo: 0,
      },
      stages:
        attributionFilterActive
          ? createEmptyStageTotals(stageKeys)
          : globalStages
            ? { ...globalStages }
            : { ...aggregatedStages },
    };

    for (const entry of data) {
      const conversation = showConversationMetrics
        ? resolveFilteredConversation(entry, activeChannelSet)
        : { con_conversacion: 0, sin_conversacion: 0 };
      summary.totalVisitas += resolveFilteredEntryTotal(entry, activeChannelSet, allowLeadFallback);
      summary.conversation.con_conversacion += conversation.con_conversacion ?? 0;
      summary.conversation.sin_conversacion += conversation.sin_conversacion ?? 0;
      summary.whatsappConversations += resolveWhatsappConversationTotal(entry, activeChannelSet);
      summary.channels.webchat += resolveChannelTotal(entry, "webchat", activeChannelSet);
      summary.channels.whatsapp += resolveChannelTotal(entry, "whatsapp", activeChannelSet);
      summary.channels.voz += resolveChannelTotal(entry, "voz", activeChannelSet);
      summary.channels.correo += resolveChannelTotal(entry, "correo", activeChannelSet);
    }

    summary.stages =
      attributionFilterActive
        ? createEmptyStageTotals(stageKeys)
        : globalStages
          ? { ...globalStages }
          : { ...aggregatedStages };

    const locationSubtitle =
      data.length === 1
        ? "1 ubicación"
        : `${formatNumber(data.length)} ubicaciones`;
    summary.subtitle = `${formatNumber(summary.totalVisitas)} interacciones · ${locationSubtitle}`;
    return summary;
  }, [activeChannelSet, aggregatedStages, allowLeadFallback, attributionFilterActive, data, globalStages, showConversationMetrics, stageKeys]);

  const activeMetrics = useMemo<MetricsPayload | null>(() => {
    if (!activeEntry) return null;

    const conversation = showConversationMetrics
      ? resolveFilteredConversation(activeEntry, activeChannelSet)
      : { con_conversacion: 0, sin_conversacion: 0 };
    const whatsappConversations = showWhatsappConversationMetrics
      ? resolveWhatsappConversationTotal(activeEntry, activeChannelSet)
      : 0;

    const stageTotals = createEmptyStageTotals(stageKeys);
    if (!attributionFilterActive) {
      const rawStages = (activeEntry.etapas_totales || {}) as Record<string, number | undefined>;
      for (const stageKey of stageKeys) {
        stageTotals[stageKey] = rawStages[stageKey] ?? 0;
      }
    }

    return {
      scope: "location",
      title: activeEntry.name,
      subtitle: `${NIVEL_LABELS[activeEntry.nivel as keyof typeof NIVEL_LABELS] ?? "Ubicación"} · ${formatNumber(resolveFilteredEntryTotal(activeEntry, activeChannelSet, allowLeadFallback))} interacciones`,
      totalVisitas: resolveFilteredEntryTotal(activeEntry, activeChannelSet, allowLeadFallback),
      conversation: {
        con_conversacion: conversation.con_conversacion ?? 0,
        sin_conversacion: conversation.sin_conversacion ?? 0,
      },
      whatsappConversations,
      channels: {
        webchat: resolveChannelTotal(activeEntry, "webchat", activeChannelSet),
        whatsapp: resolveChannelTotal(activeEntry, "whatsapp", activeChannelSet),
        voz: resolveChannelTotal(activeEntry, "voz", activeChannelSet),
        correo: resolveChannelTotal(activeEntry, "correo", activeChannelSet),
      },
      stages: stageTotals,
    };
  }, [
    activeChannelSet,
    activeEntry,
    allowLeadFallback,
    attributionFilterActive,
    showConversationMetrics,
    showWhatsappConversationMetrics,
    stageKeys,
  ]);

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
      const hasCustomChannels =
        activeChannels.length > 0 && activeChannels.length < CHANNEL_KEYS.length;
      if (hasCustomChannels) {
        params.set("canales", activeChannels.join(","));
      } else {
        params.delete("canales");
      }
      if (nextLevel === "estado") {
        params.set("nivel", "estado");
        params.delete("estado");
      } else if (nextLevel === "municipio") {
        params.set("nivel", "municipio");
        const stateCode = (entry.key || "").padStart(2, "0").slice(0, 2);
        params.set("estado", stateCode);
      }
      router.replace(`/mapa-de-conversion?${params.toString()}`, { scroll: false });
    },
    [activeChannels, manualSelectedKey, router, searchParams, setManualSelectedKey],
  );

  const style = useCallback(
    (feature?: Feature) => {
      const entries = feature ? findEntriesForFeature(datasetMap, feature) : [];
      const primaryEntry = entries[0];
      const total = entries.reduce(
        (acc, current) =>
          acc + resolveFilteredEntryTotal(current, activeChannelSet, allowLeadFallback),
        0,
      );
      const hasData = entries.some((current) => Boolean(current.has_data));
      const isSelected = entries.some(
        (current) => current?.key && selectedKey && current.key === selectedKey,
      );
      const isHovered = entries.some(
        (current) => current?.key && hoveredKey && current.key === hoveredKey,
      );

      if (!primaryEntry || !hasData || maxTotal <= 0 || total <= 0) {
        return {
          color: isSelected || isHovered ? "hsl(var(--primary)/0.4)" : "hsl(var(--foreground)/0.1)",
          weight: isSelected || isHovered ? 1.75 : 1,
          fillColor: "transparent",
          fillOpacity: 0,
        };
      }

      const intensity = Math.min(1, total / maxTotal);
      if (colorMode === "channel") {
        const { fillColor, fillOpacity } = resolveChannelStyle(
          primaryEntry,
          intensity,
          Boolean(isSelected || isHovered),
          activeChannelSet,
        );
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
    [activeChannelSet, allowLeadFallback, colorMode, datasetMap, hoveredKey, maxTotal, selectedKey],
  );

  const onEachFeature = useCallback(
    (feature: Feature, layer: LeafletLayer) => {
      const pathLayer = layer as LeafletPath;
      const interactiveLayer = pathLayer as unknown as {
        on?: (event: string, handler: (...args: unknown[]) => void) => void;
        off?: (event: string) => void;
      };
      interactiveLayer.off?.("click");
      interactiveLayer.off?.("mouseover");
      interactiveLayer.off?.("mouseout");

      const entries = findEntriesForFeature(datasetMap, feature);
      const entry = entries[0];

      const tooltipLayer = pathLayer as unknown as {
        bindTooltip?: (content: string, options?: LeafletTooltipOptions) => void;
        unbindTooltip?: () => void;
      };

      if (!entry || !entries.length) {
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

      const aggregateTotal = entries.reduce(
        (acc, current) =>
          acc + resolveFilteredEntryTotal(current, activeChannelSet, allowLeadFallback),
        0,
      );
      const aggregateByChannel = {
        webchat: entries.reduce(
          (acc, current) => acc + resolveChannelTotal(current, "webchat", activeChannelSet),
          0,
        ),
        whatsapp: entries.reduce(
          (acc, current) => acc + resolveChannelTotal(current, "whatsapp", activeChannelSet),
          0,
        ),
        voz: entries.reduce(
          (acc, current) => acc + resolveChannelTotal(current, "voz", activeChannelSet),
          0,
        ),
        correo: entries.reduce(
          (acc, current) => acc + resolveChannelTotal(current, "correo", activeChannelSet),
          0,
        ),
      };
      const conversation = entries.reduce(
        (acc, current) => {
          const currentConversation = resolveFilteredConversation(current, activeChannelSet);
          return {
            con_conversacion: acc.con_conversacion + (currentConversation.con_conversacion ?? 0),
            sin_conversacion: acc.sin_conversacion + (currentConversation.sin_conversacion ?? 0),
          };
        },
        { con_conversacion: 0, sin_conversacion: 0 },
      );
      const whatsappConversationTotal = entries.reduce(
        (acc, current) => acc + resolveWhatsappConversationTotal(current, activeChannelSet),
        0,
      );
      const rows: MapTooltipRow[] = [
        {
          key: "total",
          label: "Visitas totales",
          value: formatNumber(aggregateTotal),
          color: "var(--chart-1)",
        },
      ];
      for (const channel of displayedChannelKeys) {
        const total = aggregateByChannel[channel];
        rows.push({
          key: `channel-${channel}`,
          label: `Total ${CHANNEL_LABELS[channel]}`,
          value: formatNumber(total),
          monospace: true,
          color: resolveChannelColor(channel),
        });
        if (showConversationMetrics && channel === "webchat") {
          rows.push(
            {
              key: "conversationYes",
              label: "Con conversación",
              value: formatNumber(conversation.con_conversacion ?? 0),
              color: "var(--chart-2)",
              indent: true,
            },
            {
              key: "conversationNo",
              label: "Sin conversación",
              value: formatNumber(conversation.sin_conversacion ?? 0),
              color: "var(--chart-3)",
              indent: true,
            },
          );
        }
        if (showWhatsappConversationMetrics && channel === "whatsapp") {
          rows.push({
            key: "whatsappConversation",
            label: "Conversaciones WhatsApp",
            value: formatNumber(whatsappConversationTotal),
            color: "var(--chart-2)",
            indent: true,
          });
        }
      }

      const tooltip = renderToStaticMarkup(
        <MapTooltipContent
          title={entry.name ?? (feature.properties?.name?.toString() ?? "Sin nombre")}
          rows={rows}
        />,
      );

      const tooltipOptions: ExtendedLeafletTooltipOptions = {
        sticky: true,
        className: "talia-map-tooltip",
      };

      tooltipLayer.bindTooltip?.(tooltip, tooltipOptions);
    },
    [
      activeChannelSet,
      allowLeadFallback,
      datasetMap,
      displayedChannelKeys,
      handleFeatureClick,
      setHoveredKey,
      showConversationMetrics,
      showWhatsappConversationMetrics,
    ],
  );

  const center =
    nivel === "pais"
      ? ([20.5, -1] as [number, number])
      : ([19.43, -99.13] as [number, number]);
  const zoom = nivel === "pais" ? 2 : nivel === "estado" ? 5 : 6;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,4fr)_minmax(0,1fr)]">
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
                key={mapLayerKey}
              />
              <FitToData
                activeKeys={keysWithData}
                selectedKey={selectedKey}
                nivel={nivel}
                shape={enhancedGeojson}
              />
            </>
          ) : null}
        </MapContainer>
      </div>
      <aside className="kpi-surface flex h-[320px] flex-col gap-4 p-4 text-sm">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {metrics.scope === "dataset" ? "Resumen" : "Ubicación seleccionada"}
          </span>
          <span className="text-base font-semibold leading-tight">{metrics.title}</span>
          <span className="text-xs text-muted-foreground">
            {metrics.subtitle ?? `${formatNumber(metrics.totalVisitas)} interacciones`}
          </span>
          {nivel === "municipio" && unknownVisitsTotal > 0 ? (
            <span className="text-xs text-muted-foreground">
              Incluye {formatNumber(unknownVisitsTotal)} interacciones sin municipio mapeable.
            </span>
          ) : null}
        </div>
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto pr-1">
          <MetricSection
            title="Canales"
            items={displayedChannelKeys.map((channel) => ({
              label: `Canal ${CHANNEL_LABELS[channel]}`,
              value: metrics.channels[channel],
              indentItems:
                showConversationMetrics && channel === "webchat"
                  ? [
                      { label: "Con conversación", value: metrics.conversation.con_conversacion },
                      { label: "Sin conversación", value: metrics.conversation.sin_conversacion },
                    ]
                  : showWhatsappConversationMetrics && channel === "whatsapp"
                    ? [
                        { label: "Conversaciones WhatsApp", value: metrics.whatsappConversations },
                      ]
                  : undefined,
            }))}
          />
          <MetricSection
            title="Etapas"
            items={stageKeys.map((key) => ({
              label: MAPA_STAGE_LABELS[key] ?? formatStageLabel(key),
              value: metrics.stages[key] ?? 0,
            }))}
          />
        </div>
      </aside>
    </div>
  );
}

function FitToData({
  shape,
  activeKeys,
  selectedKey,
  nivel,
}: {
  shape: GeoJSONType | null;
  activeKeys: Set<string>;
  selectedKey?: string | null;
  nivel: DemografiaMapResponse["nivel"];
}) {
  const map = useMap();

  useEffect(() => {
    if (!shape || shape.type !== "FeatureCollection") return;
    let cancelled = false;
    const hasSelected = typeof selectedKey === "string" && selectedKey.trim().length > 0;

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
          if (hasSelected && selectedKey) {
            return matchesFeatureKey(key, selectedKey);
          }
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
  }, [activeKeys, map, nivel, selectedKey, shape]);

  return null;
}

type MetricItem = {
  label: string;
  value: number;
  indentItems?: Array<{ label: string; value: number }>;
};

function MetricSection({
  title,
  items,
}: {
  title: string;
  items: MetricItem[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </span>
      <div className="space-y-1">
        {items.map((item) => (
          <div key={item.label} className="space-y-1">
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs text-muted-foreground">{item.label}</span>
              <span className="font-medium">{formatNumber(item.value)}</span>
            </div>
            {item.indentItems?.length ? (
              <div className="space-y-1 pl-4">
                {item.indentItems.map((nested) => (
                  <div
                    key={`${item.label}-${nested.label}`}
                    className="flex items-center justify-between gap-4"
                  >
                    <span className="text-xs text-muted-foreground">{nested.label}</span>
                    <span className="font-medium">{formatNumber(nested.value)}</span>
                  </div>
                ))}
              </div>
            ) : null}
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
  allowedChannels?: Set<ChannelKey>,
): { fillColor: string; fillOpacity: number } {
  const totals = entry.totales_por_canal || {};
  const filteredTotals = Object.entries(totals)
    .map(([channel, total]) => {
      const normalized = normalizeChannelKey(channel);
      if (!normalized) return null;
      if (typeof total !== "number" || !Number.isFinite(total)) {
        return [normalized, 0] as const;
      }
      return [normalized, total] as const;
    })
    .filter((item): item is readonly [ChannelKey, number] => Boolean(item))
    .filter(([channel]) => !allowedChannels?.size || allowedChannels.has(channel));

  const sorted = filteredTotals.sort(([, totalA], [, totalB]) => (Number(totalB) ?? 0) - (Number(totalA) ?? 0));
  const fallbackChannel =
    allowedChannels && allowedChannels.size ? Array.from(allowedChannels)[0] : CHANNEL_KEYS[0];
  const topChannel = sorted.find(([, value]) => (Number(value) ?? 0) > 0)?.[0] ?? fallbackChannel;
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

function matchesFeatureKey(candidate: string, target: string): boolean {
  if (!target) return false;
  const normalizedTarget = target.trim();
  if (!normalizedTarget) return false;
  const variants = [
    candidate,
    candidate.toUpperCase(),
    candidate.toLowerCase(),
    candidate.padStart(2, "0"),
    candidate.padStart(2, "0").toUpperCase(),
  ];
  return variants.some((value) => value === normalizedTarget || value === normalizedTarget.toUpperCase());
}

function findEntriesForFeature(
  datasetMap: Map<string, DemografiaMapResponse["dataset"][number]>,
  feature: Feature,
): DemografiaMapResponse["dataset"][number][] {
  const candidates = resolveFeatureCandidates(feature);
  const seen = new Set<string>();
  const entries: DemografiaMapResponse["dataset"][number][] = [];
  for (const key of candidates) {
    const match = datasetMap.get(key);
    if (!match || seen.has(match.key)) continue;
    seen.add(match.key);
    entries.push(match);
  }
  return entries;
}
type LeafletTooltipOptions = Parameters<NonNullable<LeafletPath["bindTooltip"]>>[1];
type ExtendedLeafletTooltipOptions = LeafletTooltipOptions & { className?: string };

type MapTooltipRow = {
  key: string;
  label: string;
  value: string;
  monospace?: boolean;
  valueClassName?: string;
  color?: string;
  indent?: boolean;
};

type MapTooltipContentProps = {
  title: string;
  rows: MapTooltipRow[];
};

function MapTooltipContent({ title, rows }: MapTooltipContentProps) {
  return (
    <div className="border-border/50 bg-background grid min-w-[12rem] items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl">
      <div className="font-medium text-foreground">{title}</div>
      <div className="grid gap-1.5">
        {rows.map((row) => (
          <div
            key={row.key}
            className={cn(
              "text-muted-foreground flex items-center gap-2",
              row.indent ? "pl-3" : "",
            )}
          >
            <span
              className="bg-muted h-2.5 w-2.5 shrink-0 rounded-[2px]"
              style={row.color ? ({ backgroundColor: row.color } as CSSProperties) : undefined}
            />
            <span className="text-muted-foreground flex-1">{row.label}</span>
            <span
              className={cn(
                "text-foreground font-medium",
                row.monospace === false ? "font-sans" : "font-mono tabular-nums",
                row.valueClassName,
              )}
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function resolveChannelColor(channel: string | null | undefined): string {
  const normalized = normalizeChannelKey(channel);
  const color = normalized ? CHANNEL_COLORS[normalized] : DEFAULT_CHANNEL_COLOR;
  return `rgb(${color.join(", ")})`;
}

function formatStageLabel(key: string): string {
  if (!key) return "Sin etapa";
  return key
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

type LeafletGeoJSONFactory = (geojson?: GeoJSONType, options?: LeafletGeoJSONOptions) => {
  getBounds?: () => {
    isValid?: () => boolean;
  } & Record<string, unknown>;
};

type LeafletMapType = {
  flyToBounds?: (bounds: unknown, options?: { padding?: [number, number]; maxZoom?: number }) => void;
};
function resolveFilteredConversation(
  entry: DemografiaMapResponse["dataset"][number],
  allowedChannels?: Set<ChannelKey>,
) {
  const webchatIncluded =
    !allowedChannels || !allowedChannels.size || allowedChannels.has("webchat");
  if (!webchatIncluded) {
    return { con_conversacion: 0, sin_conversacion: 0 };
  }
  const base =
    entry.conversacion_totales ??
    {
      con_conversacion: entry.visitantes_con_chat ?? 0,
      sin_conversacion: entry.visitantes_sin_chat ?? 0,
    };
  if (!allowedChannels || !allowedChannels.size || allowedChannels.size === CHANNEL_KEYS.length) {
    return {
      con_conversacion: base.con_conversacion ?? 0,
      sin_conversacion: base.sin_conversacion ?? 0,
    };
  }
  const webchatTotal = resolveChannelTotal(entry, "webchat", allowedChannels);
  const con = Math.min(base.con_conversacion ?? 0, webchatTotal);
  const sin = Math.max(0, webchatTotal - con);
  return { con_conversacion: con, sin_conversacion: sin };
}
