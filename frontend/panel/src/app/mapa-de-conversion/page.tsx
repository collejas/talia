import type { CSSProperties } from "react";
import type { GeoJSON as GeoJSONType } from "geojson";
import type { VisibilityState } from "@tanstack/react-table";

import { AppSidebar } from "@/components/AppSidebar";
import { SectionCards } from "@/components/section-cards";
import { SessionRecovery } from "@/components/session-recovery";
import { SiteHeader } from "@/components/site-header";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { DemografiaControls } from "@/components/mapa-conversion/controls";
import { MapaConversionTableClient } from "@/components/mapa-conversion/table.client";
import type { LeadCards } from "@/lib/leads/data";
import { LocationComparisonChartClient } from "@/components/mapa-conversion/location-comparison-chart.client";
import { loadDemografiaData } from "@/lib/mapa-conversion/api";
import { MAPA_STAGE_KEYS, createEmptyStageTotals } from "@/lib/mapa-conversion/stages";

export const dynamic = "force-dynamic";

type DemografiaDataset = Awaited<ReturnType<typeof loadDemografiaData>>["map"]["dataset"];

const DEFAULT_CHANNELS = ["webchat", "whatsapp", "voz"] as const;
type ChannelKey = (typeof DEFAULT_CHANNELS)[number];
type ColorMode = "sequential" | "channel";

function selectTopLocation(dataset: DemografiaDataset) {
  if (!dataset.length) {
    return { name: "—", leads_total: 0, total_visitas: 0 } as DemografiaDataset[number];
  }
  return [...dataset].sort((a, b) => (b.total_visitas ?? 0) - (a.total_visitas ?? 0))[0];
}

function buildCardsData(
  summaryTotals: Record<string, number>,
  visitantesTotals: { con_chat: number; total: number },
  dataset: DemografiaDataset,
): LeadCards {
  const topUbicacion = selectTopLocation(dataset);

  return {
    total: summaryTotals.total ?? 0,
    abiertas: summaryTotals.abiertas ?? 0,
    ganadas: summaryTotals.ganadas ?? 0,
    perdidas: summaryTotals.perdidas ?? 0,
    nuevas: summaryTotals.total ?? 0,
    montoTotal: visitantesTotals.total ?? 0,
    topVendedor: {
      nombre: topUbicacion.name,
      total: topUbicacion.total_visitas ?? 0,
    },
  };
}

function buildTableData(dataset: Awaited<ReturnType<typeof loadDemografiaData>>["map"]["dataset"]) {
  const stageLabels: Record<string, string> = {
    captado: "Captado",
    precalificado: "Precalificado",
    negociacion: "Negociación",
    ganado: "Ganado",
    perdido: "Perdido",
  }

  return dataset.map((entry, index) => {
    const leadsPorCanal = entry.leads_totales_por_canal || {}
    const visitantesPorCanal = entry.visitantes_totales_por_canal || {}
    const combinados = new Map<string, number>()
    for (const [channel, total] of Object.entries(leadsPorCanal)) {
      combinados.set(channel || "desconocido", (combinados.get(channel || "desconocido") ?? 0) + (total ?? 0))
    }
    for (const [channel, total] of Object.entries(visitantesPorCanal)) {
      const key = channel || "desconocido"
      combinados.set(key, (combinados.get(key) ?? 0) + (total ?? 0))
    }
    const canalPrincipal =
      Array.from(combinados.entries())
        .sort(([, totalA], [, totalB]) => (totalB ?? 0) - (totalA ?? 0))[0]?.[0] ?? "sin canal"
    const canalLabel = formatChannelLabel(canalPrincipal)
    const etapaPrincipalRaw = Object.entries(entry.etapas_totales || {})
      .sort(([, totalA], [, totalB]) => (totalB ?? 0) - (totalA ?? 0))[0]?.[0] ?? "sin etapa"
    const etapaPrincipal = stageLabels[etapaPrincipalRaw] ?? etapaPrincipalRaw
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

  let demografiaResponse: Awaited<ReturnType<typeof loadDemografiaData>> | null = null;
  const errores: string[] = [];

  try {
    demografiaResponse = await loadDemografiaData(nivel, {
      canales: canalesFilter,
      etapas,
      estado: nivel === "municipio" ? normalizedEstado : null,
    });
  } catch (error) {
    errores.push(
      error instanceof Error
        ? error.message
        : "No se pudo obtener la información demográfica."
    );
  }

  const cardsData = demografiaResponse
    ? buildCardsData(
        demografiaResponse.summary.leads.totals,
        demografiaResponse.summary.visitantes.totals,
        demografiaResponse.map.dataset,
      )
    : {
        total: 0,
        abiertas: 0,
        ganadas: 0,
        perdidas: 0,
        nuevas: 0,
        montoTotal: 0,
        topVendedor: { nombre: "—", total: 0 },
      };

  const tableData = demografiaResponse ? buildTableData(demografiaResponse.map.dataset) : [];
  const metricColumns = METRIC_COLUMNS;
  const metricColumnsVisibility = buildInitialVisibility(metricColumns);
  const mapDataset = demografiaResponse
    ? [...demografiaResponse.map.dataset].sort(
        (a, b) => (b.total_visitas ?? 0) - (a.total_visitas ?? 0),
      )
    : [];
  const nivelChart = demografiaResponse?.map.nivel ?? nivel;
  const globalStages = demografiaResponse
    ? demografiaResponse.map.dataset.reduce((acc, entry) => {
        const stages = entry.etapas_totales || {};
        for (const stageKey of MAPA_STAGE_KEYS) {
          acc[stageKey] += stages[stageKey] ?? 0;
        }
        return acc;
      }, createEmptyStageTotals())
    : createEmptyStageTotals();
  const mapShape = (() => {
    const raw = demografiaResponse?.map.geojson;
    if (!raw || typeof raw !== "object") return null;
    if (raw && typeof (raw as { type?: unknown }).type === "string") {
      return raw as unknown as GeoJSONType;
    }
    return null;
  })();

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
              <SectionCards data={cardsData} />
              <DemografiaControls
                nivel={nivel}
                canales={canalesSelected}
                etapas={etapas}
                color={colorMode}
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
            </div>
          </div>
        </div>
      </SidebarInset>
      <ThemeToggle />
    </SidebarProvider>
  )
}
