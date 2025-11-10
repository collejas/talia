import type { CSSProperties } from "react";
import type { GeoJSON as GeoJSONType } from "geojson";

import { AppSidebar } from "@/components/AppSidebar";
import { DataTable } from "@/components/data-table";
import { SectionCards } from "@/components/section-cards";
import { SessionRecovery } from "@/components/session-recovery";
import { SiteHeader } from "@/components/site-header";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { DemografiaControls } from "@/components/mapa-conversion/controls";
import { loadDemografiaData } from "@/lib/mapa-conversion/api";
import type { LeadCards } from "@/lib/leads/data";
import { LocationComparisonChartClient } from "@/components/mapa-conversion/location-comparison-chart.client";

export const dynamic = "force-dynamic";

type DemografiaDataset = Awaited<ReturnType<typeof loadDemografiaData>>["map"]["dataset"];

const DEFAULT_CHANNELS = ["webchat", "whatsapp", "voz"];

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
    const canales = entry.totales_por_canal || {}
    const canalPrincipal = Object.entries(canales)
      .sort(([, totalA], [, totalB]) => (totalB ?? 0) - (totalA ?? 0))[0]?.[0] ?? "sin canal"
    const etapaPrincipalRaw = Object.entries(entry.etapas_totales || {})
      .sort(([, totalA], [, totalB]) => (totalB ?? 0) - (totalA ?? 0))[0]?.[0] ?? "sin etapa"
    const etapaPrincipal = stageLabels[etapaPrincipalRaw] ?? etapaPrincipalRaw

    return {
      id: index + 1,
      header: entry.name,
      type: canalPrincipal,
      status: entry.has_data ? "Con visitas" : "Sin visitas",
      target: formatNumber(entry.total_visitas ?? 0),
      limit: formatNumber(entry.visitantes_total ?? 0),
      reviewer: etapaPrincipal,
      raw: entry,
    }
  })
}

function formatNumber(value: number | undefined): string {
  if (!value) return "0"
  return new Intl.NumberFormat("es-MX").format(value)
}

type PageSearchParams = Record<string, string | string[] | undefined>;

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<PageSearchParams>;
}) {
  const params = searchParams ? await searchParams : {};

  const nivelParam = typeof params.nivel === "string" ? params.nivel.toLowerCase() : "estado";
  const requestedNivel = nivelParam === "pais" ? "pais" : nivelParam === "municipio" ? "municipio" : "estado";
  const estadoParam = typeof params.estado === "string" ? params.estado : null;
  const normalizedEstado = estadoParam && estadoParam.trim().length ? estadoParam.trim().padStart(2, "0") : null;
  const nivel: "pais" | "estado" | "municipio" =
    requestedNivel === "municipio" && !normalizedEstado ? "estado" : requestedNivel;
  const canalesParam = typeof params.canales === "string" ? params.canales : "";
  const canalesSelected =
    canalesParam.trim().length > 0
      ? canalesParam
          .split(",")
          .map((item) => item.trim().toLowerCase())
          .filter(Boolean)
      : DEFAULT_CHANNELS;
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
  const mapDataset = demografiaResponse
    ? [...demografiaResponse.map.dataset].sort(
        (a, b) => (b.total_visitas ?? 0) - (a.total_visitas ?? 0),
      )
    : [];
  const nivelChart = demografiaResponse?.map.nivel ?? nivel;
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
              <DemografiaControls nivel={nivel} canales={canalesSelected} etapas={etapas} />
              <SectionCards data={cardsData} />
              <SessionRecovery errors={errores} />
              {demografiaResponse ? (
                <div className="px-4 lg:px-6">
                  <LocationComparisonChartClient
                    data={mapDataset}
                    nivel={nivelChart}
                    shape={mapShape}
                  />
                </div>
              ) : null}
              {tableData.length ? (
                <div className="px-4 lg:px-6">
                  <DataTable data={tableData} storageKey="mapa-conversion-table-column-order" />
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
