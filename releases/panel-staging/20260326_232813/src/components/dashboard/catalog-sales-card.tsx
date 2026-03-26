"use client"

import { useMemo } from "react"
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts"

import type { CatalogSalesRow } from "@/app/dashboard/catalog-analytics"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { cn } from "@/lib/utils"

type CatalogSalesCardProps = {
  data: CatalogSalesRow[]
  className?: string
}

type SalesPoint = {
  name: string
  total: number
  moneda: string
}

const chartConfig = {
  total: {
    label: "Ventas",
    color: "hsl(142 71% 45%)",
  },
} satisfies ChartConfig

export function CatalogSalesCard({ data, className }: CatalogSalesCardProps) {
  const summary = useMemo(() => summarizeSales(data), [data])
  const chartData = summary.slice(0, 5)
  const empty = chartData.length === 0

  return (
    <Card className={cn("@container/card", className)}>
      <CardHeader>
        <CardTitle>Ventas por producto</CardTitle>
        <CardDescription>Top 5 productos cerrados en los últimos meses</CardDescription>
        <CardAction>
          <Button asChild variant="outline" size="sm">
            <a href="/api/analytics/catalog/ventas/export" target="_blank" rel="noreferrer">
              Descargar CSV
            </a>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {empty ? (
          <p className="text-sm text-muted-foreground">Todavía no hay ventas cerradas para mostrar.</p>
        ) : (
          <ChartContainer config={chartConfig} className="!h-[280px]">
            <BarChart data={chartData} margin={{ left: 12, right: 12 }} barSize={28} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" hide domain={[0, "auto"]} />
              <YAxis dataKey="name" type="category" width={140} tickLine={false} axisLine={false} />
              <Tooltip cursor={{ fill: "hsl(var(--muted))" }} content={<ChartTooltipContent />} />
              <Bar dataKey="total" fill="var(--color-total)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ChartContainer>
        )}
        {chartData.length ? (
          <div className="mt-4 grid grid-cols-1 gap-2 text-sm text-muted-foreground @[600px]/card:grid-cols-2">
            {summary.slice(0, 6).map((item) => (
              <div key={item.name} className="flex items-center justify-between">
                <span className="truncate font-medium text-foreground">{item.name}</span>
                <span>{formatCurrency(item.total, item.moneda)}</span>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function summarizeSales(rows: CatalogSalesRow[]): SalesPoint[] {
  const totals = new Map<string, SalesPoint>()
  for (const row of rows) {
    const name = row.item_nombre?.trim() || "Sin nombre"
    const moneda = (row.moneda || "MXN").toUpperCase()
    const key = `${row.catalog_item_id ?? name}-${moneda}`
    const total = Number(row.total_vendido ?? 0)
    if (!Number.isFinite(total)) continue
    const current = totals.get(key) ?? { name, total: 0, moneda }
    current.total += total
    totals.set(key, current)
  }
  return Array.from(totals.values()).sort((a, b) => b.total - a.total)
}

function formatCurrency(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value)
  } catch {
    return `${currency} ${value.toFixed(0)}`
  }
}
