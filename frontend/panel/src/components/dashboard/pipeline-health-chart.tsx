"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { OpportunityKpis } from "@/lib/dashboard/opportunities-kpis";

type PipelineHealthChartProps = {
  data?: OpportunityKpis | null;
};

type HealthRow = {
  label: string;
  total: number;
};

const chartConfig = {
  total: {
    label: "Oportunidades",
    color: "hsl(38 92% 50%)",
  },
} satisfies ChartConfig;

export function PipelineHealthChart({ data }: PipelineHealthChartProps) {
  const rows = buildRows(data);

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Pipeline por salud</CardTitle>
        <CardDescription>
          Activas, sin asignar, estancadas y cierres probables
        </CardDescription>
      </CardHeader>
      <CardContent className="px-2 pb-2 sm:px-6">
        <ChartContainer config={chartConfig} className="!h-[280px]">
          <BarChart data={rows} margin={{ left: 8, right: 16, top: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={36} />
            <ChartTooltip cursor={{ fill: "hsl(var(--muted))" }} content={<ChartTooltipContent />} />
            <Bar dataKey="total" fill="var(--color-total)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

function buildRows(data?: OpportunityKpis | null): HealthRow[] {
  return [
    { label: "Activas", total: toNumber(data?.activeTotal ?? data?.total) },
    { label: "Sin asignar", total: toNumber(data?.unassigned) },
    { label: "Estancadas", total: toNumber(data?.stale) },
    { label: "Cierre 14d", total: toNumber(data?.upcomingCloseCount) },
  ];
}

function toNumber(value: number | null | undefined): number {
  if (!Number.isFinite(value ?? Number.NaN)) return 0;
  return Number(value);
}
