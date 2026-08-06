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
  converted: { label: "Con contacto", color: "var(--chart-2)" },
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

export function AcquisitionSummary({ summary, visitsPayload = null, className }: Props) {
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
  return (
    <section className={cn("grid gap-4", className)}>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="h-full">
          <CardHeader>
            <CardTitle>Sesiones por origen</CardTitle>
            <CardDescription>Sesiones web observadas; las conversaciones y oportunidades se muestran aparte.</CardDescription>
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
                  <span>Verde = sesiones con contacto cuando existe detalle de sesiones</span>
                </div>
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
              value={sessionsWithContact == null ? "—" : formatNumber(sessionsWithContact)}
              helper="Sesiones vinculadas con algún contacto"
            />
            <MetricTile
              title={sessionsWithContact == null ? "Sesiones con contacto" : "Contactos únicos"}
              value={formatNumber(sessionsWithContact ?? uniqueContacts)}
              helper={
                sessionsWithContact == null
                  ? "Sesiones web asociadas a una conversación o contacto"
                  : "Personas deduplicadas aunque tengan varias sesiones"
              }
            />
            <MetricTile
              title={sessionsWithContact == null ? "Tasa de contacto" : "Tasa de contacto único"}
              value={formatPercent(conversionRate)}
              helper="Contactos o sesiones con contacto respecto a las sesiones web"
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
            <CardTitle>Fuentes y campañas</CardTitle>
            <CardDescription>Origen, medio y campaña observados en el tráfico del sitio.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 min-h-72">
            {topUtmRows.length ? (
              topUtmRows.map((item) => (
                <div
                  key={`${item.utm_source}-${item.utm_medium}-${item.utm_campaign}`}
                  className="bg-muted/50 flex flex-col gap-2 rounded-lg px-3 py-3 text-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-1 flex-wrap gap-x-4 gap-y-2">
                      <div className="flex min-w-0 flex-col">
                        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          {formatUtmFieldLabel("utm_source")}
                        </span>
                        <span className="min-w-0 font-medium">
                          {formatUtmValue(item.utm_source, campaignLabels)}
                        </span>
                      </div>
                      <div className="flex min-w-0 flex-col">
                        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          {formatUtmFieldLabel("utm_medium")}
                        </span>
                        <span className="min-w-0 font-medium">
                          {formatUtmValue(item.utm_medium, campaignLabels)}
                        </span>
                      </div>
                      <div className="flex min-w-0 flex-col">
                        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          {formatUtmFieldLabel("utm_campaign")}
                        </span>
                        <span className="min-w-0 font-medium">
                          {formatUtmValue(item.utm_campaign, campaignLabels)}
                        </span>
                      </div>
                    </div>
                    <Badge variant="outline">{formatNumber(item.total)}</Badge>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground text-sm">No hay fuentes ni campañas destacadas en este filtro.</p>
            )}
          </CardContent>
        </Card>

        <Card className="h-full">
          <CardHeader>
            <CardTitle>WhatsApp de atribución por canal</CardTitle>
            <CardDescription>
              Distribución de inicios de WhatsApp atribuidos por canal, no de campañas de envío.
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
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
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
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
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
