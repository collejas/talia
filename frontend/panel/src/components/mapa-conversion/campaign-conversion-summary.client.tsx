"use client";

import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type CampaignConversionItem = {
  campana_id: string | null;
  campana_nombre: string;
  canal: string | null;
  envios: number;
  entregados: number;
  conversaciones: number;
  respondieron: number;
  oportunidades: number;
  clientes: number;
  costo_total: number;
  costo_por_oportunidad: number;
  costo_adquisicion: number;
  tasa_entrega_pct: number;
  tasa_respuesta_pct: number;
  tasa_cierre_pct: number;
  pendientes_cobro: number;
};

type CampaignConversionTotals = Omit<CampaignConversionItem, "campana_id" | "campana_nombre" | "canal"> & {
  campanas: number;
};

type CampaignConversionResponse = {
  ok: boolean;
  items?: CampaignConversionItem[];
  totales?: CampaignConversionTotals;
};

type Props = {
  filters: {
    campanaId: string | null;
    campanaTipo: string | null;
    rango: string | null;
    desde: string | null;
    hasta: string | null;
  };
};

const currencyFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

const numberFormatter = new Intl.NumberFormat("es-MX");

function number(value: number | undefined): number {
  const normalized = value ?? 0;
  return Number.isFinite(normalized) ? normalized : 0;
}

function formatNumber(value: number | undefined): string {
  return numberFormatter.format(number(value));
}

function formatCurrency(value: number | undefined): string {
  return currencyFormatter.format(number(value));
}

function formatPercent(value: number | undefined): string {
  return `${number(value).toFixed(1)}%`;
}

function opportunityRate(opportunities: number | undefined, conversations: number | undefined): number {
  const denominator = number(conversations);
  return denominator > 0 ? (number(opportunities) / denominator) * 100 : 0;
}

function Metric({ title, value, helper }: { title: string; value: string; helper: string }) {
  return (
    <div className="rounded-xl border bg-muted/30 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{helper}</div>
    </div>
  );
}

export function CampaignConversionSummary({ filters }: Props) {
  const { campanaId, campanaTipo, rango, desde, hasta } = filters;
  const [data, setData] = React.useState<CampaignConversionResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (campanaId) params.set("campana_id", campanaId);
    if (rango) params.set("rango", rango);
    if (desde) params.set("desde", desde);
    if (hasta) params.set("hasta", hasta);
    params.set("limit", "100");

    setLoading(true);
    setError(null);
    fetch(`/api/crm/mapa-conversion/campaign-conversion?${params.toString()}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`campaign_conversion_${response.status}`);
        return (await response.json()) as CampaignConversionResponse;
      })
      .then(setData)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : "No se pudo cargar el resumen comercial.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [campanaId, rango, desde, hasta]);

  const totals = data?.totales;
  const items = React.useMemo(
    () => (data?.items ?? []).filter((item) => {
      const channel = (campanaTipo || "").trim().toLowerCase();
      return !channel || channel === "todos" || (item.canal || "").toLowerCase() === channel;
    }),
    [campanaTipo, data?.items],
  );
  const visibleTotals = React.useMemo(() => {
    if (!campanaTipo || campanaTipo === "todos") return totals;
    const aggregate = items.reduce(
      (result, item) => {
        result.envios += item.envios;
        result.entregados += item.entregados;
        result.conversaciones += item.conversaciones;
        result.respondieron += item.respondieron;
        result.oportunidades += item.oportunidades;
        result.clientes += item.clientes;
        result.costo_total += item.costo_total;
        result.pendientes_cobro += item.pendientes_cobro;
        return result;
      },
      { campanas: items.length, envios: 0, entregados: 0, conversaciones: 0, respondieron: 0, oportunidades: 0, clientes: 0, costo_total: 0, pendientes_cobro: 0 },
    );
    return {
      ...aggregate,
      costo_por_oportunidad: aggregate.oportunidades ? aggregate.costo_total / aggregate.oportunidades : 0,
      costo_adquisicion: aggregate.clientes ? aggregate.costo_total / aggregate.clientes : 0,
      tasa_entrega_pct: aggregate.envios ? aggregate.entregados / aggregate.envios * 100 : 0,
      tasa_respuesta_pct: aggregate.conversaciones ? aggregate.respondieron / aggregate.conversaciones * 100 : 0,
      tasa_cierre_pct: aggregate.oportunidades ? aggregate.clientes / aggregate.oportunidades * 100 : 0,
    };
  }, [campanaTipo, items, totals]);

  return (
    <section className="space-y-4" aria-labelledby="campaign-conversion-title">
      <div>
        <h2 id="campaign-conversion-title" className="text-lg font-semibold">Resultado comercial de campañas</h2>
        <p className="text-sm text-muted-foreground">
          La conversación es la unidad comercial; los mensajes solo aportan entrega y costo acumulado.
        </p>
      </div>

      {loading ? (
        <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">Cargando indicadores comerciales…</div>
      ) : error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          No se pudo cargar el resumen comercial. {error}
        </div>
      ) : !items.length ? (
        <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
          No hay atribución comercial para el periodo seleccionado.
        </div>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Embudo consolidado</CardTitle>
              <CardDescription>Resultados de las campañas incluidas en los filtros actuales.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
              <Metric title="Enviados" value={formatNumber(visibleTotals?.envios)} helper="Mensajes de campaña" />
              <Metric title="Entregados" value={formatNumber(visibleTotals?.entregados)} helper={formatPercent(visibleTotals?.tasa_entrega_pct)} />
              <Metric
                title="Oportunidades"
                value={formatNumber(visibleTotals?.oportunidades)}
                helper={formatPercent(opportunityRate(visibleTotals?.oportunidades, visibleTotals?.conversaciones))}
              />
              <Metric title="Costo de campaña" value={formatCurrency(visibleTotals?.costo_total)} helper="Gasto acumulado atribuido" />
              <Metric title="CPO" value={formatCurrency(visibleTotals?.costo_por_oportunidad)} helper="Costo por oportunidad" />
              <Metric title="CAC WhatsApp" value={formatCurrency(visibleTotals?.costo_adquisicion)} helper={`${formatNumber(visibleTotals?.clientes)} clientes`} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Detalle por campaña</CardTitle>
              <CardDescription>El costo incluye los cargos de todos los mensajes de cada conversación atribuida.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campaña</TableHead>
                    <TableHead className="text-right">Enviados</TableHead>
                    <TableHead className="text-right">Entregados</TableHead>
                    <TableHead className="text-right">Oportunidades</TableHead>
                    <TableHead className="text-right">Clientes</TableHead>
                    <TableHead className="text-right">Costo</TableHead>
                    <TableHead className="text-right">CPO</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.campana_id || item.campana_nombre}>
                      <TableCell className="min-w-48 font-medium">
                        <div>{item.campana_nombre}</div>
                        <div className="text-xs text-muted-foreground">{item.canal || "WhatsApp"}</div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(item.envios)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(item.entregados)} · {formatPercent(item.tasa_entrega_pct)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(item.oportunidades)} · {formatPercent(opportunityRate(item.oportunidades, item.conversaciones))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(item.clientes)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(item.costo_total)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(item.costo_por_oportunidad)}</TableCell>
                      <TableCell>
                        {item.pendientes_cobro > 0 ? (
                          <Badge variant="outline">{formatNumber(item.pendientes_cobro)} pendientes</Badge>
                        ) : (
                          <Badge variant="secondary">Conciliado</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </section>
  );
}
