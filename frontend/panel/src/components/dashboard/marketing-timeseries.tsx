"use client";

import * as React from "react";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import type { ProspeccionTimeseries } from "@/lib/dashboard/prospeccion-kpis";

type SeriesKey = "envios" | "respuestas" | "conversaciones";

type MarketingTimeseriesProps = {
  data?: ProspeccionTimeseries | null;
  dateFrom?: string | null;
  dateTo?: string | null;
};

type NormalizedPoint = {
  date: string;
  displayDate: string;
  timestamp: number;
  envios: number;
  respuestas: number;
  conversaciones: number;
};

const chartConfig = {
  envios: {
    label: "Envíos entregados",
    color: "hsl(148 67% 40%)",
  },
  respuestas: {
    label: "Respuestas",
    color: "hsl(200 80% 45%)",
  },
  conversaciones: {
    label: "Conversaciones WA",
    color: "hsl(28 90% 55%)",
  },
} satisfies ChartConfig;

const DATE_LABEL = new Intl.DateTimeFormat("es-MX", {
  month: "short",
  day: "numeric",
});

const TOOLTIP_LABEL = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "full",
});

function parseToUTC(date: string): number {
  if (!date) return Number.NaN;
  const isoLike = date.includes("T") ? date : `${date}T00:00:00Z`;
  const parsed = Date.parse(isoLike);
  if (!Number.isNaN(parsed)) {
    return parsed;
  }
  const fallback = Date.parse(date);
  return Number.isNaN(fallback) ? Number.NaN : fallback;
}

function normalizeData(
  data?: ProspeccionTimeseries | null,
  dateFrom?: string | null,
  dateTo?: string | null,
): NormalizedPoint[] {
  const campanas = data?.campanas ?? [];
  const frases = data?.frases_whatsapp ?? [];
  const frasesMap = new Map<string, number>();
  for (const row of frases) {
    if (!row?.fecha) continue;
    frasesMap.set(row.fecha, Number(row.conversaciones_atribuidas ?? 0));
  }

  const campanaMap = new Map<string, { envios: number; respuestas: number }>();
  for (const row of campanas) {
    if (!row?.fecha) continue;
    campanaMap.set(row.fecha, {
      envios: Number(row.envios_entregados ?? 0),
      respuestas: Number(row.envios_respondidos ?? 0),
    });
  }

  const start = resolveStartDate(dateFrom, campanas);
  const end = resolveEndDate(dateTo, campanas);
  if (!start || !end) return [];

  const series: NormalizedPoint[] = [];
  for (const day of iterateDays(start, end)) {
    const key = formatDate(day);
    const timestamp = parseToUTC(key);
    const camp = campanaMap.get(key);
    series.push({
      date: key,
      displayDate: Number.isNaN(timestamp) ? key : DATE_LABEL.format(timestamp),
      timestamp,
      envios: camp?.envios ?? 0,
      respuestas: camp?.respuestas ?? 0,
      conversaciones: Number(frasesMap.get(key) ?? 0),
    });
  }

  return series;
}

export function MarketingTimeseries({ data, dateFrom, dateTo }: MarketingTimeseriesProps) {
  const [series, setSeries] = React.useState<SeriesKey>("envios");
  const normalized = React.useMemo(
    () => normalizeData(data, dateFrom, dateTo),
    [data, dateFrom, dateTo],
  );
  const hasData = normalized.length > 0;

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Rendimiento de campañas</CardTitle>
        <CardDescription>
          Entregas, respuestas y conversaciones atribuidas por día
        </CardDescription>
        <ToggleGroup
          type="single"
          value={series}
          onValueChange={(value) => {
            if (value) setSeries(value as SeriesKey);
          }}
          variant="outline"
          className="hidden *:data-[slot=toggle-group-item]:!px-4 @[767px]/card:flex"
        >
          <ToggleGroupItem value="envios">Entregas</ToggleGroupItem>
          <ToggleGroupItem value="respuestas">Respuestas</ToggleGroupItem>
          <ToggleGroupItem value="conversaciones">WA atribuido</ToggleGroupItem>
        </ToggleGroup>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <ChartContainer
          config={chartConfig}
          className="h-[220px] min-h-[200px] w-full"
        >
          <AreaChart
            accessibilityLayer
            data={normalized}
            margin={{
              left: 12,
              right: 12,
            }}
          >
            <defs>
              <linearGradient id="fillMarketing" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor={`var(--color-${series})`}
                  stopOpacity={0.8}
                />
                <stop
                  offset="95%"
                  stopColor={`var(--color-${series})`}
                  stopOpacity={0.1}
                />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="displayDate"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
            />
            <ChartTooltip
              cursor={false}
              labelFormatter={(value, payload) => {
                if (!payload?.length) return value;
                const item = payload[0];
                if (
                  item &&
                  typeof item.payload.timestamp === "number" &&
                  Number.isFinite(item.payload.timestamp)
                ) {
                  return TOOLTIP_LABEL.format(item.payload.timestamp);
                }
                return value;
              }}
              content={<ChartTooltipContent indicator="dot" />}
            />
            <Area
              type="monotone"
              dataKey={series}
              name={chartConfig[series].label}
              stroke={`var(--color-${series})`}
              fill="url(#fillMarketing)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ChartContainer>
        {!hasData ? (
          <p className="text-muted-foreground px-6 py-4 text-sm">
            Aún no hay datos de campañas para este periodo.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function resolveStartDate(dateFrom: string | null | undefined, campanas: ProspeccionTimeseries["campanas"]): Date | null {
  if (dateFrom) {
    const parsed = Date.parse(dateFrom);
    if (Number.isFinite(parsed)) return new Date(parsed);
  }
  const first = campanas.find((row) => row.fecha)?.fecha;
  if (!first) return null;
  const parsed = Date.parse(first);
  return Number.isFinite(parsed) ? new Date(parsed) : null;
}

function resolveEndDate(dateTo: string | null | undefined, campanas: ProspeccionTimeseries["campanas"]): Date | null {
  if (dateTo) {
    const parsed = Date.parse(dateTo);
    if (Number.isFinite(parsed)) return new Date(parsed);
  }
  const last = campanas.length ? campanas[campanas.length - 1]?.fecha : null;
  if (!last) return null;
  const parsed = Date.parse(last);
  return Number.isFinite(parsed) ? new Date(parsed) : null;
}

function* iterateDays(start: Date, end: Date): Generator<Date> {
  const current = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  while (current <= last) {
    yield new Date(current);
    current.setUTCDate(current.getUTCDate() + 1);
  }
}

function formatDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
