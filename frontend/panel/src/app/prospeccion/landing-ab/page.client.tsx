"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { IconLoader, IconRefresh } from "@tabler/icons-react"
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Scatter,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  getLandingCtaEvents,
  type LandingCtaEventsResponse,
  type LandingCtaVariantSummary,
} from "@/lib/prospeccion/prospectos-client"

const variantOrder = ["A", "B", "C", "UNKNOWN"]
const weekdayLabels = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"]

function formatPercent(value: number) {
  return `${value.toFixed(2)}%`
}

export default function LandingAbPageClient() {
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<LandingCtaEventsResponse | null>(null)

  const loadMetrics = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await getLandingCtaEvents({
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        event_type: "whatsapp_cta_click",
        limit: 8000,
      })
      setData(response)
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudieron cargar los eventos."
      setError(message)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo])

  useEffect(() => {
    void loadMetrics()
  }, [loadMetrics])

  const variantSummary = useMemo(() => {
    const byVariant = new Map<string, LandingCtaVariantSummary>()
    for (const item of data?.by_variant ?? []) {
      byVariant.set(item.variant.toUpperCase(), item)
    }
    return variantOrder.map((variant) => {
      const entry = byVariant.get(variant)
      return {
        variant,
        clicks: entry?.clicks ?? 0,
        share_pct: entry?.share_pct ?? 0,
      }
    })
  }, [data?.by_variant])

  const topCtas = data?.by_cta ?? []
  const variantCtas = data?.by_variant_cta ?? []
  const timeseries = useMemo(() => {
    const map = new Map<string, { date: string; A?: number; B?: number; C?: number; UNKNOWN?: number }>()
    for (const row of data?.by_day ?? []) {
      const key = row.date
      const entry = map.get(key) || { date: key }
      const variantKey = (row.variant || "UNKNOWN").toUpperCase()
      if (variantKey === "A" || variantKey === "B" || variantKey === "C" || variantKey === "UNKNOWN") {
        entry[variantKey] = row.clicks
      }
      map.set(key, entry)
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date))
  }, [data?.by_day])
  const hourlySeries = useMemo(() => {
    const map = new Map<number, { hour: number; A?: number; B?: number; C?: number; UNKNOWN?: number }>()
    for (let hour = 0; hour < 24; hour += 1) {
      map.set(hour, { hour })
    }
    for (const row of data?.by_hour ?? []) {
      const hour = Number(row.hour)
      if (!Number.isFinite(hour) || hour < 0 || hour > 23) continue
      const entry = map.get(hour) || { hour }
      const variantKey = (row.variant || "UNKNOWN").toUpperCase()
      if (variantKey === "A" || variantKey === "B" || variantKey === "C" || variantKey === "UNKNOWN") {
        entry[variantKey] = (entry[variantKey] ?? 0) + row.clicks
      }
      map.set(hour, entry)
    }
    return Array.from(map.values()).sort((a, b) => a.hour - b.hour)
  }, [data?.by_hour])
  const hourlyScatter = useMemo(() => {
    const buckets: Record<string, Array<{ hour: number; value: number }>> = {
      A: [],
      B: [],
      C: [],
      UNKNOWN: [],
    }
    for (const row of hourlySeries) {
      for (const key of ["A", "B", "C", "UNKNOWN"]) {
        const value = Number(row[key as keyof typeof row] ?? 0)
        if (Number.isFinite(value) && value > 0) {
          buckets[key].push({ hour: row.hour, value })
        }
      }
    }
    return buckets
  }, [hourlySeries])
  const weekdaySeries = useMemo(() => {
    const map = new Map<number, { weekday: number; A?: number; B?: number; C?: number; UNKNOWN?: number }>()
    for (let day = 0; day < 7; day += 1) {
      map.set(day, { weekday: day })
    }
    for (const row of data?.by_weekday ?? []) {
      const day = Number(row.weekday)
      if (!Number.isFinite(day) || day < 0 || day > 6) continue
      const entry = map.get(day) || { weekday: day }
      const variantKey = (row.variant || "UNKNOWN").toUpperCase()
      if (variantKey === "A" || variantKey === "B" || variantKey === "C" || variantKey === "UNKNOWN") {
        entry[variantKey] = (entry[variantKey] ?? 0) + row.clicks
      }
      map.set(day, entry)
    }
    return Array.from(map.values()).sort((a, b) => a.weekday - b.weekday)
  }, [data?.by_weekday])
  const countActivePoints = useCallback(
    (rows: Array<Record<string, number | undefined>>, keys: string[]) =>
      rows.reduce((total, row) => {
        const hasValue = keys.some((key) => Number(row[key] ?? 0) > 0)
        return total + (hasValue ? 1 : 0)
      }, 0),
    [],
  )
  const hourlyDots = countActivePoints(hourlySeries, ["A", "B", "C", "UNKNOWN"]) < 3
  const weekdayDots = countActivePoints(weekdaySeries, ["A", "B", "C", "UNKNOWN"]) < 3
  const alwaysShowDots = true
  const conditionalDot = useCallback(
    (props: { cx?: number; cy?: number; value?: number; stroke?: string; index?: number; dataKey?: string }) => {
      const { cx, cy, value, stroke, index, dataKey } = props
      const numeric = typeof value === "number" ? value : Number(value)
      if (!Number.isFinite(numeric) || numeric <= 0 || typeof cx !== "number" || typeof cy !== "number") {
        return null
      }
      const key = `dot-${dataKey ?? "series"}-${index ?? 0}`
      return (
        <circle
          key={key}
          cx={cx}
          cy={cy}
          r={4}
          fill={stroke || "#0ea5e9"}
          stroke="#ffffff"
          strokeWidth={1}
        />
      )
    },
    [],
  )
  const formattedEvents = useMemo(() => {
    const events = data?.events ?? []
    const formatter = new Intl.DateTimeFormat("es-MX", {
      dateStyle: "medium",
      timeStyle: "short",
    })
    return events.map((event, index) => {
      const rawDate = event.created_at_local || event.created_at
      let label = rawDate ?? ""
      if (rawDate) {
        const parsed = new Date(rawDate)
        if (!Number.isNaN(parsed.getTime())) {
          label = formatter.format(parsed)
        }
      }
      return {
        id: `${event.created_at ?? "na"}-${event.cta_id ?? "cta"}-${event.variant ?? "v"}-${index}`,
        timestamp: label || "—",
        variant: (event.variant || "UNKNOWN").toUpperCase(),
        cta_id: event.cta_id || "unknown",
        location_href: event.location_href || "—",
        referrer: event.referrer || "—",
      }
    })
  }, [data?.events])

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="space-y-3">
          <CardTitle>Filtros</CardTitle>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <Label>Desde</Label>
              <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Hasta</Label>
              <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            </div>
            <div className="flex items-end">
              <Button onClick={() => void loadMetrics()} disabled={loading} variant="outline">
                {loading ? <IconLoader className="mr-2 h-4 w-4 animate-spin" /> : <IconRefresh className="mr-2 h-4 w-4" />}
                Refrescar
              </Button>
            </div>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {variantSummary.map((item) => (
          <Card key={item.variant}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Variante {item.variant === "UNKNOWN" ? "Sin variante" : item.variant}
                {item.variant === "UNKNOWN" ? <Badge variant="secondary">fallback</Badge> : null}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="text-3xl font-semibold">{item.clicks}</div>
              <div className="text-sm text-muted-foreground">Share: {formatPercent(item.share_pct)}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top CTAs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-2 py-2">CTA</th>
                    <th className="px-2 py-2 text-right">Clicks</th>
                  </tr>
                </thead>
                <tbody>
                  {topCtas.map((cta) => (
                    <tr key={cta.cta_id} className="border-b">
                      <td className="px-2 py-2 font-medium">{cta.cta_id}</td>
                      <td className="px-2 py-2 text-right">{cta.clicks}</td>
                    </tr>
                  ))}
                  {!topCtas.length ? (
                    <tr>
                      <td className="px-2 py-6 text-center text-sm text-muted-foreground" colSpan={2}>
                        Sin clicks registrados.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Clicks por Variante + CTA</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-2 py-2">Variante</th>
                    <th className="px-2 py-2">CTA</th>
                    <th className="px-2 py-2 text-right">Clicks</th>
                  </tr>
                </thead>
                <tbody>
                  {variantCtas.map((row) => (
                    <tr key={`${row.variant}-${row.cta_id}`} className="border-b">
                      <td className="px-2 py-2 font-medium">{row.variant}</td>
                      <td className="px-2 py-2">{row.cta_id}</td>
                      <td className="px-2 py-2 text-right">{row.clicks}</td>
                    </tr>
                  ))}
                  {!variantCtas.length ? (
                    <tr>
                      <td className="px-2 py-6 text-center text-sm text-muted-foreground" colSpan={3}>
                        Sin clicks registrados.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Clicks diarios por variante</CardTitle>
          </CardHeader>
          <CardContent className="h-[320px]">
            {timeseries.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timeseries} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickLine={false} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="A" stroke="#7c3aed" strokeWidth={2} dot={alwaysShowDots || hourlyDots ? conditionalDot : false} />
                  <Line type="monotone" dataKey="B" stroke="#0ea5e9" strokeWidth={2} dot={alwaysShowDots || hourlyDots ? conditionalDot : false} />
                  <Line type="monotone" dataKey="C" stroke="#22c55e" strokeWidth={2} dot={alwaysShowDots || hourlyDots ? conditionalDot : false} />
                  <Line type="monotone" dataKey="UNKNOWN" stroke="#94a3b8" strokeWidth={2} dot={alwaysShowDots || hourlyDots ? conditionalDot : false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Sin datos suficientes para graficar.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Clicks por hora (zona {data?.timezone || "local"})</CardTitle>
          </CardHeader>
          <CardContent className="h-[320px]">
            {hourlySeries.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={hourlySeries} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="hour" tickLine={false} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="A" stroke="#7c3aed" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="B" stroke="#0ea5e9" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="C" stroke="#22c55e" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="UNKNOWN" stroke="#94a3b8" strokeWidth={2} dot={false} />
                  <Scatter data={hourlyScatter.A} dataKey="value" fill="#7c3aed" />
                  <Scatter data={hourlyScatter.B} dataKey="value" fill="#0ea5e9" />
                  <Scatter data={hourlyScatter.C} dataKey="value" fill="#22c55e" />
                  <Scatter data={hourlyScatter.UNKNOWN} dataKey="value" fill="#94a3b8" />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Sin datos suficientes para graficar.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Clicks por día de la semana</CardTitle>
        </CardHeader>
        <CardContent className="h-[320px]">
          {weekdaySeries.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weekdaySeries} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="weekday" tickLine={false} tickFormatter={(value) => weekdayLabels[value] ?? value} />
                <YAxis allowDecimals={false} />
                <Tooltip formatter={(value: number, name: string) => [value, name]} labelFormatter={(value) => weekdayLabels[Number(value)] ?? value} />
                <Legend />
                <Line type="monotone" dataKey="A" stroke="#7c3aed" strokeWidth={2} dot={alwaysShowDots || weekdayDots ? conditionalDot : false} />
                <Line type="monotone" dataKey="B" stroke="#0ea5e9" strokeWidth={2} dot={alwaysShowDots || weekdayDots ? conditionalDot : false} />
                <Line type="monotone" dataKey="C" stroke="#22c55e" strokeWidth={2} dot={alwaysShowDots || weekdayDots ? conditionalDot : false} />
                <Line type="monotone" dataKey="UNKNOWN" stroke="#94a3b8" strokeWidth={2} dot={alwaysShowDots || weekdayDots ? conditionalDot : false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Sin datos suficientes para graficar.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Listado de clicks</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-2 py-2">Fecha</th>
                  <th className="px-2 py-2">Variante</th>
                  <th className="px-2 py-2">CTA</th>
                  <th className="px-2 py-2">URL</th>
                  <th className="px-2 py-2">Referrer</th>
                </tr>
              </thead>
              <tbody>
                {formattedEvents.map((event) => (
                  <tr key={event.id} className="border-b">
                    <td className="px-2 py-2 whitespace-nowrap">{event.timestamp}</td>
                    <td className="px-2 py-2 font-medium">{event.variant}</td>
                    <td className="px-2 py-2">{event.cta_id}</td>
                    <td className="px-2 py-2 max-w-[360px] truncate" title={event.location_href}>
                      {event.location_href}
                    </td>
                    <td className="px-2 py-2 max-w-[260px] truncate" title={event.referrer}>
                      {event.referrer}
                    </td>
                  </tr>
                ))}
                {!formattedEvents.length ? (
                  <tr>
                    <td className="px-2 py-6 text-center text-sm text-muted-foreground" colSpan={5}>
                      Sin clicks registrados.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
