"use client";

import * as React from "react";
import { Bar, BarChart, Cell, Pie, PieChart, CartesianGrid, XAxis } from "recharts";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { DemografiaSummaryResponse } from "@/lib/mapa-conversion/api";
import { formatSourceClassLabel } from "@/lib/mapa-conversion/source-class";
import { buildAcquisitionMetrics } from "@/lib/mapa-conversion/acquisition";
import type { VisitsPayload } from "@/lib/visitas/data";
import { cn } from "@/lib/utils";

type Props = {
  summary: DemografiaSummaryResponse | null;
  visitsPayload?: VisitsPayload | null;
  className?: string;
};

const SOURCE_CLASS_CONFIG: ChartConfig = {
  total: { label: "Sesiones", color: "var(--chart-1)" },
  converted: { label: "Convertidas", color: "var(--chart-2)" },
};

const WHATSAPP_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("es-MX").format(value);
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function AcquisitionSummary({ summary, visitsPayload = null, className }: Props) {
  const {
    sourceClassRows,
    referrerRows,
    convertedSessions,
    conversionRate,
    topUtmRows,
    whatsappChannelRows,
  } =
    React.useMemo(() => buildAcquisitionMetrics(summary, visitsPayload), [summary, visitsPayload]);
  return (
    <section className={cn("grid gap-4", className)}>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="h-full">
          <CardHeader>
            <CardTitle>Visitas por tipo de visita</CardTitle>
            <CardDescription>Visitas y contactos agrupados por tipo de visita.</CardDescription>
          </CardHeader>
          <CardContent>
            {sourceClassRows.length ? (
              <ChartContainer config={SOURCE_CLASS_CONFIG} className="h-72">
                <BarChart data={sourceClassRows}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="source"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={12}
                    tickFormatter={(value) => formatSourceClassLabel(String(value))}
                  />
                  <ChartTooltip
                    content={<ChartTooltipContent />}
                    formatter={(value, name) => [
                      formatNumber(toNumber(value)),
                      name === "converted" ? "Convertidas" : "Sesiones",
                    ]}
                  />
                  <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                    {sourceClassRows.map((item) => (
                      <Cell key={item.source} fill={`var(--color-total)`} />
                    ))}
                  </Bar>
                  <Bar dataKey="converted" radius={[6, 6, 0, 0]} fill="var(--color-converted)" />
                </BarChart>
              </ChartContainer>
            ) : (
              <p className="text-muted-foreground text-sm">No hay sesiones web para el filtro actual.</p>
            )}
          </CardContent>
        </Card>

        <Card className="h-full">
          <CardHeader>
            <CardTitle>De dónde llegan las visitas</CardTitle>
            <CardDescription>
              Vista de negocio para entender de dónde entra el tráfico y cómo convierte cada tipo de visita.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <MetricTile
              title="Visitas que terminan en contacto"
              value={formatNumber(convertedSessions)}
              helper="Visitas con contacto vinculado"
            />
            <MetricTile
              title="Porcentaje que convierte"
              value={formatPercent(conversionRate)}
              helper="Proporción de visitas que terminan en contacto"
            />
          </CardContent>
        </Card>

        <Card className="h-full">
          <CardHeader>
            <CardTitle>Sitios que envían visitas</CardTitle>
            <CardDescription>Sitios externos que enviaron tráfico al sitio.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {referrerRows.length ? (
              referrerRows.map((item) => {
                const rate = item.total > 0 ? (item.converted / item.total) * 100 : 0;
                return (
                  <div
                    key={item.host}
                    className="bg-muted/50 flex flex-col gap-2 rounded-lg px-3 py-2 text-sm"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium">{item.host}</span>
                      <Badge variant="outline">{formatNumber(item.total)}</Badge>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                      <span>Convertidas: {formatNumber(item.converted)}</span>
                      <span>{formatPercent(rate)}</span>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-muted-foreground text-sm">No hay sitios externos en este filtro.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,calc(50%-1rem))_minmax(0,1fr)]">
        <Card className="h-full">
          <CardHeader>
            <CardTitle>Promociones y enlaces</CardTitle>
            <CardDescription>Combinaciones de promoción y enlace observadas en el tráfico del sitio.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 min-h-72">
            {topUtmRows.length ? (
              topUtmRows.map((item) => (
                <div
                  key={`${item.utm_source}-${item.utm_medium}-${item.utm_campaign}`}
                  className="bg-muted/50 flex flex-col gap-1 rounded-lg px-3 py-2 text-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">
                      {item.utm_source} / {item.utm_medium} / {item.utm_campaign}
                    </span>
                    <Badge variant="outline">{formatNumber(item.total)}</Badge>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground text-sm">No hay promociones destacadas en este filtro.</p>
            )}
          </CardContent>
        </Card>

        <Card className="h-full">
          <CardHeader>
            <CardTitle>WhatsApp por canal</CardTitle>
            <CardDescription>Distribución de inicios de WhatsApp por canal.</CardDescription>
          </CardHeader>
          <CardContent className="flex min-h-72 flex-col gap-4">
            {whatsappChannelRows.length ? (
              <>
                <ChartContainer
                  config={{
                    total: { label: "Inicios", color: "var(--chart-1)" },
                  }}
                  className="h-56"
                >
                  <PieChart>
                    <ChartTooltip
                      content={<ChartTooltipContent hideLabel />}
                      formatter={(value, name) => [
                        formatNumber(toNumber(value)),
                        typeof name === "string" ? name : "Inicios",
                      ]}
                    />
                    <Pie
                      data={whatsappChannelRows}
                      dataKey="total"
                      nameKey="source"
                      innerRadius={54}
                      outerRadius={88}
                      paddingAngle={2}
                    >
                      {whatsappChannelRows.map((item, index) => (
                        <Cell
                          key={item.source}
                          fill={WHATSAPP_COLORS[index % WHATSAPP_COLORS.length]}
                        />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
                <div className="grid gap-2">
                  {whatsappChannelRows.map((item, index) => (
                    <div key={item.source} className="flex items-center justify-between gap-3 text-sm">
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block size-2.5 rounded-full"
                          style={{ backgroundColor: WHATSAPP_COLORS[index % WHATSAPP_COLORS.length] }}
                        />
                        <span>{item.source}</span>
                      </div>
                      <Badge variant="outline">{formatNumber(item.total)}</Badge>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-muted-foreground text-sm">No hay atribución de WhatsApp en este filtro.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function MetricTile({
  title,
  value,
  helper,
}: {
  title: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="bg-muted/40 rounded-xl border p-4">
      <div className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
        {title}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-muted-foreground mt-1 text-xs">{helper}</div>
    </div>
  );
}
