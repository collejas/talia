"use client";

import * as React from "react";

import { MarketingCards } from "@/components/dashboard/marketing-cards";
import { MarketingTimeseries } from "@/components/dashboard/marketing-timeseries";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  ProspeccionCampanaItem,
  ProspeccionFraseByRule,
  ProspeccionMetricasSummary,
  ProspeccionTimeseries,
} from "@/lib/dashboard/prospeccion-kpis";

type MarketingLazySectionProps = {
  dateFrom?: string | null;
  dateTo?: string | null;
};

type Payload = {
  summary: ProspeccionMetricasSummary;
  items: ProspeccionCampanaItem[];
  byRule: ProspeccionFraseByRule[];
};

type TimeseriesPayload = {
  timeseries: ProspeccionTimeseries;
};

function SectionTitle({ label }: { label: string }) {
  return (
    <div className="px-4 lg:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

function MarketingFallback() {
  return (
    <>
      <SectionTitle label="Marketing · Prospección" />
      <div className="grid grid-cols-1 gap-4 px-4 lg:grid-cols-2 lg:px-6 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-40 rounded-xl" />
        ))}
      </div>
      <SectionTitle label="Rendimiento de Campañas" />
      <Skeleton className="mx-4 h-[280px] rounded-xl lg:mx-6" />
    </>
  );
}

function MarketingChartFallback() {
  return (
    <>
      <SectionTitle label="Rendimiento de Campañas" />
      <Skeleton className="mx-4 h-[280px] rounded-xl lg:mx-6" />
    </>
  );
}

function MarketingTimeseriesLazy({
  dateFrom,
  dateTo,
}: MarketingLazySectionProps) {
  const [payload, setPayload] = React.useState<TimeseriesPayload | null>(null);

  React.useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams();
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      params.set("include_whatsapp_channels", "false");
      const suffix = params.toString() ? `?${params.toString()}` : "";

      fetch(`/api/prospeccion/metricas${suffix}`, {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) throw new Error(`marketing_timeseries_${response.status}`);
          return response.json();
        })
        .then((json) =>
          setPayload({
            timeseries: {
              campanas: Array.isArray(json?.campanas?.timeseries) ? json.campanas.timeseries : [],
              frases_whatsapp: Array.isArray(json?.frases_whatsapp?.timeseries) ? json.frases_whatsapp.timeseries : [],
            },
          }),
        )
        .catch(() => {
          setPayload({ timeseries: { campanas: [], frases_whatsapp: [] } });
        });
    }, 1200);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [dateFrom, dateTo]);

  if (!payload) {
    return <MarketingChartFallback />;
  }

  return (
    <>
      <SectionTitle label="Rendimiento de Campañas" />
      <div className="px-4 lg:px-6">
        <MarketingTimeseries
          data={payload.timeseries}
          dateFrom={dateFrom}
          dateTo={dateTo}
        />
      </div>
    </>
  );
}

export function MarketingLazySection({ dateFrom, dateTo }: MarketingLazySectionProps) {
  const [payload, setPayload] = React.useState<Payload | null>(null);

  React.useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams();
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      params.set("include_campaign_timeseries", "false");
      params.set("include_whatsapp_timeseries", "false");
      params.set("include_whatsapp_channels", "false");
      const suffix = params.toString() ? `?${params.toString()}` : "";

      fetch(`/api/prospeccion/metricas${suffix}`, {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`marketing_${response.status}`);
          }
          return response.json();
        })
        .then((json) =>
          setPayload({
            summary: {
              campanas: json?.campanas?.summary ?? {
                envios_totales: 0,
                envios_enviados: 0,
                envios_entregados: 0,
                envios_respondidos: 0,
                brevo_aperturas: 0,
                brevo_clicks: 0,
                sesiones_utm: 0,
                tasa_entrega_pct: 0,
                tasa_respuesta_pct: 0,
              },
              frases_whatsapp: json?.frases_whatsapp?.summary ?? {
                conversaciones_atribuidas: 0,
                contactos_unicos: 0,
                oportunidades_creadas: 0,
                tasa_conversacion_oportunidad_pct: 0,
                monto_estimado_total: 0,
              },
            },
            items: Array.isArray(json?.campanas?.items) ? json.campanas.items : [],
            byRule: Array.isArray(json?.frases_whatsapp?.by_rule) ? json.frases_whatsapp.by_rule : [],
          }),
        )
        .catch(() => {
          setPayload({
            summary: {
              campanas: {
                envios_totales: 0,
                envios_enviados: 0,
                envios_entregados: 0,
                envios_respondidos: 0,
                brevo_aperturas: 0,
                brevo_clicks: 0,
                sesiones_utm: 0,
                tasa_entrega_pct: 0,
                tasa_respuesta_pct: 0,
              },
              frases_whatsapp: {
                conversaciones_atribuidas: 0,
                contactos_unicos: 0,
                oportunidades_creadas: 0,
                tasa_conversacion_oportunidad_pct: 0,
                monto_estimado_total: 0,
              },
            },
            items: [],
            byRule: [],
          });
        });
    }, 400);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [dateFrom, dateTo]);

  if (!payload) {
    return <MarketingFallback />;
  }

  return (
    <>
      <SectionTitle label="Marketing · Prospección" />
      <MarketingCards
        summary={payload.summary}
        items={payload.items}
        byRule={payload.byRule}
      />
      <MarketingTimeseriesLazy dateFrom={dateFrom} dateTo={dateTo} />
    </>
  );
}
