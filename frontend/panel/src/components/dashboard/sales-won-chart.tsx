"use client";

import * as React from "react";
import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";

import type { LeadChartPoint } from "@/lib/leads/data";
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

type SalesWonChartProps = {
  data?: LeadChartPoint[];
};

type NormalizedPoint = {
  date: string;
  displayDate: string;
  timestamp: number;
  ganados: number;
  valorGanado: number;
};

const chartConfig = {
  valorGanado: {
    label: "Valor ganado",
    color: "hsl(142 71% 45%)",
  },
  ganados: {
    label: "Leads ganados",
    color: "hsl(200 80% 45%)",
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
        ganados: item.ganados ?? 0,
        valorGanado: item.valorGanado ?? 0,
      };
    })
    .filter((item) => Number.isFinite(item.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value);
}

export function SalesWonChart({ data = [] }: SalesWonChartProps) {
  const normalized = React.useMemo(() => normalizeData(data), [data]);
  const hasData = normalized.length > 0;

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Ventas ganadas por periodo</CardTitle>
        <CardDescription>
          Cierres y valor ganado dentro del rango seleccionado
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <ChartContainer config={chartConfig} className="h-[260px] min-h-[220px] w-full">
          <ComposedChart
            accessibilityLayer
            data={normalized}
            margin={{ left: 12, right: 12 }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="displayDate"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
            />
            <YAxis yAxisId="left" hide domain={[0, "auto"]} />
            <YAxis yAxisId="right" hide orientation="right" domain={[0, "auto"]} />
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
              formatter={(value, name) => {
                if (name === chartConfig.valorGanado.label) {
                  return [formatCurrency(Number(value ?? 0)), name];
                }
                return [String(value ?? 0), name];
              }}
              content={<ChartTooltipContent indicator="dot" />}
            />
            <Bar
              yAxisId="right"
              dataKey="valorGanado"
              name={chartConfig.valorGanado.label}
              fill="var(--color-valorGanado)"
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="ganados"
              name={chartConfig.ganados.label}
              stroke="var(--color-ganados)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ChartContainer>
        {!hasData ? (
          <p className="text-muted-foreground px-6 py-4 text-sm">
            Aún no hay cierres ganados para este periodo.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
