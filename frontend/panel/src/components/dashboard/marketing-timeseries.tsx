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

function normalizeData(data?: ProspeccionTimeseries | null): NormalizedPoint[] {
  const campanas = data?.campanas ?? [];
  const frases = data?.frases_whatsapp ?? [];
  const frasesMap = new Map<string, number>();
  for (const row of frases) {
    if (!row?.fecha) continue;
    frasesMap.set(row.fecha, Number(row.conversaciones_atribuidas ?? 0));
  }

  return campanas
    .map((row) => {
      const timestamp = parseToUTC(row.fecha);
      return {
        date: row.fecha,
        displayDate: Number.isNaN(timestamp)
          ? row.fecha
          : DATE_LABEL.format(timestamp),
        timestamp,
        envios: Number(row.envios_entregados ?? 0),
        respuestas: Number(row.envios_respondidos ?? 0),
        conversaciones: Number(frasesMap.get(row.fecha) ?? 0),
      };
    })
    .filter((item) => Number.isFinite(item.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp);
}

export function MarketingTimeseries({ data }: MarketingTimeseriesProps) {
  const [series, setSeries] = React.useState<SeriesKey>("envios");
  const normalized = React.useMemo(() => normalizeData(data), [data]);
  const hasData = normalized.length > 0;

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Rendimiento de campañas</CardTitle>
        <CardDescription>
          Envíos, respuestas y conversaciones atribuidas por día
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
          <ToggleGroupItem value="envios">Envíos</ToggleGroupItem>
          <ToggleGroupItem value="respuestas">Respuestas</ToggleGroupItem>
          <ToggleGroupItem value="conversaciones">WhatsApp</ToggleGroupItem>
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
