"use client";

import {
  IconChartArrowsVertical,
  IconMap,
  IconMessageCircle,
  IconUserExclamation,
} from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { DemografiaData } from "@/lib/mapa-conversion/api";

type ConversionKpiCardsProps = {
  data: DemografiaData;
};

function formatNumber(value: number | null | undefined): string {
  if (!value) return "0";
  return new Intl.NumberFormat("es-MX").format(value);
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0%";
  return `${value.toFixed(1)}%`;
}

export function ConversionKpiCards({ data }: ConversionKpiCardsProps) {
  const visitantesTotals = data.summary.visitantes.totals;
  const leadsTotals = data.summary.leads.totals;
  const leadsByChannel = data.summary.leads.totals_by_channel || {};
  const webchatTotals = leadsByChannel["webchat"] || { total: 0 };
  const whatsappTotals = leadsByChannel["whatsapp"] || { total: 0 };

  const conversionRate =
    visitantesTotals.con_chat > 0
      ? (webchatTotals.total ?? 0) / visitantesTotals.con_chat * 100
      : 0;

  const topUbicacion = data.map.dataset[0];

  return (
    <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Visitantes webchat sin chat</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(visitantesTotals.sin_chat)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconUserExclamation className="size-4" />
              Total webchat: {formatNumber(visitantesTotals.total)}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Sesiones cerradas sin mensajes <IconUserExclamation className="size-4" />
          </div>
          <div className="text-muted-foreground">
            Incluye todas las sesiones capturadas por IP.
          </div>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Leads webchat</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(webchatTotals.total)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconChartArrowsVertical className="size-4" />
              Conversión: {formatPercent(conversionRate)}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            {formatNumber(visitantesTotals.con_chat)} chats con interacción
            <IconChartArrowsVertical className="size-4" />
          </div>
          <div className="text-muted-foreground">
            Conversaciones que abrieron lead en el embudo.
          </div>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Leads WhatsApp / Voz</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(whatsappTotals.total)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconMessageCircle className="size-4" />
              Leads totales: {formatNumber(leadsTotals.total)}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Etapas activas {formatNumber(leadsTotals.abiertas ?? 0)}{" "}
            <IconMessageCircle className="size-4" />
          </div>
          <div className="text-muted-foreground">
            Incluye leads capturados por telefonía y mensajería.
          </div>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Top ubicación</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {topUbicacion ? formatNumber(topUbicacion.leads_total) : "—"}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconMap className="size-4" />
              {topUbicacion?.name ?? "Sin datos"}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Visitantes: {formatNumber(topUbicacion?.visitantes_total ?? 0)}
            <IconMap className="size-4" />
          </div>
          <div className="text-muted-foreground">
            Ubicación con mayor volumen de leads y visitantes.
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
