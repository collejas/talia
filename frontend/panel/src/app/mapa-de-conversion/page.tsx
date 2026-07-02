import type { CSSProperties } from "react";
import type { GeoJSON as GeoJSONType } from "geojson";
import type { VisibilityState } from "@tanstack/react-table";
import Link from "next/link";
import { IconDownload } from "@tabler/icons-react";

import { AppSidebar } from "@/components/AppSidebar";
import { SessionRecovery } from "@/components/session-recovery";
import { SiteHeader } from "@/components/site-header";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { DemografiaControls } from "@/components/mapa-conversion/controls";
import { AcquisitionSummary } from "@/components/mapa-conversion/acquisition-summary";
import { DeferredConversionTables } from "@/components/mapa-conversion/deferred-tables.client";
import { MapaConversionTableClient } from "@/components/mapa-conversion/table.client";
import { LocationComparisonChartClient } from "@/components/mapa-conversion/location-comparison-chart.client";
import { loadDemografiaData } from "@/lib/mapa-conversion/api";
import {
  MAPA_STAGE_KEYS,
  createEmptyStageTotals,
  orderStageKeys,
} from "@/lib/mapa-conversion/stages";
import { buildAcquisitionMetrics } from "@/lib/mapa-conversion/acquisition";
import { MapKpis } from "@/components/mapa-conversion/map-kpis";

export const dynamic = "force-dynamic";

type DemografiaDataset = Awaited<ReturnType<typeof loadDemografiaData>>["map"]["dataset"];

const DEFAULT_CHANNELS = ["webchat", "whatsapp", "voz", "correo"] as const;
type ChannelKey = (typeof DEFAULT_CHANNELS)[number];
type ColorMode = "sequential" | "channel";

const STAGE_LABELS: Record<string, string> = {
  captado: "Captado",
  precalificado: "Precalificado",
  demo: "Cita agendada",
  negociacion: "Negociación",
  cerrado_ganado: "Cerrado (ganado)",
  cerrado_perdido: "Cerrado (perdido)",
};

function selectTopLocation(dataset: DemografiaDataset) {
  if (!dataset.length) return null;
  const sorted = [...dataset].sort((a, b) => (b.total_visitas ?? 0) - (a.total_visitas ?? 0));
  const preferred = sorted.find((entry) => {
    const key = (entry.key || "").toString().trim().toUpperCase();
    const name = (entry.name || "").toString().trim().toLowerCase();
    return key && key !== "UNK" && !name.includes("desconocido");
  });
  return preferred ?? sorted[0];
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

function buildQueryString(params: PageSearchParams): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string" && item.trim()) {
          searchParams.append(key, item.trim());
        }
      }
      continue;
    }
    if (typeof value === "string" && value.trim()) {
      searchParams.set(key, value.trim());
    }
  }
  return searchParams.toString();
}

type PageSearchParams = Record<string, string | string[] | undefined>;

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<PageSearchParams>;
}) {
  const params = searchParams ? await searchParams : {};
  const exportQueryString = buildQueryString(params);
  const exportHref = `/api/crm/demografia/mapa-v2/export/xlsx${exportQueryString ? `?${exportQueryString}` : ""}`;

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
  const campanaIdParam = typeof params.campana_id === "string" ? params.campana_id.trim() : "";
  const campanaTipoParam = typeof params.campana_tipo === "string" ? params.campana_tipo.trim().toLowerCase() : "";
  const templateIdParam = typeof params.template_id === "string" ? params.template_id.trim() : "";
  const waCanalParam =
    typeof params.wa_canal_publicitario === "string"
      ? params.wa_canal_publicitario.trim()
      : "";
  const waCampanaParam =
    typeof params.wa_campana_publicitaria === "string"
      ? params.wa_campana_publicitaria.trim()
      : "";
  const waReglaParam = typeof params.wa_regla_id === "string" ? params.wa_regla_id.trim() : "";
  const utmSource = utmSourceParam.length ? utmSourceParam : null;
  const utmMedium = utmMediumParam.length ? utmMediumParam : null;
  const utmCampaign = utmCampaignParam.length ? utmCampaignParam : null;
  const campanaId = campanaIdParam.length ? campanaIdParam : null;
  const campanaTipo = campanaTipoParam.length ? campanaTipoParam : null;
  const templateId = templateIdParam.length ? templateIdParam : null;
  const waCanalPublicitario = waCanalParam.length ? waCanalParam : null;
  const waCampanaPublicitaria = waCampanaParam.length ? waCampanaParam : null;
  const waReglaId = waReglaParam.length ? waReglaParam : null;
  const attributionFilterActive = Boolean(
    sourceClass ||
      utmSource ||
      utmMedium ||
      utmCampaign ||
      campanaId ||
      campanaTipo ||
      templateId ||
      waCanalPublicitario ||
      waCampanaPublicitaria ||
      waReglaId,
  );
  const waAttributionFilterActive = Boolean(
    waCanalPublicitario || waCampanaPublicitaria || waReglaId,
  );
  const rangoParam = typeof params.rango === "string" ? params.rango.trim().toLowerCase() : "";
  const rango = rangoParam.length ? rangoParam : "ano_actual";
  const desdeParam = typeof params.desde === "string" ? params.desde.trim() : "";
  const hastaParam = typeof params.hasta === "string" ? params.hasta.trim() : "";
  const desde = desdeParam.length ? desdeParam : null;
  const hasta = hastaParam.length ? hastaParam : null;

  let demografiaResponse: Awaited<ReturnType<typeof loadDemografiaData>> | null = null;
  const errores: string[] = [];

  const demografiaTask = loadDemografiaData(nivel, {
    canales: canalesFilter,
    etapas,
    estado: nivel === "municipio" ? normalizedEstado : null,
    sourceClass,
    utmSource,
    utmMedium,
    utmCampaign,
    campanaId,
    campanaTipo,
    templateId,
    waCanalPublicitario,
    waCampanaPublicitaria,
    waReglaId,
    rango,
    desde,
    hasta,
    })
    .then((value) => ({ ok: true as const, value }))
    .catch((error: unknown) => ({
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo obtener la información demográfica.",
    }));

  const [demografiaResult] = await Promise.all([demografiaTask]);

  if (demografiaResult.ok) {
    demografiaResponse = demografiaResult.value;
  } else {
    errores.push(demografiaResult.error);
  }
  const datasetForTables =
    demografiaResponse && waAttributionFilterActive
      ? demografiaResponse.map.dataset.filter((entry) => {
          const whatsappTotal =
            entry.conversation_channels?.conversaciones_whatsapp ??
            entry.visitantes_totales_por_canal?.whatsapp ??
            entry.totales_por_canal?.whatsapp ??
            0;
          return whatsappTotal > 0;
        })
      : demografiaResponse?.map.dataset ?? [];
  const tableData = demografiaResponse ? buildTableData(datasetForTables) : [];
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
  const acquisitionMetrics = buildAcquisitionMetrics(demografiaResponse?.summary ?? null);
  const sesionesWebchatTotales =
    demografiaResponse?.summary.visitantes.totals.sesiones_webchat_total ?? 0;
  const conversacionesWhatsapp =
    demografiaResponse?.summary.visitantes.totals.conversaciones_whatsapp ?? 0;
  const conversacionesVoz = demografiaResponse?.summary.visitantes.totals.conversaciones_voz ?? 0;
  const conversacionesCorreo =
    demografiaResponse?.summary.visitantes.totals.conversaciones_correo ?? 0;
  const whatsappCampaignsTotal =
    demografiaResponse?.summary.visitantes.totals.whatsapp_atribucion_total ??
    demografiaResponse?.summary.visitantes.totals.wa_atribucion_total ??
    0;
  const topLocation = demografiaResponse ? selectTopLocation(demografiaResponse.map.dataset) : null;
  const topLocationName = topLocation?.name ?? "Sin datos";
  const topLocationLeads = topLocation?.leads_total ?? 0;
  const topLocationVisits = topLocation?.total_visitas ?? 0;
  const locationStageLeader = attributionFilterActive
    ? { name: "No atribuible por origen", total: 0 }
    : topLocation
      ? getLocationStageLeader(topLocation)
      : { name: "", total: 0 };
  const utmOptions = (() => {
    const sourceSet = new Set<string>();
    const mediumSet = new Set<string>();
    const campaignSet = new Set<string>();
    const campaignLabelMap =
      demografiaResponse?.summary.attribution_catalog?.utm_campaign_labels ?? {};
    const templateOptionsRaw =
      demografiaResponse?.summary.attribution_catalog?.template_options ?? [];
    const campanaOptionsRaw =
      demografiaResponse?.summary.attribution_catalog?.campana_options ?? [];
    const campanaTipoOptionsRaw =
      demografiaResponse?.summary.attribution_catalog?.campana_tipo_options ?? [];
    const waCanalOptionsRaw =
      demografiaResponse?.summary.attribution_catalog?.wa_canal_options ?? [];
    const waCampanaOptionsRaw =
      demografiaResponse?.summary.attribution_catalog?.wa_campana_options ?? [];
    const waReglaOptionsRaw =
      demografiaResponse?.summary.attribution_catalog?.wa_regla_options ?? [];
    if (!demografiaResponse) {
      return {
        sources: [] as string[],
        media: [] as string[],
        campaigns: [] as Array<{ value: string; label: string }>,
        templates: [] as Array<{ value: string; label: string }>,
        campanas: [] as Array<{ value: string; label: string; canal?: string | null }>,
        campanaTipos: [] as string[],
        waCanales: [] as string[],
        waCampanas: [] as string[],
        waReglas: [] as Array<{
          value: string;
          label: string;
          canal_publicitario?: string | null;
          campana_publicitaria?: string | null;
        }>,
      };
    }
    const pushValue = (set: Set<string>, value: string | null | undefined) => {
      if (!value) return;
      const normalized = value.trim().toLowerCase();
      if (!normalized || normalized === "(none)") return;
      set.add(normalized);
    };
    for (const item of demografiaResponse.summary.visitantes.items ?? []) {
      for (const utm of item.utm_top ?? []) {
        pushValue(sourceSet, utm.utm_source);
        pushValue(mediumSet, utm.utm_medium);
        pushValue(campaignSet, utm.utm_campaign);
      }
    }
    for (const entry of demografiaResponse.map.dataset) {
      for (const utm of entry.traffic_web?.utm_top ?? []) {
        pushValue(sourceSet, utm.utm_source);
        pushValue(mediumSet, utm.utm_medium);
        pushValue(campaignSet, utm.utm_campaign);
      }
    }
    return {
      sources: Array.from(sourceSet).sort(),
      media: Array.from(mediumSet).sort(),
      campaigns: Array.from(campaignSet)
        .sort()
        .map((value) => ({
          value,
          label: campaignLabelMap[value] || value,
        })),
      templates: templateOptionsRaw
        .map((item) => ({
          value: String(item.value || "").trim(),
          label: String(item.label || item.value || "").trim(),
        }))
        .filter((item) => item.value.length > 0),
      campanas: campanaOptionsRaw
        .map((item) => ({
          value: String(item.value || "").trim(),
          label: String(item.label || item.value || "").trim(),
          canal: item.canal ?? null,
        }))
        .filter((item) => item.value.length > 0),
      campanaTipos: campanaTipoOptionsRaw
        .map((value) => String(value || "").trim().toLowerCase())
        .filter((value) => value.length > 0),
      waCanales: waCanalOptionsRaw
        .map((value) => String(value || "").trim())
        .filter((value) => value.length > 0),
      waCampanas: waCampanaOptionsRaw
        .map((value) => String(value || "").trim())
        .filter((value) => value.length > 0),
      waReglas: waReglaOptionsRaw
        .map((item) => ({
          value: String(item.value || "").trim(),
          label: (() => {
            const base = String(item.label || item.value || "").trim();
            const canal = String(item.canal_publicitario || "").trim();
            if (!canal) return base;
            return `${base} · ${canal}`;
          })(),
          canal_publicitario: item.canal_publicitario ?? null,
          campana_publicitaria: item.campana_publicitaria ?? null,
        }))
        .filter((item) => item.value.length > 0),
    };
  })();
  const nivelLabel = nivel.charAt(0).toUpperCase() + nivel.slice(1);
  const mapKpisData = {
    nivelLabel,
    visitasTotales: acquisitionMetrics.totalSessions,
    sesionesWebTotales: acquisitionMetrics.totalSessions,
    sesionesWebchatTotales,
    conversacionesWhatsapp,
    conversacionesVoz,
    conversacionesCorreo,
    whatsappCampaignsTotal,
    topLocationName,
    topLocationLeads,
    topLocationVisits,
    topSource: acquisitionMetrics.topSource?.source ?? "",
    topSourceValue: acquisitionMetrics.topSource?.total ?? 0,
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
              <div className="px-4 lg:px-6">
                <div className="flex flex-wrap justify-end gap-2">
                  <Link
                    href={`/api/crm/demografia/mapa-v2/export/html${exportQueryString ? `?${exportQueryString}` : ""}`}
                    className="inline-flex h-9 items-center gap-2 rounded-md border bg-card px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    <IconDownload className="size-4" />
                    Descargar HTML
                  </Link>
                  <Link
                    href={exportHref}
                    className="inline-flex h-9 items-center gap-2 rounded-md border bg-card px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    <IconDownload className="size-4" />
                    Descargar XLSX
                  </Link>
                </div>
              </div>
              <div className="px-4 lg:px-6">
                <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2.1fr)_minmax(0,0.9fr)] xl:items-stretch">
                  <DemografiaControls
                    nivel={nivel}
                    canales={canalesSelected}
                    etapas={etapas}
                    color={colorMode}
                    sourceClass={sourceClass}
                    utmSource={utmSource}
                    utmMedium={utmMedium}
                    utmCampaign={utmCampaign}
                    campanaId={campanaId}
                    campanaTipo={campanaTipo}
                    templateId={templateId}
                    waCanalPublicitario={waCanalPublicitario}
                    waCampanaPublicitaria={waCampanaPublicitaria}
                    waReglaId={waReglaId}
                    utmSourceOptions={utmOptions.sources}
                    utmMediumOptions={utmOptions.media}
                    utmCampaignOptions={utmOptions.campaigns}
                    campanaOptions={utmOptions.campanas}
                    campanaTipoOptions={utmOptions.campanaTipos}
                    templateOptions={utmOptions.templates}
                    waCanalOptions={utmOptions.waCanales}
                    waCampanaOptions={utmOptions.waCampanas}
                    waReglaOptions={utmOptions.waReglas}
                    rango={rango}
                    desde={desde}
                    hasta={hasta}
                    className="xl:min-h-[540px]"
                  />
                  <section className="flex h-[560px] flex-col overflow-hidden rounded-2xl border bg-card/95 shadow-sm">
                    <div className="border-b px-4 py-3">
                      <p className="text-sm font-medium text-card-foreground/80">Mapa</p>
                    </div>
                    <div className="min-h-0 flex-1 p-3">
                      <LocationComparisonChartClient
                        data={mapDataset}
                        nivel={nivelChart}
                        shape={mapShape}
                        colorMode={colorMode}
                        globalStages={globalStages}
                        channelFilter={canalesSelected}
                        stageKeys={stageKeys}
                        attributionFilterActive={attributionFilterActive}
                        showSummary={false}
                      />
                    </div>
                  </section>
                  <section className="flex h-[560px] flex-col overflow-hidden rounded-2xl border bg-card/95 shadow-sm">
                    <div className="border-b px-4 py-3">
                      <p className="text-sm font-medium text-card-foreground/80">Resumen general</p>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto p-4">
                      <div className="flex flex-col gap-4 text-sm">
                        <div className="flex flex-col gap-1">
                          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                            {mapKpisData.nivelLabel} con más visitas:
                          </span>
                          <span className="text-lg font-semibold leading-tight">
                            {mapKpisData.topLocationName || "Sin datos"}
                          </span>
                        </div>

                        <div className="space-y-2">
                          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Visitas y contactos
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-xs text-muted-foreground">Visitas al sitio</span>
                              <span className="font-medium tabular-nums">
                                {formatNumber(mapKpisData.sesionesWebTotales)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-xs text-muted-foreground">Visitas con chat</span>
                              <span className="font-medium tabular-nums">
                                {formatNumber(mapKpisData.sesionesWebchatTotales)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-xs text-muted-foreground">Atribución WhatsApp</span>
                              <span className="font-medium tabular-nums">
                                {formatNumber(mapKpisData.whatsappCampaignsTotal)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-xs text-muted-foreground">Contactos generados</span>
                              <span className="font-medium tabular-nums">
                                {formatNumber(
                                  mapKpisData.sesionesWebchatTotales +
                                    mapKpisData.conversacionesWhatsapp +
                                    mapKpisData.conversacionesVoz +
                                    mapKpisData.conversacionesCorreo,
                                )}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Canales de contacto
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-xs text-muted-foreground">Webchat</span>
                              <span className="font-medium tabular-nums">
                                {formatNumber(mapKpisData.sesionesWebchatTotales)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-xs text-muted-foreground">WhatsApp</span>
                              <span className="font-medium tabular-nums">
                                {formatNumber(mapKpisData.conversacionesWhatsapp)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-xs text-muted-foreground">Voz</span>
                              <span className="font-medium tabular-nums">
                                {formatNumber(mapKpisData.conversacionesVoz)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-xs text-muted-foreground">Correo</span>
                              <span className="font-medium tabular-nums">
                                {formatNumber(mapKpisData.conversacionesCorreo)}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Etapas
                          </div>
                          <div className="space-y-1">
                            {stageKeys.map((key) => (
                              <div key={key} className="flex items-center justify-between gap-3">
                                <span className="text-xs text-muted-foreground">
                                  {STAGE_LABELS[key] ?? key}
                                </span>
                                <span className="font-medium tabular-nums">
                                  {formatNumber(globalStages[key] ?? 0)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>
                </div>
              </div>
              <div className="px-4 lg:px-6">
                <MapKpis {...mapKpisData} />
              </div>
              <SessionRecovery errors={errores} />
              <div className="px-4 lg:px-6">
                <AcquisitionSummary
                  summary={demografiaResponse?.summary ?? null}
                  filters={{
                    canales: canalesSelected,
                    estado: nivel === "municipio" ? normalizedEstado : null,
                    sourceClass,
                    utmSource,
                    utmMedium,
                    utmCampaign,
                    campanaId,
                    campanaTipo,
                    templateId,
                    waCanalPublicitario,
                    waCampanaPublicitaria,
                    waReglaId,
                    rango,
                    desde,
                    hasta,
                  }}
                />
              </div>
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
              <DeferredConversionTables
                filters={{
                  canales: canalesSelected,
                  estado: nivel === "municipio" ? normalizedEstado : null,
                  sourceClass,
                  utmSource,
                  utmMedium,
                  utmCampaign,
                  campanaId,
                  campanaTipo,
                  templateId,
                  waCanalPublicitario,
                  waCampanaPublicitaria,
                  waReglaId,
                  rango,
                  desde,
                  hasta,
                }}
              />
            </div>
          </div>
        </div>
      </SidebarInset>
      <ThemeToggle />
    </SidebarProvider>
  )
}
