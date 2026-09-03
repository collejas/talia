"use client";

import * as React from "react";
import { Bar, BarChart, Cell, LabelList, Pie, PieChart, CartesianGrid, XAxis, YAxis } from "recharts";

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
import { formatAcquisitionSourceLabel, formatSourceClassLabel } from "@/lib/mapa-conversion/source-class";
import { buildAcquisitionMetrics, type AcquisitionUtmBucket } from "@/lib/mapa-conversion/acquisition";
import type { VisitsPayload } from "@/lib/visitas/data";
import { cn } from "@/lib/utils";

type Props = {
  summary: DemografiaSummaryResponse | null;
  visitsPayload?: VisitsPayload | null;
  className?: string;
  mode?: "overview" | "traffic" | "conversations" | "campaigns";
};

const SOURCE_CLASS_CONFIG: ChartConfig = {
  total: { label: "Sesiones", color: "var(--chart-1)" },
  converted: { label: "Con contacto", color: "var(--chart-2)" },
};

const REFERRER_CONFIG: ChartConfig = {
  total: { label: "Sesiones", color: "var(--chart-1)" },
  converted: { label: "Con contacto", color: "#16a34a" },
};

const WHATSAPP_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

const EMAIL_CAMPAIGN_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "#0f766e",
  "#b45309",
  "#be123c",
  "#4338ca",
  "#475569",
];

const WHATSAPP_CAMPAIGN_COLORS = [
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-1)",
  "#15803d",
  "#c2410c",
  "#0369a1",
  "#be123c",
  "#334155",
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
const UTM_VALUE_LABELS: Record<string, string> = {
  "(none)": "Sin dato",
  prospeccion: "Prospección",
  "chatgpt.com": "ChatGPT",
  cold_outreach: "Prospección fría",
  whatsapp_cta: "CTA de WhatsApp",
  whatsapp_media: "WhatsApp",
  email_image: "Email",
};

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

function truncateLabel(value: string, max = 26): string {
  if (!value) return "Sin dato";
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

type ConversionRankingRow = {
  value: string;
  label: string;
  canal: string | null;
  parentCampaignValue: string | null;
  parentCampaignLabel: string | null;
  total: number;
  contextTotal: number;
  conversionLabel: string;
  contextLabel: string;
  rate: number;
};

type EmailCampaignPieRow = {
  value: string;
  label: string;
  total: number;
  fill: string;
};

function buildCampaignColorMap(rows: ConversionRankingRow[]) {
  return buildCampaignColorMapWithPalette(rows, EMAIL_CAMPAIGN_COLORS);
}

function buildCampaignColorMapWithPalette(rows: ConversionRankingRow[], palette: string[]) {
  const colorMap = new Map<string, string>();
  let colorIndex = 0;
  for (const row of rows) {
    const key = row.value || row.label;
    if (!key || colorMap.has(key)) continue;
    colorMap.set(key, palette[colorIndex % palette.length]);
    colorIndex += 1;
  }
  return colorMap;
}

function EmailCampaignPieCard({
  data,
  colorMap,
  title,
  description,
  emptyMessage,
  metricLabel,
  legendSide = "right",
}: {
  data: ConversionRankingRow[];
  colorMap: Map<string, string>;
  title: string;
  description: string;
  emptyMessage: string;
  metricLabel: string;
  legendSide?: "left" | "right";
}) {
  const pieData = data.map((row) => ({
    value: row.value || row.label,
    label: row.label,
    total: row.total,
    fill: colorMap.get(row.value || row.label) || EMAIL_CAMPAIGN_COLORS[0],
  })) satisfies EmailCampaignPieRow[];
  const totalSum = pieData.reduce((acc, item) => acc + item.total, 0);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {pieData.length ? (
          <>
            <div
              className={[
                "grid gap-4 lg:items-center",
                legendSide === "left"
                  ? "lg:grid-cols-[minmax(180px,0.65fr)_minmax(0,1.35fr)]"
                  : "lg:grid-cols-[minmax(0,1.35fr)_minmax(180px,0.65fr)]",
              ].join(" ")}
            >
              <div
                className={[
                  "grid content-start gap-2",
                  legendSide === "left" ? "lg:order-1" : "lg:order-2",
                ].join(" ")}
              >
                {pieData.map((item) => (
                  <div key={item.value} className="flex items-center justify-between gap-3 text-sm">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: item.fill }} />
                      <span className="min-w-0 truncate" title={item.label}>
                        {item.label}
                      </span>
                    </div>
                    <Badge className="shrink-0" variant="outline">
                      {formatNumber(item.total)}
                    </Badge>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-3 pt-1 text-sm font-semibold">
                  <span>Total</span>
                  <Badge className="shrink-0" variant="outline">
                    {formatNumber(totalSum)}
                  </Badge>
                </div>
              </div>
              <div
                className={[
                  "flex items-center justify-center",
                  legendSide === "left" ? "lg:order-2" : "lg:order-1",
                ].join(" ")}
              >
                <ChartContainer
                  config={{ total: { label: metricLabel, color: "var(--chart-1)" } }}
                  className="h-72 w-full max-w-[420px]"
                >
                  <PieChart>
                    <ChartTooltip
                      content={<ChartTooltipContent hideLabel />}
                      formatter={(value, _name, item) => [
                        `${formatNumber(toNumber(value))} ${metricLabel.toLowerCase()}`,
                        String(item?.payload?.label || "Campaña"),
                      ]}
                    />
                    <Pie
                      data={pieData}
                      dataKey="total"
                      nameKey="label"
                      outerRadius={96}
                      paddingAngle={0}
                    >
                      {pieData.map((item) => (
                        <Cell key={item.value} fill={item.fill} />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        )}
      </CardContent>
    </Card>
  );
}

function EmailTemplateAttributionCard({
  data,
  colorMap,
  title,
  description,
  emptyMessage,
  metricLabel,
}: {
  data: ConversionRankingRow[];
  colorMap: Map<string, string>;
  title: string;
  description: string;
  emptyMessage: string;
  metricLabel: string;
}) {
  const chartHeight = Math.max(320, data.length * 48);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length ? (
          <ChartContainer
            config={{ total: { label: metricLabel, color: "var(--chart-1)" } }}
            className="w-full"
            style={{ height: `${chartHeight}px` }}
          >
            <BarChart data={data} margin={{ left: 12, right: 16 }} barSize={22} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" hide domain={[0, "auto"]} />
              <YAxis
                dataKey="label"
                type="category"
                width={200}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value: string) => truncateLabel(value, 30)}
              />
              <ChartTooltip
                cursor={{ fill: "hsl(var(--muted))" }}
                content={<ChartTooltipContent />}
                formatter={(value, _name, item) => {
                  const payload = item.payload as ConversionRankingRow;
                  return [
                    `${formatNumber(Number(value ?? 0))} ${metricLabel.toLowerCase()} · Campaña ${payload.parentCampaignLabel || "Sin campaña"}`,
                    metricLabel,
                  ];
                }}
                labelFormatter={(_, payload) => {
                  const item = payload?.[0]?.payload as ConversionRankingRow | undefined;
                  return item?.label || "Plantilla";
                }}
              />
              <Bar dataKey="total" name={metricLabel} radius={[0, 4, 4, 0]}>
                {data.map((item) => (
                  <Cell
                    key={`${item.parentCampaignValue || item.parentCampaignLabel || "sin-campana"}::${item.value}`}
                    fill={
                      colorMap.get(item.parentCampaignValue || item.parentCampaignLabel || "") ||
                      EMAIL_CAMPAIGN_COLORS[0]
                    }
                  />
                ))}
                <LabelList
                  dataKey="total"
                  position="right"
                  formatter={(value: number) => `${Number(value ?? 0)}`}
                  className="fill-muted-foreground text-[11px]"
                />
              </Bar>
            </BarChart>
          </ChartContainer>
        ) : (
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        )}
      </CardContent>
    </Card>
  );
}

function ReferrerPieCard({
  rows,
}: {
  rows: Array<{ host: string; total: number; converted: number }>;
}) {
  const colors = [
    "var(--chart-1)",
    "var(--chart-2)",
    "var(--chart-3)",
    "var(--chart-4)",
    "var(--chart-5)",
    "#0f766e",
    "#b45309",
    "#be123c",
    "#4338ca",
    "#475569",
  ];
  const data = rows.map((row, index) => ({
    ...row,
    fill: colors[index % colors.length],
  }));

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Referencias externas</CardTitle>
        <CardDescription>Hosts reales que enlazaron al sitio; incluye buscadores y asistentes digitales.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-[minmax(220px,0.9fr)_minmax(0,1.1fr)] lg:items-center">
        <ChartContainer config={REFERRER_CONFIG} className="h-52 w-full">
          <PieChart>
            <ChartTooltip
              content={<ChartTooltipContent hideLabel />}
              formatter={(value, _name, item) => {
                const payload = item?.payload as (typeof data)[number] | undefined;
                return [
                  `${formatNumber(toNumber(value))} sesiones · ${formatNumber(payload?.converted ?? 0)} con contacto`,
                  payload?.host || "Sitio remitente",
                ];
              }}
            />
            <Pie data={data} dataKey="total" nameKey="host" innerRadius={42} outerRadius={76} paddingAngle={1}>
              {data.map((item) => <Cell key={item.host} fill={item.fill} />)}
            </Pie>
          </PieChart>
        </ChartContainer>
        <div className="grid max-h-52 gap-2 overflow-y-auto pr-1">
          {data.map((item) => (
            <div key={item.host} className="flex min-w-0 items-center justify-between gap-3 text-sm">
              <div className="flex min-w-0 items-center gap-2">
                <span className="inline-block size-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.fill }} />
                <span className="min-w-0 truncate" title={item.host}>{item.host}</span>
              </div>
              <Badge className="shrink-0" variant="outline">{formatNumber(item.total)}</Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function TrafficAttributionCard({
  rows,
  campaignLabels,
}: {
  rows: AcquisitionUtmBucket[];
  campaignLabels: Map<string, string>;
}) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Atribución: fuente, medio y campaña</CardTitle>
        <CardDescription>No es un dominio remitente: explica las etiquetas con las que se identificó el tráfico.</CardDescription>
      </CardHeader>
      <CardContent className="grid max-h-[32rem] min-h-72 gap-2 overflow-y-auto pr-2">
        {rows.length ? rows.map((item) => (
          <div key={`${item.utm_source}-${item.utm_medium}-${item.utm_campaign}`} className="bg-muted/50 flex flex-col gap-2 rounded-lg px-3 py-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 flex-1 flex-wrap gap-x-4 gap-y-2">
                {(["utm_source", "utm_medium", "utm_campaign"] as const).map((field) => (
                  <div key={field} className="flex min-w-0 flex-col">
                    <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{formatUtmFieldLabel(field)}</span>
                    <span className="min-w-0 font-medium">
                      {formatUtmValue(item[field], campaignLabels)}
                    </span>
                  </div>
                ))}
              </div>
              <Badge variant="outline">{formatNumber(item.total)}</Badge>
            </div>
          </div>
        )) : <p className="text-muted-foreground text-sm">No hay fuentes ni campañas destacadas en este filtro.</p>}
      </CardContent>
    </Card>
  );
}

function normalizeLookupKey(value: string): string {
  const normalized = value.trim().toLowerCase();
  return normalized.replace(/[\s_-]+/g, "");
}

function formatUtmValue(
  value: string,
  campaignLabels: Map<string, string> | null,
): string {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "Sin dato";

  const acquisitionSourceLabel = formatAcquisitionSourceLabel(value);
  if (acquisitionSourceLabel === "GobMX") return acquisitionSourceLabel;

  const campaignLabel =
    campaignLabels?.get(normalizeLookupKey(normalized)) ??
    campaignLabels?.get(normalized) ??
    campaignLabels?.get(value.trim());
  if (campaignLabel) return campaignLabel;

  return UTM_VALUE_LABELS[normalized] ?? normalized.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatUtmFieldLabel(value: "utm_source" | "utm_medium" | "utm_campaign"): string {
  if (value === "utm_source") return "Fuente";
  if (value === "utm_medium") return "Medio";
  return "Campaña";
}

function renderBarValueLabel(props: {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  value?: number | string;
}) {
  const { x, y, width, value } = props;
  const numericValue = toNumber(value);
  const numericX = toNumber(x);
  const numericY = toNumber(y);
  const numericWidth = toNumber(width);

  if (!Number.isFinite(numericValue) || numericValue <= 0) return null;
  if (!Number.isFinite(numericX) || !Number.isFinite(numericY) || !Number.isFinite(numericWidth)) {
    return null;
  }

  return (
    <text
      x={numericX + numericWidth / 2}
      y={Math.max(numericY - 5, 11)}
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

export function AcquisitionSummary({
  summary,
  visitsPayload = null,
  className,
  mode = "overview",
}: Props) {
  const hasDetailedVisits = visitsPayload !== null;
  const hasContactSummary = Boolean(summary?.traffic_contact_metrics);
  const campaignLabels = React.useMemo(() => {
    const labels = new Map<string, string>();
    const fromCatalog = summary?.attribution_catalog?.utm_campaign_labels ?? {};
    for (const [key, label] of Object.entries(fromCatalog)) {
      const normalizedKey = normalizeLookupKey(key);
      if (!normalizedKey) continue;
      labels.set(normalizedKey, label);
      labels.set(key.trim().toLowerCase(), label);
      labels.set(key.trim(), label);
    }
    for (const option of summary?.attribution_catalog?.campana_options ?? []) {
      const value = String(option?.value || "").trim();
      const label = String(option?.label || "").trim();
      if (!value || !label) continue;
      labels.set(normalizeLookupKey(value), label);
      labels.set(value.toLowerCase(), label);
      labels.set(value, label);
    }
    return labels;
  }, [summary]);

  const {
    sourceClassRows,
    referrerRows,
    totalSessions,
    sessionsWithContact,
    uniqueContacts,
    conversionRate,
    topUtmRows,
    correoCampaignRows,
    correoTemplateRows,
    whatsappChannelRows,
    campaignConversionRows,
    templateConversionRows,
  } =
    React.useMemo(
      () => buildAcquisitionMetrics(summary, visitsPayload),
      [summary, visitsPayload],
    );
  const whatsappCampaignConversionRows = campaignConversionRows.filter((item) => item.canal === "whatsapp");
  const whatsappTemplateConversionRows = templateConversionRows.filter((item) => item.canal === "whatsapp");
  const correoCampaignColorMap = React.useMemo(
    () => buildCampaignColorMap(correoCampaignRows),
    [correoCampaignRows],
  );
  const whatsappCampaignColorMap = React.useMemo(
    () => buildCampaignColorMapWithPalette(whatsappCampaignConversionRows, WHATSAPP_CAMPAIGN_COLORS),
    [whatsappCampaignConversionRows],
  );
  const conversationTotals = summary?.visitantes?.totals;
  const emailVisitsTotal = correoCampaignRows.reduce((total, row) => total + row.total, 0);
  const whatsappOpportunitiesTotal = whatsappCampaignConversionRows.reduce(
    (total, row) => total + row.total,
    0,
  );
  const webSessionsTrend = summary?.web_sessions_trend;
  const trendComparisonLabel = webSessionsTrend?.comparable
    ? webSessionsTrend.delta_pct === null
      ? webSessionsTrend.current > 0
        ? "Nuevo tráfico"
        : "Sin variación"
      : `${webSessionsTrend.delta_pct >= 0 ? "+" : ""}${formatPercent(webSessionsTrend.delta_pct)}`
    : "Sin comparación";
  const trendDirectionLabel =
    webSessionsTrend?.direction === "up"
      ? "Aumento vs. periodo anterior"
      : webSessionsTrend?.direction === "down"
        ? "Decremento vs. periodo anterior"
        : "Sin cambio vs. periodo anterior";
  const trendValueClass =
    webSessionsTrend?.direction === "up"
      ? "text-emerald-700 dark:text-emerald-400"
      : webSessionsTrend?.direction === "down"
        ? "text-red-700 dark:text-red-400"
        : "text-muted-foreground";
  return (
    <section className={cn("grid gap-4", className)}>
      {mode === "overview" ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricTile
          title="Sesiones web"
          value={formatNumber(totalSessions)}
          helper="Visitas registradas"
        />
        <MetricTile
          title="Personas únicas"
          value={formatNumber(uniqueContacts)}
          helper="Personas identificadas"
        />
        <MetricTile
          title="Conversaciones"
          value={formatNumber(
            toNumber(conversationTotals?.sesiones_webchat_total) +
              toNumber(conversationTotals?.conversaciones_whatsapp) +
              toNumber(conversationTotals?.conversaciones_correo) +
              toNumber(conversationTotals?.conversaciones_voz),
          )}
          helper="Todos los canales"
        />
        <MetricTile
          title="Leads en embudo"
          value={formatNumber(toNumber(summary?.leads?.totals?.total))}
          helper="Registros comerciales"
        />
        <MetricTile
          title="Tasa de contacto"
          value={formatPercent(conversionRate)}
          helper="Contacto sobre sesiones web"
        />
      </div> : null}
      {mode === "conversations" ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          title="WebChat"
          value={formatNumber(toNumber(conversationTotals?.sesiones_webchat_total))}
          helper="Sesiones que iniciaron conversación en el sitio"
        />
        <MetricTile
          title="WhatsApp"
          value={formatNumber(toNumber(conversationTotals?.conversaciones_whatsapp))}
          helper="Conversaciones registradas"
        />
        <MetricTile
          title="Correo"
          value={formatNumber(toNumber(conversationTotals?.conversaciones_correo))}
          helper="Conversaciones registradas"
        />
        <MetricTile
          title="Voz"
          value={formatNumber(toNumber(conversationTotals?.conversaciones_voz))}
          helper="Conversaciones registradas"
        />
      </div> : null}
      {mode === "campaigns" ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          title="Campañas con tráfico"
          value={formatNumber(correoCampaignRows.length)}
          helper="Campañas de correo con sesiones web"
        />
        <MetricTile
          title="Visitas desde correo"
          value={formatNumber(emailVisitsTotal)}
          helper="Sesiones web atribuidas a correo"
        />
        <MetricTile
          title="Campañas WhatsApp"
          value={formatNumber(whatsappCampaignConversionRows.length)}
          helper="Campañas con oportunidades atribuidas"
        />
        <MetricTile
          title="Oportunidades WhatsApp"
          value={formatNumber(whatsappOpportunitiesTotal)}
          helper="Oportunidades atribuidas a campañas"
        />
      </div> : null}
      {mode === "traffic" ? <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricTile
            title="Sesiones web"
            value={formatNumber(totalSessions)}
            helper="Visitas registradas en el periodo"
          />
          <MetricTile
            title="Comparación de visitas"
            value={trendComparisonLabel}
            helper={trendDirectionLabel}
            valueClassName={trendValueClass}
          />
          <MetricTile
            title="Personas únicas"
            value={formatNumber(uniqueContacts)}
            helper="Personas identificadas"
          />
          <MetricTile
            title="Tasa de contacto"
            value={formatPercent(conversionRate)}
            helper="Sesiones con contacto sobre sesiones web"
          />
        </div>
        <div className="space-y-3">
          <div>
            <h3 className="text-base font-semibold">1. Origen del tráfico</h3>
            <p className="text-muted-foreground text-sm">
              Clasificación general de cómo llegaron las sesiones al sitio.
            </p>
          </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
        <Card className="h-full">
          <CardHeader>
            <CardTitle>Sesiones por origen</CardTitle>
            <CardDescription>
              Directo, búsqueda, redes sociales, promoción, referidos y asistentes digitales.
            </CardDescription>
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
                        const label = isConverted ? "Con contacto" : "Sesiones";
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
                    {hasDetailedVisits ? (
                      <Bar dataKey="converted" radius={[6, 6, 0, 0]} fill={CONVERTED_COLOR}>
                        <LabelList content={renderBarValueLabel} />
                      </Bar>
                    ) : null}
                  </BarChart>
                </ChartContainer>
                {hasDetailedVisits ? <div className="mt-3 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <span
                    className="h-2.5 w-2.5 rounded-[2px]"
                    style={{ backgroundColor: CONVERTED_COLOR }}
                    aria-hidden="true"
                  />
                  <span>Verde = sesiones con contacto cuando existe detalle de sesiones</span>
                </div> : null}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">No hay sesiones web para el filtro actual.</p>
            )}
          </CardContent>
        </Card>

        <Card className="h-full">
          <CardHeader>
            <CardTitle>Sesiones y contactos</CardTitle>
            <CardDescription>
              Separación entre sesiones, sesiones con contacto y personas únicas.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <MetricTile
              title="Sesiones totales"
              value={formatNumber(totalSessions)}
              helper="Sesiones web registradas en el filtro"
            />
            <MetricTile
              title="Sesiones con contacto"
              value={formatNumber(sessionsWithContact ?? uniqueContacts)}
              helper="Sesiones web asociadas a una conversación o contacto"
            />
            <MetricTile
              title="Personas únicas"
              value={hasDetailedVisits || hasContactSummary ? formatNumber(uniqueContacts) : "—"}
              helper={
                hasDetailedVisits || hasContactSummary
                  ? "Personas deduplicadas aunque tengan varias sesiones"
                  : "No disponible para este filtro"
              }
            />
            <MetricTile
              title="Tasa de contacto"
              value={formatPercent(conversionRate)}
              helper="Sesiones con contacto respecto a las sesiones web"
            />
          </CardContent>
        </Card>
        </div>
        </div>

      </> : null}

      {mode === "traffic" ? <div className="grid items-start gap-4 xl:grid-cols-2">
        <div className="space-y-3">
          <div>
            <h3 className="text-base font-semibold">2. Sitios que enviaron visitas</h3>
            <p className="text-muted-foreground text-sm">
              Dominios externos detectados como remitentes, incluidos buscadores y asistentes digitales.
            </p>
          </div>
          <ReferrerPieCard rows={referrerRows} />
        </div>
        <div className="space-y-3">
          <div>
            <h3 className="text-base font-semibold">3. Atribución de campañas</h3>
            <p className="text-muted-foreground text-sm">
              Fuente, medio y campaña asociados al tráfico identificado.
            </p>
          </div>
          <TrafficAttributionCard rows={topUtmRows} campaignLabels={campaignLabels} />
        </div>
      </div> : null}
      {mode === "conversations" ? <div className="grid gap-4 xl:grid-cols-2">
        {mode === "conversations" ? <Card className="h-full">
          <CardHeader>
            <CardTitle>CTAs de WhatsApp</CardTitle>
            <CardDescription>
              Conversaciones iniciadas desde frases o enlaces de WhatsApp atribuidos.
            </CardDescription>
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
        </Card> : null}
      </div> : null}

      {mode === "campaigns" ? <div className="grid gap-4 xl:grid-cols-2">
        <EmailCampaignPieCard
          data={correoCampaignRows}
          colorMap={correoCampaignColorMap}
          title="Correo · campañas que generaron visitas al sitio"
          description="Distribución real de sesiones web observadas por campaña de correo."
          emptyMessage="No hay campañas de correo con sesiones web atribuidas en este filtro."
          metricLabel="Sesiones web"
          legendSide="right"
        />
        <EmailTemplateAttributionCard
          data={correoTemplateRows}
          colorMap={correoCampaignColorMap}
          title="Correo · plantillas que generaron visitas al sitio"
          description="Cada plantilla hereda el color de su campaña madre para mostrar qué piezas participaron en las visitas."
          emptyMessage="No hay plantillas de correo con sesiones web atribuidas en este filtro."
          metricLabel="Sesiones web"
        />
      </div> : null}

      {mode === "conversations" || mode === "campaigns" ? <div className="grid gap-4 xl:grid-cols-2">
        <EmailCampaignPieCard
          data={whatsappCampaignConversionRows}
          colorMap={whatsappCampaignColorMap}
          title="WhatsApp · oportunidades por campaña"
          description="Oportunidades atribuidas a conversaciones de prospección WhatsApp; no son visitas ni envíos."
          emptyMessage="No hay campañas WhatsApp con conversión atribuida en este filtro."
          metricLabel="Oportunidades"
          legendSide="left"
        />
        <EmailTemplateAttributionCard
          data={whatsappTemplateConversionRows}
          colorMap={whatsappCampaignColorMap}
          title="WhatsApp · oportunidades por plantilla"
          description="Oportunidades atribuidas por campaña y plantilla; una visita web no cuenta aquí como oportunidad."
          emptyMessage="No hay plantillas WhatsApp con conversión atribuida en este filtro."
          metricLabel="Oportunidades"
        />
      </div> : null}
    </section>
  );
}

function MetricTile({
  title,
  value,
  helper,
  valueClassName,
}: {
  title: string;
  value: string;
  helper: string;
  valueClassName?: string;
}) {
  return (
    <div className="bg-muted/40 rounded-xl border p-4">
      <div className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
        {title}
      </div>
      <div className={cn("mt-2 text-2xl font-semibold tabular-nums", valueClassName)}>{value}</div>
      <div className="text-muted-foreground mt-1 text-xs">{helper}</div>
    </div>
  );
}
