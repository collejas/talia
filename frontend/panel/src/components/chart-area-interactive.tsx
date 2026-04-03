"use client";

import * as React from "react";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";

import type { LeadChartPoint } from "@/lib/leads/data";
import {
  Card,
  CardAction,
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
export const description = "Actividad diaria de los leads";

type NormalizedPoint = {
  date: string;
  displayDate: string;
  timestamp: number;
  nuevos: number;
  ganados: number;
  perdidos: number;
};

const chartConfig = {
  nuevos: {
    label: "Nuevos",
    color: "var(--primary)",
  },
  ganados: {
    label: "Ganados",
    color: "hsl(142 71% 45%)",
  },
  perdidos: {
    label: "Perdidos",
    color: "var(--destructive)",
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

function normalizeData(data: LeadChartPoint[]): NormalizedPoint[] {
  return data
    .map((item) => {
      const timestamp = parseToUTC(item.date);
      return {
        date: item.date,
        displayDate: Number.isNaN(timestamp)
          ? item.date
          : DATE_LABEL.format(timestamp),
        timestamp,
        nuevos: item.nuevos ?? 0,
        ganados: item.ganados ?? 0,
        perdidos: item.perdidos ?? 0,
      };
    })
    .filter((item) => Number.isFinite(item.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp);
}

type ChartAreaInteractiveProps = {
  data?: LeadChartPoint[];
};

export function ChartAreaInteractive({ data = [] }: ChartAreaInteractiveProps) {
  const filteredData = React.useMemo(() => normalizeData(data), [data]);

  const hasData = filteredData.length > 0;

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Evolución de los leads</CardTitle>
        <CardDescription>
          <span className="hidden @[540px]/card:block">
            Nuevos, ganados y perdidos en el periodo seleccionado
          </span>
          <span className="@[540px]/card:hidden">
            Actividad en el periodo
          </span>
        </CardDescription>
        <CardAction />
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <ChartContainer
          config={chartConfig}
          className="h-[220px] min-h-[200px] w-full"
        >
          <AreaChart
            accessibilityLayer
            data={filteredData}
            margin={{
              left: 12,
              right: 12,
            }}
          >
            <defs>
              <linearGradient id="fillNuevos" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-nuevos)"
                  stopOpacity={0.8}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-nuevos)"
                  stopOpacity={0.1}
                />
              </linearGradient>
              <linearGradient id="fillGanados" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-ganados)"
                  stopOpacity={0.8}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-ganados)"
                  stopOpacity={0.1}
                />
              </linearGradient>
              <linearGradient id="fillPerdidos" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-perdidos)"
                  stopOpacity={0.8}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-perdidos)"
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
              dataKey="nuevos"
              name="Nuevos"
              stroke="var(--color-nuevos)"
              fill="url(#fillNuevos)"
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="ganados"
              name="Ganados"
              stroke="var(--color-ganados)"
              fill="url(#fillGanados)"
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="perdidos"
              name="Perdidos"
              stroke="var(--color-perdidos)"
              fill="url(#fillPerdidos)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ChartContainer>
        {!hasData ? (
          <p className="text-muted-foreground px-6 py-4 text-sm">
            Aún no hay datos para este periodo.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
