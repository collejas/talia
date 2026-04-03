"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import type { LeadCards } from "@/lib/leads/data";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

type SalesConversionChartProps = {
  data?: LeadCards;
};

type ConversionPoint = {
  etapa: string;
  total: number;
};

const chartConfig = {
  total: {
    label: "Leads",
    color: "hsl(215 85% 55%)",
  },
} satisfies ChartConfig;

function buildData(data?: LeadCards): ConversionPoint[] {
  return [
    { etapa: "Nuevos", total: Number(data?.nuevas ?? 0) },
    { etapa: "Ganados", total: Number(data?.ganadas ?? 0) },
    { etapa: "Perdidos", total: Number(data?.perdidas ?? 0) },
  ];
}

export function SalesConversionChart({ data }: SalesConversionChartProps) {
  const chartData = buildData(data);
  const hasData = chartData.some((item) => item.total > 0);

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Conversión comercial</CardTitle>
        <CardDescription>
          Comparativo entre entrada, cierres ganados y pérdidas del periodo
        </CardDescription>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <ChartContainer config={chartConfig} className="!h-[240px] w-full">
            <BarChart data={chartData} margin={{ left: 12, right: 12 }} barSize={48}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="etapa" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis hide domain={[0, "auto"]} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
              <Bar dataKey="total" name={chartConfig.total.label} fill="var(--color-total)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ChartContainer>
        ) : (
          <p className="text-sm text-muted-foreground">Todavía no hay suficientes eventos comerciales para comparar.</p>
        )}
      </CardContent>
    </Card>
  );
}
