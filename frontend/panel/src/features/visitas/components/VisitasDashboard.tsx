import { useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from 'recharts'
import { ArrowDownRight, ArrowUpRight, Clock3, Globe } from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import type { VisitaRow } from '@/types/visitas'

const numberFormatter = new Intl.NumberFormat('es-MX')
const shortDateFormatter = new Intl.DateTimeFormat('es-MX', {
  month: 'short',
  day: 'numeric',
})

type ChartPoint = {
  date: Date
  label: string
  visitas: number
  chats: number
}

const RANGE_OPTIONS = [
  { value: '7d', label: '7 días', days: 7 },
  { value: '30d', label: '30 días', days: 30 },
  { value: '90d', label: '90 días', days: 90 },
] as const

function formatDuration(seconds?: number | null): string {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return '—'
  const total = Math.floor(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  const parts: string[] = []
  if (hours) parts.push(`${hours}h`)
  if (minutes) parts.push(`${minutes}m`)
  if (!hours && secs) parts.push(`${secs}s`)
  if (!parts.length) parts.push('0s')
  return parts.join(' ')
}

function aggregateByDay(items: VisitaRow[]): ChartPoint[] {
  const buckets = new Map<
    string,
    {
      date: Date
      visitas: number
      chats: number
    }
  >()

  items.forEach((row) => {
    const timestamp = row.ultimo_evento_en || row.primera_visita_en || row.registrado_en
    if (!timestamp) return
    const date = new Date(timestamp)
    if (Number.isNaN(date.getTime())) return
    const key = date.toISOString().slice(0, 10)
    const bucket = buckets.get(key) ?? {
      date,
      visitas: 0,
      chats: 0,
    }
    bucket.visitas += 1
    if (row.tuvo_chat) bucket.chats += 1
    buckets.set(key, bucket)
  })

  return Array.from(buckets.values())
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((value) => ({
      date: value.date,
      label: shortDateFormatter.format(value.date),
      visitas: value.visitas,
      chats: value.chats,
    }))
}

type SummaryBlocksProps = {
  total: number
  conChat: number
  sinChat: number
  items: VisitaRow[]
  loading: boolean
}

export function VisitasDashboardSummary({ total, conChat, sinChat, items, loading }: SummaryBlocksProps) {
  const uniqueCountries = useMemo(() => {
    const set = new Set<string>()
    items.forEach((row) => {
      if (row.country_code) {
        set.add(row.country_code.toUpperCase())
      } else if (row.country_name) {
        set.add(row.country_name.toLowerCase())
      }
    })
    return set.size
  }, [items])

  const averageStay = useMemo(() => {
    if (!items.length) return null
    let totalSeconds = 0
    let counted = 0
    items.forEach((row) => {
      const value = typeof row.avg_stay_seconds === 'number' ? row.avg_stay_seconds : row.stay_seconds
      if (typeof value === 'number' && Number.isFinite(value)) {
        totalSeconds += value
        counted += 1
      }
    })
    if (!counted) return null
    return totalSeconds / counted
  }, [items])

  return (
    <div className="grid gap-4 lg:grid-cols-2 @5xl:grid-cols-4">
      <Card className="border-border bg-surface shadow-panel-soft">
        <CardHeader className="flex-row items-start justify-between">
          <div>
            <CardDescription>Total de sesiones</CardDescription>
            <CardTitle className="text-3xl font-semibold tabular-nums">
              {loading ? <Skeleton className="h-8 w-24 rounded-sm" /> : numberFormatter.format(total)}
            </CardTitle>
          </div>
          <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary">
            <ArrowUpRight className="mr-1 h-4 w-4" /> Chat activo
          </Badge>
        </CardHeader>
        <CardContent className="pt-0 text-sm text-muted-foreground">
          {loading ? (
            <Skeleton className="h-4 w-32 rounded-sm" />
          ) : (
            <>
              {numberFormatter.format(conChat)} con chat ·{' '}
              {numberFormatter.format(sinChat)} sin chat
            </>
          )}
        </CardContent>
      </Card>

      <Card className="border-border bg-surface shadow-panel-soft">
        <CardHeader className="flex-row items-start justify-between">
          <div>
            <CardDescription>Promedio de permanencia</CardDescription>
            <CardTitle className="text-3xl font-semibold tabular-nums">
              {loading ? <Skeleton className="h-8 w-28 rounded-sm" /> : formatDuration(averageStay)}
            </CardTitle>
          </div>
          <Badge variant="outline" className="border-foreground/30 bg-foreground/10 text-foreground">
            <Clock3 className="mr-1 h-4 w-4" /> Tiempo
          </Badge>
        </CardHeader>
        <CardContent className="pt-0 text-sm text-muted-foreground">
          {loading ? <Skeleton className="h-4 w-24 rounded-sm" /> : 'Calculado con sesiones visibles'}
        </CardContent>
      </Card>

      <Card className="border-border bg-surface shadow-panel-soft">
        <CardHeader className="flex-row items-start justify-between">
          <div>
            <CardDescription>Sesiones con chat</CardDescription>
            <CardTitle className="text-3xl font-semibold tabular-nums">
              {loading ? <Skeleton className="h-8 w-24 rounded-sm" /> : numberFormatter.format(conChat)}
            </CardTitle>
          </div>
          <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-200">
            <ArrowUpRight className="mr-1 h-4 w-4" /> Conversaciones
          </Badge>
        </CardHeader>
        <CardContent className="pt-0 text-sm text-muted-foreground">
          {loading ? <Skeleton className="h-4 w-24 rounded-sm" /> : 'Sesiones que generaron interacción'}
        </CardContent>
      </Card>

      <Card className="border-border bg-surface shadow-panel-soft">
        <CardHeader className="flex-row items-start justify-between">
          <div>
            <CardDescription>Alcance geográfico</CardDescription>
            <CardTitle className="text-3xl font-semibold tabular-nums">
              {loading ? <Skeleton className="h-8 w-24 rounded-sm" /> : numberFormatter.format(uniqueCountries)}
            </CardTitle>
          </div>
          <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary">
            <Globe className="mr-1 h-4 w-4" /> Países
          </Badge>
        </CardHeader>
        <CardContent className="pt-0 text-sm text-muted-foreground">
          {loading ? <Skeleton className="h-4 w-24 rounded-sm" /> : 'Países detectados en las visitas listadas'}
        </CardContent>
      </Card>
    </div>
  )
}

export function VisitasDashboardChart({ items, loading }: { items: VisitaRow[]; loading: boolean }) {
  const [range, setRange] = useState<(typeof RANGE_OPTIONS)[number]['value']>('30d')

  const data = useMemo(() => aggregateByDay(items), [items])

  const filteredData = useMemo(() => {
    const option = RANGE_OPTIONS.find((item) => item.value === range)
    if (!option || !data.length) return data
    const lastPoint = data[data.length - 1]
    const cutoff = new Date(lastPoint.date)
    cutoff.setDate(cutoff.getDate() - (option.days - 1))
    return data.filter((point) => point.date >= cutoff)
  }, [data, range])

  return (
    <Card className="border-border bg-surface shadow-panel-soft">
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Actividad reciente</CardTitle>
          <CardDescription>Visitas y conversaciones detectadas</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Select value={range} onValueChange={(value) => setRange(value as (typeof RANGE_OPTIONS)[number]['value'])}>
            <SelectTrigger className="w-[140px] border-border bg-surface-alt text-foreground">
              <SelectValue placeholder="Rango" />
            </SelectTrigger>
            <SelectContent>
              {RANGE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  Últimos {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {data.length > filteredData.length ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-border/60 text-muted-foreground"
              onClick={() => setRange('90d')}
            >
              <ArrowDownRight className="mr-1 h-4 w-4" /> Ver más
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="h-[280px] w-full">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Skeleton className="h-[220px] w-full rounded-xl" />
            </div>
          ) : filteredData.length ? (
            <ResponsiveContainer>
              <AreaChart data={filteredData}>
                <defs>
                  <linearGradient id="visitsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="chatGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-accent)" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="var(--color-accent)" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke="rgba(255,255,255,0.4)"
                  tickLine={false}
                  axisLine={false}
                  minTickGap={12}
                />
                <Tooltip
                  cursor={{ stroke: 'rgba(255,255,255,0.2)' }}
                  formatter={(value: number, name) => [
                    numberFormatter.format(value),
                    name === 'visitas' ? 'Sesiones' : 'Sesiones con chat',
                  ]}
                  labelFormatter={(label) => `Fecha: ${label}`}
                  contentStyle={{
                    background: 'var(--color-surface)',
                    borderRadius: '12px',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-foreground)',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="visitas"
                  stroke="var(--color-primary)"
                  fill="url(#visitsGradient)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="chats"
                  stroke="var(--color-accent)"
                  fill="url(#chatGradient)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
              <p>Sin datos suficientes para graficar.</p>
              <p>Amplía el período o ajusta los filtros para ver actividad.</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

type VisitasDashboardProps = {
  total: number
  chatTotals: { conChat: number; sinChat: number }
  items: VisitaRow[]
  loading: boolean
}

export function VisitasDashboard({ total, chatTotals, items, loading }: VisitasDashboardProps) {
  return (
    <div className="flex flex-col gap-4">
      <VisitasDashboardSummary
        total={total}
        conChat={chatTotals.conChat}
        sinChat={chatTotals.sinChat}
        items={items}
        loading={loading}
      />
      <VisitasDashboardChart items={items} loading={loading} />
    </div>
  )
}
