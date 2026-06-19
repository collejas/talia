"use client";

import * as React from "react";
import { Bar, BarChart, Cell, LabelList, Pie, PieChart, CartesianGrid, XAxis } from "recharts";

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

const SOURCE_CLASS_COLORS: Record<string, string> = {
  ai_referral: "var(--chart-1)",
  campaign: "var(--chart-3)",
  direct: "var(--chart-4)",
  organic_search: "var(--chart-5)",
  organic_social: "#14b8a6",
  referral: "#f97316",
  unknown: "#94a3b8",
};

const CONVERTED_COLOR = "#16a34a";

function getSourceClassColor(value: string): string {
  const normalized = value.trim().toLowerCase();
  return SOURCE_CLASS_COLORS[normalized] ?? "#8b5cf6";
}

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

function renderBarValueLabel(props: {
  x?: number;
  y?: number;
  width?: number;
  value?: number | string;
}) {
  const { x, y, width, value } = props;
  const numericValue = toNumber(value);

  if (!Number.isFinite(numericValue) || numericValue <= 0) return null;
  if (typeof x !== "number" || typeof y !== "number" || typeof width !== "number") return null;

  return (
    <text
      x={x + width / 2}
      y={Math.max(y - 5, 11)}
      fill="hsl(var(--muted-foreground))"
      fontSize={10}
      fontWeight={500}
      textAnchor="middle"
      className="tabular-nums"
    >
      {formatNumber(numericValue)}
    </text>
  );
}

export function AcquisitionSummary({ summary, visitsPayload = null, className }: Props) {
  const {
    sourceClassRows,
    referrerRows,
    totalSessions,
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
          <CardContent className="flex h-full flex-col">
            {sourceClassRows.length ? (
              <div className="flex flex-1 flex-col">
                <ChartContainer config={SOURCE_CLASS_CONFIG} className="min-h-[360px] flex-1">
                  <BarChart data={sourceClassRows} margin={{ top: 38, right: 8, left: 0, bottom: 0 }}>
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
                      labelFormatter={(value) => formatSourceClassLabel(String(value))}
                      formatter={(value, name, item) => {
                        const isConverted = name === "converted";
                        const sourceName = String(item?.payload?.source || "");
                        const swatchColor = isConverted ? CONVERTED_COLOR : getSourceClassColor(sourceName);
                        const label = isConverted ? "Convertidas" : "Sesiones";
                        return (
                          <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-2">
                              <span
                                className="shrink-0 rounded-[2px]"
                                style={{
                                  backgroundColor: swatchColor,
                                  width: 10,
                                  height: 10,
                                }}
                              />
                              <span className="text-muted-foreground">{label}</span>
                            </div>
                            <span className="font-mono font-medium tabular-nums text-foreground">
                              {formatNumber(toNumber(value))}
                            </span>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                      {sourceClassRows.map((item) => (
                        <Cell key={item.source} fill={getSourceClassColor(item.source)} />
                      ))}
                      <LabelList content={renderBarValueLabel} />
                    </Bar>
                    <Bar dataKey="converted" radius={[6, 6, 0, 0]} fill={CONVERTED_COLOR}>
                      <LabelList content={renderBarValueLabel} />
                    </Bar>
                  </BarChart>
                </ChartContainer>
                <div className="mt-3 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <span
                    className="h-2.5 w-2.5 rounded-[2px]"
                    style={{ backgroundColor: CONVERTED_COLOR }}
                    aria-hidden="true"
                  />
                  <span>Verde = Vistas Convertidas</span>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">No hay sesiones web para el filtro actual.</p>
            )}
          </CardContent>
        </Card>

        <Card className="h-full">
          <CardHeader>
            <CardTitle>Volumen y conversión de visitas</CardTitle>
            <CardDescription>Resumen del volumen total de visitas.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <MetricTile
              title="Visitas totales"
              value={formatNumber(totalSessions)}
              helper="Total de visitas registradas en el filtro"
            />
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
          <CardContent className="grid min-w-0 gap-2">
            {referrerRows.length ? (
              referrerRows.map((item) => {
                const rate = item.total > 0 ? (item.converted / item.total) * 100 : 0;
                return (
                  <div
                    key={item.host}
                    className="bg-muted/50 flex min-w-0 flex-col gap-2 rounded-lg px-3 py-2 text-sm"
                  >
                    <div className="flex min-w-0 items-center justify-between gap-3">
                      <span className="min-w-0 flex-1 truncate font-medium" title={item.host}>
                        {item.host}
                      </span>
                      <Badge className="shrink-0" variant="outline">
                        {formatNumber(item.total)}
                      </Badge>
                    </div>
                    <div className="flex min-w-0 items-center justify-between gap-3 text-xs text-muted-foreground">
                      <span className="min-w-0 truncate">
                        Convertidas: {formatNumber(item.converted)}
                      </span>
                      <span className="shrink-0 tabular-nums">{formatPercent(rate)}</span>
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
                    <div
                      key={item.source}
                      className="flex min-w-0 items-center justify-between gap-3 text-sm"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="inline-block size-2.5 rounded-full"
                          style={{ backgroundColor: WHATSAPP_COLORS[index % WHATSAPP_COLORS.length] }}
                        />
                        <span className="min-w-0 truncate" title={item.source}>
                          {item.source}
                        </span>
                      </div>
                      <Badge className="shrink-0" variant="outline">
                        {formatNumber(item.total)}
                      </Badge>
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
