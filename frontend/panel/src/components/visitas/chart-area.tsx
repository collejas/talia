"use client"

import * as React from "react"
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts"

import { useIsMobile } from "@/hooks/use-mobile"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group"
import type { VisitChartPoint } from "@/lib/visitas/data"

type ChartAreaProps = {
  data: VisitChartPoint[]
}

const chartConfig = {
  conChat: {
    label: "Con chat",
    color: "var(--primary)",
  },
  sinChat: {
    label: "Sin chat",
    color: "var(--primary)",
  },
  whatsapp: {
    label: "WhatsApp",
    color: "hsl(var(--chart-3))",
  },
} satisfies ChartConfig

export function VisitsChartArea({ data }: ChartAreaProps) {
  const isMobile = useIsMobile()
  const [timeRange, setTimeRange] = React.useState<"90d" | "30d" | "7d">("90d")
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  React.useEffect(() => {
    if (isMobile) {
      setTimeRange("7d")
    }
  }, [isMobile])

  const filteredData = React.useMemo(() => {
    if (!data.length) return []
    const latestDate = new Date(data[data.length - 1].date)
    const startDate = new Date(latestDate)
    if (timeRange === "30d") {
      startDate.setDate(startDate.getDate() - 30)
    } else if (timeRange === "7d") {
      startDate.setDate(startDate.getDate() - 7)
    } else {
      startDate.setDate(startDate.getDate() - 90)
    }
    return data.filter((item) => {
      const date = new Date(item.date)
      return date >= startDate
    })
  }, [data, timeRange])

  if (!mounted) {
    return (
      <Card className="@container/card">
        <CardHeader>
          <CardTitle>Total de visitas</CardTitle>
          <CardDescription>Cargando métricas...</CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-6">
          <div className="h-48 w-full animate-pulse rounded-lg bg-muted" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Total de visitas</CardTitle>
        <CardDescription>
          <span className="hidden @[540px]/card:block">
            Distribución por día (con vs. sin chat)
          </span>
          <span className="@[540px]/card:hidden">Últimos periodos</span>
        </CardDescription>
        <CardAction>
          <ToggleGroup
            type="single"
            value={timeRange}
            onValueChange={(value) => value && setTimeRange(value as "90d" | "30d" | "7d")}
            variant="outline"
            className="hidden *:data-[slot=toggle-group-item]:!px-4 @[767px]/card:flex"
          >
            <ToggleGroupItem value="90d">Últimos 90 días</ToggleGroupItem>
            <ToggleGroupItem value="30d">Últimos 30 días</ToggleGroupItem>
            <ToggleGroupItem value="7d">Últimos 7 días</ToggleGroupItem>
          </ToggleGroup>
          <Select value={timeRange} onValueChange={(value) => setTimeRange(value as "90d" | "30d" | "7d")}>
            <SelectTrigger
              className="flex w-40 **:data-[slot=select-value]:block **:data-[slot=select-value]:truncate @[767px]/card:hidden"
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
      <CardContent className="px-2 pb-4 pt-2">
        <ChartContainer config={chartConfig}>
          <AreaChart accessibilityLayer data={filteredData}>
            <defs>
              <linearGradient id="fillConChat" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-conChat)" stopOpacity={0.8} />
                <stop offset="95%" stopColor="var(--color-conChat)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="fillSinChat" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-sinChat)" stopOpacity={0.8} />
                <stop offset="95%" stopColor="var(--color-sinChat)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="fillWhatsapp" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-whatsapp)" stopOpacity={0.8} />
                <stop offset="95%" stopColor="var(--color-whatsapp)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <ChartTooltip
              cursor={{ strokeDasharray: "3 3" }}
              content={<ChartTooltipContent indicator="dot" />}
            />
            <Area
              dataKey="whatsapp"
              type="monotone"
              stroke="var(--color-whatsapp)"
              fill="url(#fillWhatsapp)"
              strokeWidth={2}
              name="WhatsApp"
            />
            <Area
              dataKey="conChat"
              type="monotone"
              stroke="var(--color-conChat)"
              fill="url(#fillConChat)"
              strokeWidth={2}
              name="Con chat"
            />
            <Area
              dataKey="sinChat"
              type="monotone"
              stroke="var(--color-sinChat)"
              fill="url(#fillSinChat)"
              strokeWidth={2}
              name="Sin chat"
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
