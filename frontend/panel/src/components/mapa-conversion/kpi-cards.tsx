"use client";

import {
  IconChartArrowsVertical,
  IconMap,
  IconMessageCircle,
  IconUserExclamation,
} from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { MapaConversionKpis } from "@/lib/mapa-conversion/data";

type ConversionKpiCardsProps = {
  data: MapaConversionKpis;
};

export function ConversionKpiCards({ data }: ConversionKpiCardsProps) {
  const {
    visitantesSinChat,
    totalVisitasWebchat,
    whatsappGeolocalizados,
    webchatChats,
    webchatLeads,
    webchatConversionRate,
    topEstado,
    topMunicipio,
  } = data;

  return (
    <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Visitantes sin chat (30 días)</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(visitantesSinChat)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconUserExclamation className="size-4" />
              Total webchat: {formatNumber(totalVisitasWebchat)}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Sesiones cerradas sin mensajes <IconUserExclamation className="size-4" />
          </div>
          <div className="text-muted-foreground">
            Fuente: `embudo_visitantes_contador` y <code>webchat_session_closures</code>.
          </div>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Leads WhatsApp geolocalizados</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(whatsappGeolocalizados)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconMap className="size-4" />
              {topEstado?.nombre ?? "Sin estado destacado"}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Catálogo LADA &amp; {`panel_leads_geo_*`} <IconMap className="size-4" />
          </div>
          <div className="text-muted-foreground">
            Estado líder: {topEstado ? `${topEstado.nombre ?? topEstado.code} (${formatNumber(topEstado.total)})` : "—"}
          </div>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Conversión webchat → lead</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatPercent(webchatConversionRate)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconChartArrowsVertical className="size-4" />
              Leads: {formatNumber(webchatLeads)}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            {formatNumber(webchatChats)} chats con interacción <IconChartArrowsVertical className="size-4" />
          </div>
          <div className="text-muted-foreground">
            Leads medidos en <code>panel_leads_geo_estados(p_canales = &apos;webchat&apos;)</code>.
          </div>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Top municipio WhatsApp</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {topMunicipio ? formatNumber(topMunicipio.total) : "—"}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconMessageCircle className="size-4" />
              {topMunicipio?.nombre ?? "Sin datos"}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Municipio clave {topMunicipio?.cvegeo ?? "—"} <IconMessageCircle className="size-4" />
          </div>
          <div className="text-muted-foreground">
            Datos provenientes de `panel_leads_geo_municipios`.
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}

function formatNumber(value: number | null | undefined): string {
  if (!value) return "0";
  return new Intl.NumberFormat("es-MX").format(value);
}

function formatPercent(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "0%";
  return `${value.toFixed(1)}%`;
}
