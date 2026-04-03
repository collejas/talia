"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { IconLoader, IconRefresh } from "@tabler/icons-react"
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
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
                <Line type="monotone" dataKey="A" stroke="#7c3aed" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="B" stroke="#0ea5e9" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="C" stroke="#22c55e" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="UNKNOWN" stroke="#94a3b8" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Sin datos suficientes para graficar.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
