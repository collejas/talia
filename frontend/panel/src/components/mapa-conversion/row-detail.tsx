"use client";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  XAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Separator } from "@/components/ui/separator";
import type { DataTableRow } from "@/components/data-table";
import type { DemografiaSummaryResponse } from "@/lib/mapa-conversion/api";

type Props = {
  row: DataTableRow;
  nivel: "pais" | "estado" | "municipio";
  summary: DemografiaSummaryResponse | null;
};

type Segment = {
  canal: string;
  etapa: string;
  total: number;
};

const CHANNEL_CONFIG: ChartConfig = {
  webchat: { label: "Webchat", color: "hsl(var(--chart-1))" },
  whatsapp: { label: "WhatsApp", color: "hsl(var(--chart-2))" },
  voz: { label: "Voz", color: "hsl(var(--chart-3))" },
};

const STAGE_CONFIG: ChartConfig = {
  captado: { label: "Captado", color: "hsl(var(--chart-1))" },
  precalificado: { label: "Precalificado", color: "hsl(var(--chart-2))" },
  negociacion: { label: "Negociación", color: "hsl(var(--chart-3))" },
  ganado: { label: "Ganado", color: "hsl(var(--chart-4))" },
  perdido: { label: "Perdido", color: "hsl(var(--chart-5))" },
};

const STAGE_ORDER: Array<keyof typeof STAGE_CONFIG> = [
  "captado",
  "precalificado",
  "negociacion",
  "ganado",
  "perdido",
];

function sanitizeNumber(value: unknown): number {
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

export function MapaConversionRowDetail({ row, nivel, summary }: Props) {
  const entry = (row.raw ?? {}) as Record<string, unknown>;

  const name = typeof entry.name === "string" ? entry.name : row.header;
  const key = typeof entry.key === "string" ? entry.key : row.id.toString();
  const totalesPorCanal = (entry.totales_por_canal as Record<string, unknown>) ?? {};
  const etapasTotales = (entry.etapas_totales as Record<string, unknown>) ?? {};
  const conversacionTotales = (entry.conversacion_totales as Record<string, unknown>) ?? {};
  const metrics = (entry.metrics as Record<string, unknown>) ?? {};
  const canalMeta = (entry.canal_meta as Record<string, unknown>) ?? {};
  const trafficWeb = (entry.traffic_web as Record<string, unknown>) ?? {};

  const totalVisitas = sanitizeNumber(metrics.visitantes_total ?? entry.total_visitas);
  const leadsTotal = sanitizeNumber(metrics.leads_total ?? entry.leads_total);
  const visitasConChat = sanitizeNumber(
    metrics.visitantes_con_chat ?? conversacionTotales.con_conversacion ?? entry.visitantes_con_chat,
  );
  const visitasSinChat = sanitizeNumber(
    metrics.visitantes_sin_chat ?? conversacionTotales.sin_conversacion ?? entry.visitantes_sin_chat,
  );
  const conversion = totalVisitas > 0 ? (leadsTotal / totalVisitas) * 100 : 0;
  const chatRate = totalVisitas > 0 ? (visitasConChat / totalVisitas) * 100 : 0;

  const channelData = (["webchat", "whatsapp", "voz"] as const).map((channel) => ({
    channel,
    label: CHANNEL_CONFIG[channel]?.label ?? channel,
    total: sanitizeNumber(totalesPorCanal[channel]),
  }));

  const stageData = STAGE_ORDER.map((stage) => ({
    stage,
    label: STAGE_CONFIG[stage]?.label ?? stage,
    total: sanitizeNumber(etapasTotales[stage]),
  }));

  const conversationData = [
    { label: "Con conversación", value: visitasConChat },
    { label: "Sin conversación", value: visitasSinChat },
  ];

  const topSegments: Segment[] = (summary?.leads?.rows ?? [])
    .filter((segment) => segment.key === key)
    .map((segment) => ({
      canal: segment.canal,
      etapa: segment.etapa_codigo,
      total: sanitizeNumber(segment.total),
    }))
    .filter((segment) => segment.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const principalChannel = typeof canalMeta.principal === "string"
    ? canalMeta.principal
    : channelData.find((item) => item.total > 0)?.channel ?? "webchat";

  const detailLevel =
    nivel === "pais" ? "Estado"
    : nivel === "estado" ? "Municipio"
    : "Ubicación";

  return (
    <div className="flex flex-col gap-6 py-2">
      <section className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{detailLevel}</Badge>
          <Badge>{formatLabel(principalChannel)}</Badge>
        </div>
        <h3 className="text-foreground text-lg font-semibold leading-tight">
          {name}
        </h3>
        <p className="text-muted-foreground text-sm">
          Totales combinados de visitantes, leads y etapas para esta ubicación.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <MetricCard
          title="Visitas totales"
          value={formatNumber(totalVisitas)}
          description={`Con chat: ${formatNumber(visitasConChat)} (${chatRate.toFixed(1)} %)` }
        />
        <MetricCard
          title="Leads totales"
          value={formatNumber(leadsTotal)}
          description={`Conversión sobre visitas: ${conversion.toFixed(1)} %`}
        />
        <MetricCard
          title="Chat sin respuesta"
          value={formatNumber(visitasSinChat)}
          description="Visitantes que no recibieron conversación"
        />
        <MetricCard
          title="Canal principal"
          value={formatLabel(principalChannel)}
          description="Fuente con mayor participación"
        />
        <MetricCard
          title="Sesiones web"
          value={formatNumber(sanitizeNumber(trafficWeb.sesiones_web_total))}
          description="Tráfico web first-party"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Distribución por canal</CardTitle>
            <CardDescription>Volumen total por origen</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={CHANNEL_CONFIG} className="h-64">
              <BarChart data={channelData}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={12}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                  {channelData.map((item) => (
                    <Cell key={item.channel} fill={`var(--color-${item.channel})`} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Embudo por etapa</CardTitle>
            <CardDescription>Progresión de leads en pipeline</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={STAGE_CONFIG} className="h-64">
              <AreaChart data={stageData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={12}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  dataKey="total"
                  type="monotone"
                  stroke="var(--color-captado)"
                  fill="var(--color-captado)"
                  fillOpacity={0.35}
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-3">
        <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Conversaciones
        </h4>
        <div className="grid gap-2">
          {conversationData.map((item) => (
            <div key={item.label} className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{item.label}</span>
                <span className="font-medium">{formatNumber(item.value)}</span>
              </div>
              <div className="bg-muted relative h-2 overflow-hidden rounded-full">
                <div
                  className="bg-primary absolute left-0 top-0 h-full rounded-full"
                  style={{
                    width: totalVisitas > 0 ? `${Math.min(100, (item.value / totalVisitas) * 100)}%` : "0%",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-3">
        <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Atribución web
        </h4>
        <div className="grid gap-2">
          {(Array.isArray(trafficWeb.fuentes_top) ? trafficWeb.fuentes_top : []).length ? (
            (trafficWeb.fuentes_top as Array<Record<string, unknown>>).slice(0, 5).map((source, index) => (
              <div
                key={`source-${index}`}
                className="bg-muted/50 flex items-center justify-between rounded-lg px-3 py-2 text-sm"
              >
                <span className="text-muted-foreground">
                  {formatLabel(typeof source.source === "string" ? source.source : "desconocido")}
                </span>
                <span className="font-medium">{formatNumber(sanitizeNumber(source.total))}</span>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground text-sm">Sin fuentes top en este filtro.</p>
          )}
        </div>
        <div className="grid gap-2">
          {(Array.isArray(trafficWeb.utm_top) ? trafficWeb.utm_top : []).length ? (
            (trafficWeb.utm_top as Array<Record<string, unknown>>).slice(0, 5).map((utm, index) => (
              <div
                key={`utm-${index}`}
                className="bg-muted/50 flex items-center justify-between rounded-lg px-3 py-2 text-sm"
              >
                <span className="text-muted-foreground">
                  {`${typeof utm.utm_source === "string" ? utm.utm_source : "(none)"} / ${
                    typeof utm.utm_medium === "string" ? utm.utm_medium : "(none)"
                  } / ${typeof utm.utm_campaign === "string" ? utm.utm_campaign : "(none)"}`}
                </span>
                <span className="font-medium">{formatNumber(sanitizeNumber(utm.total))}</span>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground text-sm">Sin UTM top en este filtro.</p>
          )}
        </div>
      </section>

      <section className="grid gap-3">
        <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Principales segmentos
        </h4>
        <div className="grid gap-2">
          {topSegments.length ? (
            topSegments.map((segment, index) => (
              <div
                key={`${segment.canal}-${segment.etapa}-${index}`}
                className="bg-muted/50 flex items-center justify-between rounded-lg px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{formatLabel(segment.canal)}</Badge>
                  <span className="text-muted-foreground capitalize">
                    {segment.etapa || "sin etapa"}
                  </span>
                </div>
                <span className="font-medium">
                  {formatNumber(segment.total)}
                </span>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground text-sm">
              No hay segmentos detallados en esta ubicación.
            </p>
          )}
        </div>
      </section>

      <Separator />

      <section className="grid gap-3">
        <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Resumen ejecutivo
        </h4>
        <ul className="text-muted-foreground grid gap-2 text-sm">
          <li>
            • El canal principal es <strong className="text-foreground">{formatLabel(principalChannel)}</strong> con {formatNumber(
              channelData.find((item) => item.channel === principalChannel)?.total ?? 0,
            )} interacciones totales.
          </li>
          <li>
            • El embudo concentra {formatNumber(sanitizeNumber(etapasTotales.captado))} leads en{" "}
            <strong className="text-foreground">Captado</strong> y {formatNumber(sanitizeNumber(etapasTotales.negociacion))} en{" "}
            <strong className="text-foreground">Negociación</strong>.
          </li>
          <li>
            • La tasa de chat activo es {chatRate.toFixed(1)} %, con {formatNumber(visitasSinChat)} visitantes aún sin conversación.
          </li>
        </ul>
      </section>
    </div>
  );
}

function MetricCard({
  title,
  value,
  description,
}: {
  title: string;
  value: string;
  description?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-muted-foreground text-sm font-medium">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <span className="text-2xl font-semibold tracking-tight">{value}</span>
        {description ? (
          <CardDescription>{description}</CardDescription>
        ) : null}
      </CardContent>
    </Card>
  );
}

function formatLabel(value: string | null | undefined): string {
  if (!value) return "Sin canal";
  const normalized = value.replace(/_/g, " ").trim();
  if (!normalized.length) return "Sin canal";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}
