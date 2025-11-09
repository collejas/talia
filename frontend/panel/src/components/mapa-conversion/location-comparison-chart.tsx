"use client";

import * as React from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

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
import type { DemografiaMapDataset } from "@/lib/mapa-conversion/api";

type LocationComparisonChartProps = {
  data: DemografiaMapDataset[];
  nivel: string;
};

const chartConfig = {
  webchatVisitors: {
    label: "Visitantes webchat sin chat",
    color: "var(--primary)",
  },
  webchatLeads: {
    label: "Leads webchat",
    color: "hsl(142 71% 45%)",
  },
  whatsappLeads: {
    label: "Leads WhatsApp/Voz",
    color: "var(--destructive)",
  },
} satisfies ChartConfig;

function formatNumber(value: number): string {
  return new Intl.NumberFormat("es-MX").format(value);
}

export function LocationComparisonChart({ data, nivel }: LocationComparisonChartProps) {
  const chartData = React.useMemo(
    () =>
      data.map((entry) => ({
        location: entry.name,
        webchatVisitors: entry.visitantes_sin_chat,
        webchatLeads: entry.leads_por_canal?.webchat ?? 0,
        whatsappLeads:
          (entry.leads_por_canal?.whatsapp ?? 0) + (entry.leads_por_canal?.voz ?? 0),
      })),
    [data],
  );

  const hasData = chartData.some(
    (row) =>
      row.webchatVisitors > 0 || row.webchatLeads > 0 || row.whatsappLeads > 0,
  );

  const title =
    nivel === "pais"
      ? "Comparativa por país"
      : nivel === "municipio"
        ? "Comparativa por municipio"
        : "Comparativa por estado";

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          Comparación de visitantes webchat vs leads generados por canal en la misma ubicación.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0 pb-6">
        <ChartContainer
          config={chartConfig}
          className="h-[360px] w-full @[768px]/card:h-[420px]"
        >
          <BarChart
            data={chartData}
            barCategoryGap="20%"
            maxBarSize={48}
            margin={{ left: 4, right: 12 }}
          >
            <CartesianGrid vertical={false} strokeDasharray="4 4" />
            <XAxis
              dataKey="location"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <YAxis
              tickFormatter={formatNumber}
              width={72}
              axisLine={false}
              tickLine={false}
            />
            <ChartTooltip
              cursor={{ fill: "hsl(var(--foreground)/0.06)" }}
              content={
                <ChartTooltipContent
                  formatter={(value, name) => (
                    <span className="font-medium text-foreground">
                      {formatNumber(Number(value))}
                      <span className="ml-1 text-muted-foreground">
                        {chartConfig[name as keyof typeof chartConfig]?.label}
                      </span>
                    </span>
                  )}
                />
              }
            />
            <Bar
              dataKey="webchatVisitors"
              stackId="webchat"
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="webchatLeads"
              stackId="webchat"
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="whatsappLeads"
              radius={[4, 4, 0, 0]}
              barSize={32}
            />
          </BarChart>
        </ChartContainer>
        {!hasData ? (
          <p className="px-4 pt-4 text-sm text-muted-foreground">
            Aún no hay datos georreferenciados para los filtros seleccionados.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
