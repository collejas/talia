"use client";

import * as React from "react";

import { VisitsDataTable } from "@/components/visitas/visits-data-table";
import type { VisitTableRow } from "@/lib/visitas/data";

type DeferredTablesFilters = {
  canales: string[];
  estado: string | null;
  sourceClass: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  campanaId: string | null;
  campanaTipo: string | null;
  templateId: string | null;
  waCanalPublicitario: string | null;
  waCampanaPublicitaria: string | null;
  waReglaId: string | null;
  rango: string | null;
  desde: string | null;
  hasta: string | null;
};

type Props = {
  filters: DeferredTablesFilters;
  summaryCounts?: {
    webchat: number;
    whatsapp: number;
    voz: number;
    correo: number;
  };
  enabled?: boolean;
};

type ResponsePayload = {
  ok: boolean;
  visitsTable?: VisitTableRow[];
  conversationsTable?: VisitTableRow[];
  errors?: string[];
};

type SectionState = {
  data: VisitTableRow[] | null;
  error: string | null;
  loading: boolean;
};

function buildParams(filters: DeferredTablesFilters) {
  const params = new URLSearchParams();
  if (filters.canales.length) params.set("canales", filters.canales.join(","));
  if (filters.estado) params.set("estado", filters.estado);
  if (filters.sourceClass) params.set("source_class", filters.sourceClass);
  if (filters.utmSource) params.set("utm_source", filters.utmSource);
  if (filters.utmMedium) params.set("utm_medium", filters.utmMedium);
  if (filters.utmCampaign) params.set("utm_campaign", filters.utmCampaign);
  if (filters.campanaId) params.set("campana_id", filters.campanaId);
  if (filters.campanaTipo) params.set("campana_tipo", filters.campanaTipo);
  if (filters.templateId) params.set("template_id", filters.templateId);
  if (filters.waCanalPublicitario) params.set("wa_canal_publicitario", filters.waCanalPublicitario);
  if (filters.waCampanaPublicitaria) params.set("wa_campana_publicitaria", filters.waCampanaPublicitaria);
  if (filters.waReglaId) params.set("wa_regla_id", filters.waReglaId);
  if (filters.rango) params.set("rango", filters.rango);
  if (filters.desde) params.set("desde", filters.desde);
  if (filters.hasta) params.set("hasta", filters.hasta);
  return params;
}

export function DeferredConversionTables({ filters, summaryCounts, enabled = true }: Props) {
  const [visits, setVisits] = React.useState<SectionState>({
    data: null,
    error: null,
    loading: false,
  });
  const [conversations, setConversations] = React.useState<SectionState>({
    data: null,
    error: null,
    loading: false,
  });

  React.useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const params = buildParams(filters);
    const baseQuery = params.toString();

    setVisits({ data: null, error: null, loading: true });
    setConversations({ data: null, error: null, loading: true });

    const fetchSection = async (table: "visits" | "conversations") => {
      const query = new URLSearchParams(baseQuery);
      query.set("table", table);
      try {
        const response = await fetch(`/api/crm/mapa-conversion/tables?${query.toString()}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const payload = (await response.json()) as ResponsePayload;
        if (!response.ok || !payload.ok) {
          throw new Error(payload.errors?.[0] || "No se pudieron cargar las tablas.");
        }
        const rows = table === "visits" ? payload.visitsTable ?? [] : payload.conversationsTable ?? [];
        if (table === "visits") {
          setVisits({ data: rows, error: null, loading: false });
        } else {
          setConversations({ data: rows, error: null, loading: false });
        }
      } catch (fetchError: unknown) {
        if (controller.signal.aborted) return;
        const message =
          fetchError instanceof Error ? fetchError.message : "No se pudieron cargar las tablas.";
        if (table === "visits") {
          setVisits({ data: null, error: message, loading: false });
        } else {
          setConversations({ data: null, error: message, loading: false });
        }
      }
    };

    void fetchSection("visits");
    void fetchSection("conversations");

    return () => controller.abort();
  }, [enabled, filters]);

  if (!enabled) return null;

  const webchatConversationRows = (conversations.data ?? []).filter(
    (row) => row.raw?.canal === "webchat",
  );
  const whatsappConversationRows = (conversations.data ?? []).filter(
    (row) => row.raw?.canal === "whatsapp",
  );
  const vozCount = summaryCounts?.voz ?? 0;
  const correoCount = summaryCounts?.correo ?? 0;

  return (
    <>
      <div className="px-4 lg:px-6">
        <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          El detalle inferior del mapa solo desglosa fuentes que hoy tienen trazabilidad fila por fila en esta vista: visitas web, conversaciones webchat y WhatsApp atribuido. Voz y correo siguen siendo agregados.
        </div>
      </div>
      <div className="px-4 lg:px-6">
        <div className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Visitas web
        </div>
        {visits.error ? (
          <div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
            {visits.error}
          </div>
        ) : visits.loading ? (
          <div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
            Cargando visitas...
          </div>
        ) : visits.data?.length ? (
          <VisitsDataTable data={visits.data} />
        ) : (
          <div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
            No hay visitas para mostrar.
          </div>
        )}
      </div>
      <div className="px-4 lg:px-6">
        <div className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Conversaciones webchat
        </div>
        {conversations.error ? (
          <div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
            {conversations.error}
          </div>
        ) : conversations.loading ? (
          <div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
            Cargando conversaciones...
          </div>
        ) : webchatConversationRows.length ? (
          <VisitsDataTable data={webchatConversationRows} />
        ) : (
          <div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
            No hay conversaciones de webchat para mostrar.
          </div>
        )}
      </div>
      <div className="px-4 lg:px-6">
        <div className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          WhatsApp atribuido
        </div>
        {conversations.error ? (
          <div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
            {conversations.error}
          </div>
        ) : conversations.loading ? (
          <div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
            Cargando conversaciones atribuidas de WhatsApp...
          </div>
        ) : whatsappConversationRows.length ? (
          <VisitsDataTable data={whatsappConversationRows} />
        ) : (
          <div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
            No hay conversaciones atribuidas de WhatsApp para mostrar.
          </div>
        )}
      </div>
      <div className="px-4 lg:px-6">
        <div className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Canales sin detalle fila por fila
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-dashed px-4 py-5 text-sm">
            <div className="font-medium">Voz</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{vozCount}</div>
            <p className="mt-2 text-muted-foreground">
              Este bloque hoy solo existe como conteo agregado en el mapa. No hay tabla detallada equivalente a webchat/WhatsApp.
            </p>
          </div>
          <div className="rounded-lg border border-dashed px-4 py-5 text-sm">
            <div className="font-medium">Correo</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{correoCount}</div>
            <p className="mt-2 text-muted-foreground">
              Este bloque hoy solo existe como conteo agregado en el mapa. No hay tabla detallada equivalente a webchat/WhatsApp.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
