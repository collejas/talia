"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { DashboardKpis } from "@/lib/dashboard/kpis";

type ConversationsChannelChartProps = {
  data?: DashboardKpis | null;
};

type ChannelRow = {
  canal: string;
  conversaciones: number;
  sinRespuesta: number;
};

const chartConfig = {
  conversaciones: {
    label: "Conversaciones",
    color: "hsl(216 92% 52%)",
  },
  sinRespuesta: {
    label: "Sin respuesta",
    color: "hsl(0 84% 60%)",
  },
} satisfies ChartConfig;

export function ConversationsChannelChart({ data }: ConversationsChannelChartProps) {
  const rows = buildRows(data);

  return (
    <Card className="@container/card h-full">
      <CardHeader>
        <CardTitle>Conversaciones por canal</CardTitle>
        <CardDescription>
          Volumen y conversaciones pendientes de respuesta
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 px-2 pb-2 sm:px-6">
        <ChartContainer config={chartConfig} className="!aspect-auto !h-full w-full">
          <BarChart data={rows} margin={{ left: 8, right: 16, top: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="canal"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={36} />
            <ChartTooltip cursor={{ fill: "hsl(var(--muted))" }} content={<ChartTooltipContent />} />
            <Bar
              dataKey="conversaciones"
              fill="var(--color-conversaciones)"
              radius={[6, 6, 0, 0]}
            />
            <Bar
              dataKey="sinRespuesta"
              fill="var(--color-sinRespuesta)"
              radius={[6, 6, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

function buildRows(data?: DashboardKpis | null): ChannelRow[] {
  const porCanal = data?.conversaciones?.por_canal ?? {};
  const sinRespuesta = data?.conversaciones?.sin_respuesta_por_canal ?? {};

  const rows: ChannelRow[] = Object.entries(porCanal)
    .map(([channel, total]) => ({
      canal: normalizeChannelLabel(channel),
      conversaciones: toNumber(total),
      sinRespuesta: toNumber(sinRespuesta[channel]),
    }))
    .sort((a, b) => b.conversaciones - a.conversaciones);

  return rows;
}

function normalizeChannelLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "whatsapp") return "WhatsApp";
  if (normalized === "webchat") return "Webchat";
  if (normalized === "email" || normalized === "correo" || normalized === "manual") return "Email";
  if (normalized === "voz" || normalized === "voice" || normalized === "llamada" || normalized === "call") return "Voz";
  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : "Otro";
}

function toNumber(value: number | null | undefined): number {
  if (!Number.isFinite(value ?? Number.NaN)) return 0;
  return Number(value);
}
