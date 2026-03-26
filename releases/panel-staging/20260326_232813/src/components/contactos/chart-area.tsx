"use client";

import * as React from "react";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";

import { useIsMobile } from "@/hooks/use-mobile";
import type { ContactChartPoint } from "@/lib/contactos/data";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";

type TimeRange = "90d" | "30d" | "7d";

type NormalizedPoint = {
  date: string;
  displayDate: string;
  timestamp: number;
  nuevos: number;
  completos: number;
  webchat: number;
};

const chartConfig = {
  nuevos: {
    label: "Nuevos",
    color: "var(--primary)",
  },
  completos: {
    label: "Completos",
    color: "hsl(142 71% 45%)",
  },
  webchat: {
    label: "Webchat",
    color: "hsl(217 91% 60%)",
  },
} satisfies ChartConfig;

const DATE_LABEL = new Intl.DateTimeFormat("es-MX", {
  month: "short",
  day: "numeric",
});

const TOOLTIP_LABEL = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "full",
});

type ContactChartAreaProps = {
  data: ContactChartPoint[];
};

export function ContactChartArea({ data }: ContactChartAreaProps) {
  const isMobile = useIsMobile();
  const [timeRange, setTimeRange] = React.useState<TimeRange>("90d");

  React.useEffect(() => {
    if (isMobile) {
      setTimeRange("7d");
    }
  }, [isMobile]);

  const normalizedData = React.useMemo(() => normalizeData(data), [data]);

  const filteredData = React.useMemo(
    () => filterByRange(normalizedData, timeRange),
    [normalizedData, timeRange],
  );

  const hasData = filteredData.length > 0;

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Tendencia de contactos</CardTitle>
        <CardDescription>
          <span className="hidden @[540px]/card:block">
            Nuevos registros, capturas completas y origen webchat
          </span>
          <span className="@[540px]/card:hidden">Actividad reciente</span>
        </CardDescription>
        <CardAction>
          <ToggleGroup
            type="single"
            value={timeRange}
            onValueChange={(value) => {
              if (value) setTimeRange(value as TimeRange);
            }}
            variant="outline"
            className="hidden *:data-[slot=toggle-group-item]:!px-4 @[767px]/card:flex"
          >
            <ToggleGroupItem value="90d">Últimos 90 días</ToggleGroupItem>
            <ToggleGroupItem value="30d">Últimos 30 días</ToggleGroupItem>
            <ToggleGroupItem value="7d">Últimos 7 días</ToggleGroupItem>
          </ToggleGroup>
          <Select
            value={timeRange}
            onValueChange={(value) => setTimeRange(value as TimeRange)}
          >
            <SelectTrigger
              className="flex w-44 **:data-[slot=select-value]:block **:data-[slot=select-value]:truncate @[767px]/card:hidden"
              size="sm"
              aria-label="Selecciona un rango"
            >
              <SelectValue placeholder="Últimos 90 días" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="90d" className="rounded-lg">
                Últimos 90 días
              </SelectItem>
              <SelectItem value="30d" className="rounded-lg">
                Últimos 30 días
              </SelectItem>
              <SelectItem value="7d" className="rounded-lg">
                Últimos 7 días
              </SelectItem>
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <ChartContainer config={chartConfig} className="min-h-[250px] w-full">
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
                <stop offset="5%" stopColor="var(--color-nuevos)" stopOpacity={0.8} />
                <stop offset="95%" stopColor="var(--color-nuevos)" stopOpacity={0.1} />
              </linearGradient>
              <linearGradient id="fillCompletos" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-completos)" stopOpacity={0.8} />
                <stop offset="95%" stopColor="var(--color-completos)" stopOpacity={0.1} />
              </linearGradient>
              <linearGradient id="fillWebchat" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-webchat)" stopOpacity={0.8} />
                <stop offset="95%" stopColor="var(--color-webchat)" stopOpacity={0.1} />
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
              dataKey="completos"
              name="Completos"
              stroke="var(--color-completos)"
              fill="url(#fillCompletos)"
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="webchat"
              name="Webchat"
              stroke="var(--color-webchat)"
              fill="url(#fillWebchat)"
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

function normalizeData(data: ContactChartPoint[]): NormalizedPoint[] {
  return data
    .map((item) => {
      const timestamp = parseDate(item.date);
      return {
        date: item.date,
        displayDate: Number.isNaN(timestamp) ? item.date : DATE_LABEL.format(timestamp),
        timestamp,
        nuevos: item.nuevos ?? 0,
        completos: item.completos ?? 0,
        webchat: item.webchat ?? 0,
      };
    })
    .filter((item) => Number.isFinite(item.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp);
}

function filterByRange(data: NormalizedPoint[], range: TimeRange): NormalizedPoint[] {
  if (!data.length) return data;
  const lastTimestamp = data[data.length - 1]?.timestamp ?? Date.now();
  let days = 90;
  if (range === "30d") {
    days = 30;
  } else if (range === "7d") {
    days = 7;
  }
  const start = lastTimestamp - days * 24 * 60 * 60 * 1000;
  return data.filter((item) => item.timestamp >= start);
}

function parseDate(value: string): number {
  if (!value) return Number.NaN;
  const iso = value.includes("T") ? value : `${value}T00:00:00Z`;
  const parsed = Date.parse(iso);
  if (!Number.isNaN(parsed)) return parsed;
  return Date.parse(value);
}
