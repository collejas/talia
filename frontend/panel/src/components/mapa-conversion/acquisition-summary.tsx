"use client";

import * as React from "react";
import { Bar, BarChart, CartesianGrid, Cell, XAxis } from "recharts";

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
import {
  formatSourceClassLabel,
  normalizeAcquisitionSourceClass,
} from "@/lib/mapa-conversion/source-class";
import type { VisitTableRow } from "@/lib/visitas/data";
import { cn } from "@/lib/utils";

type Props = {
  summary: DemografiaSummaryResponse | null;
  visits: VisitTableRow[];
  className?: string;
};

type SourceClassBucket = {
  source: string;
  total: number;
  converted: number;
};

type HostBucket = {
  host: string;
  total: number;
  converted: number;
};

type UtmBucket = {
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  total: number;
};

const SOURCE_CLASS_CONFIG: ChartConfig = {
  total: { label: "Sesiones", color: "hsl(var(--chart-1))" },
  converted: { label: "Convertidas", color: "hsl(var(--chart-2))" },
};

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

function parseHost(value: string | null | undefined): string {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    return (parsed.hostname || "").trim().toLowerCase();
  } catch {
    return trimmed.toLowerCase();
  }
}

function resolveReferrerHost(row: Record<string, unknown>): string {
  const explicit = typeof row.referrer_host === "string" ? row.referrer_host.trim().toLowerCase() : "";
  if (explicit) return explicit;
  const referrer = typeof row.referrer === "string" ? row.referrer : null;
  return parseHost(referrer);
}

function formatUtmPart(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length ? text : "(none)";
}

function aggregateTopUtm(summary: DemografiaSummaryResponse | null): UtmBucket[] {
  const totals = new Map<string, UtmBucket>();
  const items = Array.isArray(summary?.visitantes?.items) ? summary?.visitantes?.items ?? [] : [];
  for (const item of items) {
    for (const utm of item.utm_top ?? []) {
      const source = formatUtmPart(utm?.utm_source);
      const medium = formatUtmPart(utm?.utm_medium);
      const campaign = formatUtmPart(utm?.utm_campaign);
      const key = `${source}::${medium}::${campaign}`;
      const existing = totals.get(key) ?? {
        utm_source: source,
        utm_medium: medium,
        utm_campaign: campaign,
        total: 0,
      };
      existing.total += toNumber(utm?.total);
      totals.set(key, existing);
    }
  }
  return Array.from(totals.values())
    .sort((a, b) => b.total - a.total || a.utm_source.localeCompare(b.utm_source))
    .slice(0, 5);
}

export function AcquisitionSummary({ summary, visits, className }: Props) {
  const { sourceClassRows, referrerRows, totalSessions, convertedSessions, conversionRate } =
    React.useMemo(() => {
      const sourceBuckets = new Map<string, SourceClassBucket>();
      const hostBuckets = new Map<string, HostBucket>();

      let sessions = 0;
      let converted = 0;

      for (const row of visits) {
        const raw = (row.raw ?? {}) as Record<string, unknown>;
        sessions += 1;
        const hasConversion = Boolean(raw.contacto_id);
        if (hasConversion) {
          converted += 1;
        }

        const source = normalizeAcquisitionSourceClass({
          sourceClass: typeof raw.source_class === "string" ? raw.source_class : null,
          referrerHost: typeof raw.referrer_host === "string" ? raw.referrer_host : null,
          referrer: typeof raw.referrer === "string" ? raw.referrer : null,
          landingUrl: typeof raw.landing_url === "string" ? raw.landing_url : null,
          utmSource: typeof raw.utm_source === "string" ? raw.utm_source : null,
          utmMedium: typeof raw.utm_medium === "string" ? raw.utm_medium : null,
          utmCampaign: typeof raw.utm_campaign === "string" ? raw.utm_campaign : null,
        });
        const sourceBucket = sourceBuckets.get(source) ?? {
          source,
          total: 0,
          converted: 0,
        };
        sourceBucket.total += 1;
        if (hasConversion) {
          sourceBucket.converted += 1;
        }
        sourceBuckets.set(source, sourceBucket);

        const host = resolveReferrerHost(raw);
        if (!host) continue;
        const hostBucket = hostBuckets.get(host) ?? {
          host,
          total: 0,
          converted: 0,
        };
        hostBucket.total += 1;
        if (hasConversion) {
          hostBucket.converted += 1;
        }
        hostBuckets.set(host, hostBucket);
      }

      const rows = Array.from(sourceBuckets.values()).sort((a, b) => b.total - a.total || a.source.localeCompare(b.source));
      const referrers = Array.from(hostBuckets.values())
        .sort((a, b) => b.total - a.total || a.host.localeCompare(b.host))
        .slice(0, 5);

      return {
        sourceClassRows: rows,
        referrerRows: referrers,
        totalSessions: sessions,
        convertedSessions: converted,
        conversionRate: sessions > 0 ? (converted / sessions) * 100 : 0,
      };
    }, [visits]);

  const topSource = sourceClassRows[0] ?? null;
  const topSourceLabel = topSource ? formatSourceClassLabel(topSource.source) : "Sin datos";
  const topSourceTotal = topSource?.total ?? 0;
  const topUtmRows = React.useMemo(() => aggregateTopUtm(summary), [summary]);

  return (
    <section className={cn("grid gap-4", className)}>
      <Card>
        <CardHeader>
          <CardTitle>Adquisición del sitio</CardTitle>
          <CardDescription>
            Vista operativa del tráfico que entra al sitio y cómo se distribuye por origen.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricTile title="Sesiones web" value={formatNumber(totalSessions)} helper="Filas de sesiones web first-party" />
          <MetricTile title="Sesiones convertidas" value={formatNumber(convertedSessions)} helper="Sesiones con contacto vinculado" />
          <MetricTile title="Tasa de conversión" value={formatPercent(conversionRate)} helper="Conversión sobre sesiones web" />
          <MetricTile title="Origen líder" value={topSourceLabel} helper={`${formatNumber(topSourceTotal)} sesiones`} />
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Sesiones por origen</CardTitle>
            <CardDescription>Sesiones y conversiones agrupadas por `source_class`.</CardDescription>
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

        <Card>
          <CardHeader>
            <CardTitle>Top referrers</CardTitle>
            <CardDescription>Dominios externos que enviaron tráfico al sitio.</CardDescription>
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
              <p className="text-muted-foreground text-sm">No hay referrers externos en este filtro.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Top UTM</CardTitle>
          <CardDescription>Combinaciones UTM observadas en el tráfico del sitio.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
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
            <p className="text-muted-foreground text-sm">Sin campañas top en este filtro.</p>
          )}
        </CardContent>
      </Card>
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
