import type { CSSProperties } from "react";
import type { GeoJSON as GeoJSONType } from "geojson";
import type { VisibilityState } from "@tanstack/react-table";

import { AppSidebar } from "@/components/AppSidebar";
import { SessionRecovery } from "@/components/session-recovery";
import { SiteHeader } from "@/components/site-header";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { DemografiaControls } from "@/components/mapa-conversion/controls";
import { MapaConversionTableClient } from "@/components/mapa-conversion/table.client";
import { LocationComparisonChartClient } from "@/components/mapa-conversion/location-comparison-chart.client";
import { VisitsDataTable } from "@/components/visitas/visits-data-table";
import { loadDemografiaData } from "@/lib/mapa-conversion/api";
import {
  MAPA_STAGE_KEYS,
  createEmptyStageTotals,
  orderStageKeys,
} from "@/lib/mapa-conversion/stages";
import { loadVisitsData } from "@/lib/visitas/data";
import { MapKpis } from "@/components/mapa-conversion/map-kpis";

export const dynamic = "force-dynamic";

type DemografiaDataset = Awaited<ReturnType<typeof loadDemografiaData>>["map"]["dataset"];

const DEFAULT_CHANNELS = ["webchat", "whatsapp", "voz"] as const;
type ChannelKey = (typeof DEFAULT_CHANNELS)[number];
type ColorMode = "sequential" | "channel";

const STAGE_LABELS: Record<string, string> = {
  captado: "Captado",
  precalificado: "Precalificado",
  demo: "Demo agendada",
  negociacion: "Negociación",
  cerrado_ganado: "Cerrado (ganado)",
  cerrado_perdido: "Cerrado (perdido)",
};

function selectTopLocation(dataset: DemografiaDataset) {
  if (!dataset.length) return null;
  return [...dataset].sort((a, b) => (b.total_visitas ?? 0) - (a.total_visitas ?? 0))[0];
}

function combineChannelTotals(entry: DemografiaDataset[number]) {
  const combined = new Map<string, number>();
  const leadsPorCanal = entry.leads_totales_por_canal || {};
  const visitantesPorCanal = entry.visitantes_totales_por_canal || {};
  for (const [channel, total] of Object.entries(leadsPorCanal)) {
    combined.set(channel || "desconocido", (combined.get(channel || "desconocido") ?? 0) + (total ?? 0));
  }
  for (const [channel, total] of Object.entries(visitantesPorCanal)) {
    const key = channel || "desconocido";
    combined.set(key, (combined.get(key) ?? 0) + (total ?? 0));
  }
  return combined;
}

function getLocationStageLeader(entry: DemografiaDataset[number]) {
  const stages = entry.etapas_totales || {};
  const topStage = Object.entries(stages).sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))[0];
  const key = topStage?.[0] ?? "";
  return {
    name: key ? STAGE_LABELS[key] ?? key : "",
    total: topStage?.[1] ?? 0,
  };
}

function buildTableData(dataset: DemografiaDataset) {

  return dataset.map((entry, index) => {
    const leadsPorCanal = entry.leads_totales_por_canal || {}
    const visitantesPorCanal = entry.visitantes_totales_por_canal || {}
    const combinados = combineChannelTotals(entry)
    const canalPrincipal =
      Array.from(combinados.entries())
        .sort(([, totalA], [, totalB]) => (totalB ?? 0) - (totalA ?? 0))[0]?.[0] ?? "sin canal"
    const canalLabel = formatChannelLabel(canalPrincipal)
    const etapaPrincipalRaw = Object.entries(entry.etapas_totales || {})
      .sort(([, totalA], [, totalB]) => (totalB ?? 0) - (totalA ?? 0))[0]?.[0] ?? "sin etapa"
    const etapaPrincipal = STAGE_LABELS[etapaPrincipalRaw] ?? etapaPrincipalRaw
    const totalVisitas = entry.total_visitas ?? 0
    const visitantesTotal = entry.visitantes_total ?? 0
    const hasDatos = Boolean(entry.has_data && totalVisitas > 0)
    const visitantesConChat =
      entry.conversacion_totales?.con_conversacion ?? entry.visitantes_con_chat ?? 0
    const visitantesSinChat =
      entry.conversacion_totales?.sin_conversacion ?? entry.visitantes_sin_chat ?? 0
    const totalWhatsapp =
      visitantesPorCanal.whatsapp ??
      entry.totales_por_canal?.whatsapp ??
      entry.leads_totales_por_canal?.whatsapp ??
      0
    const totalVoz =
      visitantesPorCanal.voz ??
      entry.totales_por_canal?.voz ??
      entry.leads_totales_por_canal?.voz ??
      0

    const metrics = {
      leads_total: entry.leads_total ?? 0,
      visitantes_total: visitantesTotal,
      visitantes_con_chat: visitantesConChat,
      visitantes_sin_chat: visitantesSinChat,
      leads_webchat: entry.leads_totales_por_canal?.webchat ?? 0,
      leads_whatsapp: entry.leads_totales_por_canal?.whatsapp ?? 0,
      leads_voz: entry.leads_totales_por_canal?.voz ?? 0,
      total_whatsapp: totalWhatsapp,
      total_voz: totalVoz,
      etapa_captado: entry.etapas_totales?.captado ?? 0,
      etapa_precalificado: entry.etapas_totales?.precalificado ?? 0,
      etapa_negociacion: entry.etapas_totales?.negociacion ?? 0,
      etapa_ganado: entry.etapas_totales?.ganado ?? 0,
      etapa_perdido: entry.etapas_totales?.perdido ?? 0,
    }

    return {
      id: index + 1,
      header: entry.name,
      type: canalLabel,
      status: hasDatos ? "con_datos" : "sin_datos",
      target: String(totalVisitas),
      limit: String(visitantesTotal),
      reviewer: etapaPrincipal,
      raw: {
        ...entry,
        status_meta: {
          label: hasDatos ? "Con datos" : "Sin datos",
          variant: hasDatos ? "default" : "outline",
        },
        metric_meta: {
          value: totalVisitas,
          formatted: formatNumber(totalVisitas),
        },
        canal_meta: {
          principal: canalPrincipal,
          leads: leadsPorCanal,
          visitantes: visitantesPorCanal,
          combinado: Object.fromEntries(combinados),
        },
        metrics,
      },
    }
  })
}

function formatNumber(value: number | undefined): string {
  if (!value) return "0"
  return new Intl.NumberFormat("es-MX").format(value)
}

function formatChannelLabel(value: string | null | undefined): string {
  if (!value) return "Sin canal"
  const normalized = value.replace(/_/g, " ").trim()
  if (!normalized.length) return "Sin canal"
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

const METRIC_COLUMNS: Array<{ id: string; label: string; metricKey: string }> = [
  { id: "leads_total", label: "Leads totales", metricKey: "leads_total" },
  { id: "visitantes_total", label: "Visitantes totales", metricKey: "visitantes_total" },
  { id: "visitantes_con_chat", label: "Visitantes con chat", metricKey: "visitantes_con_chat" },
  { id: "visitantes_sin_chat", label: "Visitantes sin chat", metricKey: "visitantes_sin_chat" },
  { id: "leads_webchat", label: "Leads Webchat", metricKey: "leads_webchat" },
  { id: "leads_whatsapp", label: "Leads WhatsApp", metricKey: "leads_whatsapp" },
  { id: "leads_voz", label: "Leads Voz", metricKey: "leads_voz" },
  { id: "total_whatsapp", label: "Total WhatsApp", metricKey: "total_whatsapp" },
  { id: "total_voz", label: "Total Voz", metricKey: "total_voz" },
  { id: "etapa_captado", label: "Captado", metricKey: "etapa_captado" },
  { id: "etapa_precalificado", label: "Precalificado", metricKey: "etapa_precalificado" },
  { id: "etapa_negociacion", label: "Negociación", metricKey: "etapa_negociacion" },
  { id: "etapa_ganado", label: "Ganado", metricKey: "etapa_ganado" },
  { id: "etapa_perdido", label: "Perdido", metricKey: "etapa_perdido" },
]

function buildInitialVisibility(columns: Array<{ id: string }>): VisibilityState {
  return columns.reduce<VisibilityState>((state, column) => {
    if (column.id) {
      state[column.id] = false
    }
    return state
  }, {})
}

type PageSearchParams = Record<string, string | string[] | undefined>;

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<PageSearchParams>;
}) {
  const params = searchParams ? await searchParams : {};

  const nivelParam = typeof params.nivel === "string" ? params.nivel.toLowerCase() : "pais";
  const requestedNivel = nivelParam === "pais" ? "pais" : nivelParam === "municipio" ? "municipio" : "estado";
  const estadoParam = typeof params.estado === "string" ? params.estado : null;
  const normalizedEstado = estadoParam && estadoParam.trim().length ? estadoParam.trim().padStart(2, "0") : null;
  const nivel: "pais" | "estado" | "municipio" =
    requestedNivel === "municipio" && !normalizedEstado ? "pais" : requestedNivel;
  const canalesParam = typeof params.canales === "string" ? params.canales : "";
  const canalesSelectedRaw =
    canalesParam.trim().length > 0
      ? canalesParam
          .split(",")
          .map((item) => item.trim().toLowerCase())
          .filter(Boolean)
      : [...DEFAULT_CHANNELS];
  const normalizedChannels = canalesSelectedRaw
    .filter((value): value is ChannelKey => DEFAULT_CHANNELS.includes(value as ChannelKey))
    .filter((value, index, array) => array.indexOf(value) === index);
  const canalesSelected: ChannelKey[] = normalizedChannels.length
    ? normalizedChannels
    : [...DEFAULT_CHANNELS];
  const defaultChannelsSorted = [...DEFAULT_CHANNELS].sort();
  const selectedChannelsSorted = [...canalesSelected].sort();
  const canalesDefaultSelected =
    canalesSelected.length === DEFAULT_CHANNELS.length &&
    selectedChannelsSorted.every((value, index) => value === defaultChannelsSorted[index]);
  const canalesFilter = canalesDefaultSelected ? undefined : canalesSelected;
  const etapasParam = typeof params.etapas === "string" ? params.etapas : "";
  const etapas =
    etapasParam.trim().length > 0
      ? etapasParam
          .split(",")
          .map((item) => item.trim().toLowerCase())
          .filter(Boolean)
      : [];
  const colorParam = typeof params.color === "string" ? params.color.toLowerCase() : "";
  const colorMode: ColorMode = colorParam === "channel" ? "channel" : "sequential";
  const sourceClassParam = typeof params.source_class === "string" ? params.source_class.trim().toLowerCase() : "";
  const sourceClass = sourceClassParam.length ? sourceClassParam : null;
  const utmSourceParam = typeof params.utm_source === "string" ? params.utm_source.trim().toLowerCase() : "";
  const utmMediumParam = typeof params.utm_medium === "string" ? params.utm_medium.trim().toLowerCase() : "";
  const utmCampaignParam = typeof params.utm_campaign === "string" ? params.utm_campaign.trim().toLowerCase() : "";
  const utmSource = utmSourceParam.length ? utmSourceParam : null;
  const utmMedium = utmMediumParam.length ? utmMediumParam : null;
  const utmCampaign = utmCampaignParam.length ? utmCampaignParam : null;

  let demografiaResponse: Awaited<ReturnType<typeof loadDemografiaData>> | null = null;
  let visitsPayload: Awaited<ReturnType<typeof loadVisitsData>> | null = null;
  const errores: string[] = [];

  try {
    demografiaResponse = await loadDemografiaData(nivel, {
      canales: canalesFilter,
      etapas,
      estado: nivel === "municipio" ? normalizedEstado : null,
      sourceClass,
      utmSource,
      utmMedium,
      utmCampaign,
    });
  } catch (error) {
    errores.push(
      error instanceof Error
        ? error.message
        : "No se pudo obtener la información demográfica."
    );
  }

  try {
    visitsPayload = await loadVisitsData();
  } catch (error) {
    errores.push(
      error instanceof Error
        ? error.message
        : "No se pudieron cargar las visitas recientes."
    );
  }

  const tableData = demografiaResponse ? buildTableData(demografiaResponse.map.dataset) : [];
  const metricColumns = METRIC_COLUMNS;
  const metricColumnsVisibility = buildInitialVisibility(metricColumns);
  const mapDataset = demografiaResponse
    ? [...demografiaResponse.map.dataset].sort(
        (a, b) => (b.total_visitas ?? 0) - (a.total_visitas ?? 0),
      )
    : [];
  const stageKeysFromData = demografiaResponse
    ? Array.from(
        new Set(
          demografiaResponse.map.dataset.flatMap((entry) =>
            Object.keys(entry.etapas_totales ?? {}),
          ),
        ),
      )
    : MAPA_STAGE_KEYS;
  const stageKeys = stageKeysFromData.length ? orderStageKeys(stageKeysFromData) : MAPA_STAGE_KEYS;
  const nivelChart = demografiaResponse?.map.nivel ?? nivel;
  const globalStages = demografiaResponse
    ? demografiaResponse.map.dataset.reduce((acc, entry) => {
        const stages = (entry.etapas_totales || {}) as Record<string, number | undefined>;
        for (const stageKey of stageKeys) {
          acc[stageKey] = (acc[stageKey] ?? 0) + (stages[stageKey] ?? 0);
        }
        return acc;
      }, createEmptyStageTotals(stageKeys))
    : createEmptyStageTotals(stageKeys);
  const visitantesTotal = demografiaResponse?.summary.visitantes.totals.total ?? 0;
  const sesionesWebTotales = demografiaResponse?.summary.visitantes.totals.sesiones_web_total ?? 0;
  const sesionesWebchatTotales =
    demografiaResponse?.summary.visitantes.totals.sesiones_webchat_total ?? 0;
  const conversacionesWhatsapp =
    demografiaResponse?.summary.visitantes.totals.conversaciones_whatsapp ?? 0;
  const conversacionesVoz = demografiaResponse?.summary.visitantes.totals.conversaciones_voz ?? 0;
  const topLocation = demografiaResponse ? selectTopLocation(demografiaResponse.map.dataset) : null;
  const topLocationName = topLocation?.name ?? "Sin datos";
  const topLocationLeads = topLocation?.leads_total ?? 0;
  const topLocationVisits = topLocation?.total_visitas ?? 0;
  const locationStageLeader = topLocation ? getLocationStageLeader(topLocation) : { name: "", total: 0 };
  const topSource = (() => {
    if (!demografiaResponse) return { source: "", total: 0 };
    const totals = new Map<string, number>();
    for (const entry of demografiaResponse.map.dataset) {
      const sources = entry.traffic_web?.fuentes_top ?? [];
      for (const source of sources) {
        const key = (source.source || "").trim().toLowerCase();
        if (!key) continue;
        totals.set(key, (totals.get(key) ?? 0) + (source.total ?? 0));
      }
    }
    const first = Array.from(totals.entries()).sort((a, b) => b[1] - a[1])[0];
    if (!first) return { source: "", total: 0 };
    return { source: formatChannelLabel(first[0]), total: first[1] };
  })();
  const nivelLabel = nivel.charAt(0).toUpperCase() + nivel.slice(1);
  const mapKpisData = {
    nivelLabel,
    visitasTotales: visitantesTotal,
    sesionesWebTotales,
    sesionesWebchatTotales,
    conversacionesWhatsapp,
    conversacionesVoz,
    topLocationName,
    topLocationLeads,
    topLocationVisits,
    topSource: topSource.source,
    topSourceValue: topSource.total,
    stageLeader: locationStageLeader.name,
    stageLeaderValue: locationStageLeader.total,
  };
  const mapShape = (() => {
    const raw = demografiaResponse?.map.geojson;
    if (!raw || typeof raw !== "object") return null;
    if (raw && typeof (raw as { type?: unknown }).type === "string") {
      return raw as unknown as GeoJSONType;
    }
    return null;
  })();
  const visitsTable = visitsPayload?.table ?? [];
  if (visitsPayload?.errors?.length) {
    for (const message of visitsPayload.errors) {
      if (message && !errores.includes(message)) {
        errores.push(message);
      }
    }
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as CSSProperties
      }
    >
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader title="Mapa de Conversión" />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
              <MapKpis {...mapKpisData} />
              <DemografiaControls
                nivel={nivel}
                canales={canalesSelected}
                etapas={etapas}
                color={colorMode}
                sourceClass={sourceClass}
                utmSource={utmSource}
                utmMedium={utmMedium}
                utmCampaign={utmCampaign}
              />
              <SessionRecovery errors={errores} />
              {demografiaResponse ? (
                <div className="px-4 lg:px-6">
                  <LocationComparisonChartClient
                    data={mapDataset}
                    nivel={nivelChart}
                    shape={mapShape}
                    colorMode={colorMode}
                    globalStages={globalStages}
                    channelFilter={canalesSelected}
                    stageKeys={stageKeys}
                  />
                </div>
              ) : null}
              {tableData.length && demografiaResponse ? (
                <div className="px-4 lg:px-6">
                  <MapaConversionTableClient
                    data={tableData}
                    storageKey="mapa-conversion-table-column-order"
                    columnLabels={{
                      header: "Ubicación",
                      type: "Canal principal",
                      status: "Estado de datos",
                      target: "Visitas totales",
                      reviewer: "Etapa principal",
                    }}
                    metricColumns={metricColumns}
                    initialVisibility={metricColumnsVisibility}
                    nivel={nivel}
                    summary={demografiaResponse.summary}
                  />
                </div>
              ) : null}
              {visitsTable.length ? (
                <div className="px-4 lg:px-6">
                  <VisitsDataTable data={visitsTable} />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </SidebarInset>
      <ThemeToggle />
    </SidebarProvider>
  )
}
