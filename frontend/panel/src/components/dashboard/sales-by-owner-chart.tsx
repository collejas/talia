"use client";

import * as React from "react";
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";

import type { LeadSellerPoint } from "@/lib/leads/data";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

type SalesByOwnerChartProps = {
  data?: LeadSellerPoint[];
};

const chartConfig = {
  valorGanado: {
    label: "Valor ganado",
    color: "hsl(28 90% 55%)",
  },
} satisfies ChartConfig;

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value);
}

export function SalesByOwnerChart({ data = [] }: SalesByOwnerChartProps) {
  const chartData = React.useMemo(() => data.slice(0, 6), [data]);
  const hasData = chartData.length > 0;

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Ventas por vendedor</CardTitle>
        <CardDescription>
          Ranking por valor ganado en el rango seleccionado
        </CardDescription>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <ChartContainer config={chartConfig} className="!h-[260px] w-full">
            <BarChart data={chartData} margin={{ left: 12, right: 20 }} barSize={24} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" hide domain={[0, "auto"]} />
              <YAxis
                dataKey="nombre"
                type="category"
                width={132}
                tickLine={false}
                axisLine={false}
              />
              <ChartTooltip
                cursor={{ fill: "hsl(var(--muted))" }}
                content={<ChartTooltipContent />}
                formatter={(value, name, item) => {
                  const payload = item.payload as LeadSellerPoint;
                  return [
                    `${formatCurrency(Number(value ?? 0))} · ${payload.ganados} ganados`,
                    name,
                  ];
                }}
              />
              <Bar dataKey="valorGanado" name={chartConfig.valorGanado.label} fill="var(--color-valorGanado)" radius={[0, 4, 4, 0]}>
                <LabelList
                  dataKey="ganados"
                  position="right"
                  formatter={(value: number) => `${value}`}
                  className="fill-muted-foreground text-[11px]"
                />
              </Bar>
            </BarChart>
          </ChartContainer>
        ) : (
          <p className="text-sm text-muted-foreground">Todavía no hay cierres por vendedor para mostrar.</p>
        )}
      </CardContent>
    </Card>
  );
}
