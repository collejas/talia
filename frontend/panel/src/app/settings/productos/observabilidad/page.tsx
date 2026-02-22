import Link from "next/link"

import {
  clearCatalogVectorStoreOrgThresholdsAction,
  fetchCatalogVectorStoreAlertThresholdsHistory,
  fetchCatalogVectorStoreMetrics,
  fetchCatalogVectorStoreStatus,
  fetchCatalogVectorStoreAlertThresholds,
  saveCatalogVectorStoreGlobalThresholdsAction,
  saveCatalogVectorStoreOrgThresholdsAction,
  type CatalogVectorAlertThresholds,
  type CatalogVectorStoreMetricsBucket,
} from "@/app/settings/productos/actions"
import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

function formatDate(value: string | null): string {
  if (!value) {
    return "Sin datos"
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return parsed.toLocaleString("es-MX", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function channelLabel(value: string | null): string {
  if (!value) return "Sin canal"
  const key = value.trim().toLowerCase()
  if (key === "webchat") return "Webchat"
  if (key === "whatsapp") return "WhatsApp"
  if (key === "api") return "API"
  if (key === "backend") return "Backend"
  return value
}

function reasonLabel(value: string | null): string {
  if (!value) return "Sin reason"
  const key = value.trim().toLowerCase()
  const labels: Record<string, string> = {
    fetch_catalog_item_details_fallback: "Fallback fetch detalle",
    prompt_tool_fetch_catalog_item_details_fallback: "Tool fallback asistente",
    catalog_context_autoload: "Autocarga de contexto",
  }
  return labels[key] ?? value
}

function sumByType(buckets: CatalogVectorStoreMetricsBucket[], targetType: string): number {
  const type = targetType.toLowerCase()
  return buckets
    .filter((bucket) => String(bucket.tipo).toLowerCase() === type)
    .reduce((acc, bucket) => acc + (Number.isFinite(bucket.total) ? bucket.total : 0), 0)
}

function aggregateByReason(buckets: CatalogVectorStoreMetricsBucket[]) {
  const grouped = new Map<string, number>()
  for (const bucket of buckets) {
    const reason = reasonLabel(bucket.reason)
    grouped.set(reason, (grouped.get(reason) ?? 0) + bucket.total)
  }
  return Array.from(grouped.entries())
    .map(([reason, total]) => ({ reason, total }))
    .sort((a, b) => b.total - a.total)
}

function aggregateByDay(buckets: CatalogVectorStoreMetricsBucket[]) {
  const grouped = new Map<string, { query: number; reindex: number }>()
  for (const bucket of buckets) {
    const day = bucket.day
    const current = grouped.get(day) ?? { query: 0, reindex: 0 }
    const type = String(bucket.tipo).toLowerCase()
    if (type === "query") {
      current.query += bucket.total
    } else if (type === "reindex") {
      current.reindex += bucket.total
    }
    grouped.set(day, current)
  }
  return Array.from(grouped.entries())
    .map(([day, totals]) => ({ day, ...totals, total: totals.query + totals.reindex }))
    .sort((a, b) => (a.day < b.day ? 1 : -1))
}

function buildDateKey(daysAgo: number): string {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() - daysAgo)
  return date.toISOString().slice(0, 10)
}

function sumQueriesInRange(
  byDayRows: Array<{ day: string; query: number; reindex: number; total: number }>,
  fromDaysAgo: number,
  toDaysAgo: number,
): number {
  const from = buildDateKey(fromDaysAgo)
  const to = buildDateKey(toDaysAgo)
  return byDayRows
    .filter((row) => row.day >= from && row.day <= to)
    .reduce((acc, row) => acc + row.query, 0)
}

type AlertItem = {
  title: string
  detail: string
  severity: "high" | "medium" | "low"
}

function buildAlerts(
  buckets: CatalogVectorStoreMetricsBucket[],
  byDayRows: Array<{ day: string; query: number; reindex: number; total: number }>,
  thresholds: CatalogVectorAlertThresholds,
): AlertItem[] {
  const alerts: AlertItem[] = []
  const totalQueries = sumByType(buckets, "query")
  const fallbackQueries = buckets
    .filter((bucket) => String(bucket.tipo).toLowerCase() === "query")
    .filter((bucket) => (bucket.reason ?? "").toLowerCase().includes("fallback"))
    .reduce((acc, bucket) => acc + bucket.total, 0)
  const fallbackRatio = totalQueries > 0 ? fallbackQueries / totalQueries : 0

  const last7Queries = sumQueriesInRange(byDayRows, 6, 0)
  const previous7Queries = sumQueriesInRange(byDayRows, 13, 7)
  const growthRatio =
    previous7Queries > 0 ? (last7Queries - previous7Queries) / previous7Queries : (last7Queries > 0 ? 1 : 0)

  if (totalQueries >= thresholds.minQueryEvents30d) {
    alerts.push({
      title: "Volumen alto de consultas vectoriales",
      detail: `Se registran ${totalQueries} queries vectoriales en 30 días.`,
      severity: "medium",
    })
  }

  if (
    fallbackRatio >= thresholds.fallbackRatioThreshold
    && fallbackQueries >= thresholds.minFallbackEvents30d
  ) {
    alerts.push({
      title: "Dependencia alta de fallback semántico",
      detail: `${Math.round(fallbackRatio * 100)}% de las queries vectoriales fueron fallback (${fallbackQueries}/${totalQueries}).`,
      severity: "high",
    })
  }

  if (growthRatio >= thresholds.weeklyGrowthRatioThreshold && last7Queries >= thresholds.minWeeklyQueries) {
    alerts.push({
      title: "Crecimiento semanal de costo potencial",
      detail: `Últimos 7 días: ${last7Queries} queries vs ${previous7Queries} en la semana previa.`,
      severity: "medium",
    })
  }

  if (!alerts.length) {
    alerts.push({
      title: "Sin alertas críticas",
      detail: "No se detectan picos significativos con los umbrales actuales.",
      severity: "low",
    })
  }

  return alerts
}

function severityLabel(severity: AlertItem["severity"]): string {
  if (severity === "high") return "Alta"
  if (severity === "medium") return "Media"
  return "Baja"
}

function severityVariant(severity: AlertItem["severity"]): "destructive" | "secondary" | "outline" {
  if (severity === "high") return "destructive"
  if (severity === "medium") return "secondary"
  return "outline"
}

function formatThresholdDiff(
  before: CatalogVectorAlertThresholds | null,
  after: CatalogVectorAlertThresholds | null,
): string {
  if (!before && !after) {
    return "Sin datos"
  }
  if (!before && after) {
    return `Nuevo: q30d=${after.minQueryEvents30d}, fallbackRatio=${after.fallbackRatioThreshold}, fallbackMin=${after.minFallbackEvents30d}, growth=${after.weeklyGrowthRatioThreshold}, weeklyMin=${after.minWeeklyQueries}`
  }
  if (before && !after) {
    return "Override limpiado"
  }
  const prev = before as CatalogVectorAlertThresholds
  const next = after as CatalogVectorAlertThresholds
  const changes: string[] = []
  if (prev.minQueryEvents30d !== next.minQueryEvents30d) {
    changes.push(`q30d ${prev.minQueryEvents30d}->${next.minQueryEvents30d}`)
  }
  if (prev.fallbackRatioThreshold !== next.fallbackRatioThreshold) {
    changes.push(`fallbackRatio ${prev.fallbackRatioThreshold}->${next.fallbackRatioThreshold}`)
  }
  if (prev.minFallbackEvents30d !== next.minFallbackEvents30d) {
    changes.push(`fallbackMin ${prev.minFallbackEvents30d}->${next.minFallbackEvents30d}`)
  }
  if (prev.weeklyGrowthRatioThreshold !== next.weeklyGrowthRatioThreshold) {
    changes.push(`growth ${prev.weeklyGrowthRatioThreshold}->${next.weeklyGrowthRatioThreshold}`)
  }
  if (prev.minWeeklyQueries !== next.minWeeklyQueries) {
    changes.push(`weeklyMin ${prev.minWeeklyQueries}->${next.minWeeklyQueries}`)
  }
  return changes.length ? changes.join(" | ") : "Sin cambios detectados"
}

export default async function ProductosObservabilidadPage() {
  const [status, metrics, thresholdsConfig, thresholdsHistory] = await Promise.all([
    fetchCatalogVectorStoreStatus(),
    fetchCatalogVectorStoreMetrics({ days: 30, limit: 5000 }),
    fetchCatalogVectorStoreAlertThresholds(),
    fetchCatalogVectorStoreAlertThresholdsHistory({ scope: "all", limit: 40 }),
  ])

  const queryEvents = sumByType(metrics.buckets, "query")
  const reindexEvents = sumByType(metrics.buckets, "reindex")
  const topReasons = aggregateByReason(metrics.buckets).slice(0, 8)
  const byDay = aggregateByDay(metrics.buckets).slice(0, 30)
  const alerts = buildAlerts(metrics.buckets, byDay, thresholdsConfig.effectiveThresholds)
  const last7Queries = sumQueriesInRange(byDay, 6, 0)
  const previous7Queries = sumQueriesInRange(byDay, 13, 7)
  const weeklyDelta = last7Queries - previous7Queries

  return (
    <AppViewLayout title="Settings · Observabilidad vectorial">
      <div className="space-y-6 px-4 py-6 lg:px-6">
        <header className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Productos y servicios</p>
          <h1 className="text-2xl font-semibold">Observabilidad vectorial</h1>
          <p className="text-sm text-muted-foreground">
            Métricas de uso de vector store para validar costo, detectar fallback excesivo y ajustar la estrategia SQL-first.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/settings/productos">Volver a productos</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/settings/productos/items">Ir a catálogo</Link>
            </Button>
          </div>
        </header>

        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Eventos 30 días</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{metrics.totalEvents}</p>
              <p className="text-xs text-muted-foreground">Ventana {metrics.fromDate} a {metrics.toDate}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Queries vectoriales</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{queryEvents}</p>
              <p className="text-xs text-muted-foreground">Consultas con embeddings</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Reindex</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{reindexEvents}</p>
              <p className="text-xs text-muted-foreground">Operaciones de indexación</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Último query</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm font-medium">{formatDate(status.lastQueryAt)}</p>
              <p className="text-xs text-muted-foreground">Canal: {channelLabel(status.lastQueryChannel)}</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top reasons (30 días)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {topReasons.length ? (
                  topReasons.map((item) => (
                    <div className="flex items-center justify-between" key={item.reason}>
                      <span className="text-sm text-muted-foreground">{item.reason}</span>
                      <Badge variant="outline">{item.total}</Badge>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Sin eventos registrados.</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Estado de actividad</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="font-medium">Último reindex</p>
                <p className="text-muted-foreground">{formatDate(status.lastReindexAt)}</p>
                <p className="text-muted-foreground">Canal: {channelLabel(status.lastReindexChannel)}</p>
              </div>
              <div>
                <p className="font-medium">Última consulta vectorial</p>
                <p className="text-muted-foreground">{formatDate(status.lastQueryAt)}</p>
                <p className="text-muted-foreground">Canal: {channelLabel(status.lastQueryChannel)}</p>
              </div>
              <div>
                <p className="font-medium">Tendencia semanal (queries)</p>
                <p className="text-muted-foreground">
                  Últimos 7 días: {last7Queries} | Semana previa: {previous7Queries}
                </p>
                <p className="text-muted-foreground">
                  Delta: {weeklyDelta > 0 ? `+${weeklyDelta}` : weeklyDelta}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Alertas automáticas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {alerts.map((alert) => (
              <div key={`${alert.title}-${alert.detail}`} className="flex items-start justify-between gap-3 rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium">{alert.title}</p>
                  <p className="text-sm text-muted-foreground">{alert.detail}</p>
                </div>
                <Badge variant={severityVariant(alert.severity)}>{severityLabel(alert.severity)}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Umbrales globales (todas las organizaciones)</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={saveCatalogVectorStoreGlobalThresholdsAction} className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="global_min_query_events_30d">Min. queries 30d</Label>
                    <Input
                      id="global_min_query_events_30d"
                      name="min_query_events_30d"
                      type="number"
                      min={1}
                      defaultValue={thresholdsConfig.globalThresholds.minQueryEvents30d}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="global_fallback_ratio_threshold">Ratio fallback (0-1)</Label>
                    <Input
                      id="global_fallback_ratio_threshold"
                      name="fallback_ratio_threshold"
                      type="number"
                      min={0}
                      max={1}
                      step="0.01"
                      defaultValue={thresholdsConfig.globalThresholds.fallbackRatioThreshold}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="global_min_fallback_events_30d">Min. fallback 30d</Label>
                    <Input
                      id="global_min_fallback_events_30d"
                      name="min_fallback_events_30d"
                      type="number"
                      min={1}
                      defaultValue={thresholdsConfig.globalThresholds.minFallbackEvents30d}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="global_weekly_growth_ratio_threshold">Crecimiento semanal (ratio)</Label>
                    <Input
                      id="global_weekly_growth_ratio_threshold"
                      name="weekly_growth_ratio_threshold"
                      type="number"
                      min={0}
                      step="0.01"
                      defaultValue={thresholdsConfig.globalThresholds.weeklyGrowthRatioThreshold}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="global_min_weekly_queries">Min. queries semanales</Label>
                    <Input
                      id="global_min_weekly_queries"
                      name="min_weekly_queries"
                      type="number"
                      min={1}
                      defaultValue={thresholdsConfig.globalThresholds.minWeeklyQueries}
                    />
                  </div>
                </div>
                <Button type="submit" size="sm">Guardar umbrales globales</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Override por organización (esta organización)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <form action={saveCatalogVectorStoreOrgThresholdsAction} className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="org_min_query_events_30d">Min. queries 30d</Label>
                    <Input
                      id="org_min_query_events_30d"
                      name="min_query_events_30d"
                      type="number"
                      min={1}
                      defaultValue={thresholdsConfig.effectiveThresholds.minQueryEvents30d}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="org_fallback_ratio_threshold">Ratio fallback (0-1)</Label>
                    <Input
                      id="org_fallback_ratio_threshold"
                      name="fallback_ratio_threshold"
                      type="number"
                      min={0}
                      max={1}
                      step="0.01"
                      defaultValue={thresholdsConfig.effectiveThresholds.fallbackRatioThreshold}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="org_min_fallback_events_30d">Min. fallback 30d</Label>
                    <Input
                      id="org_min_fallback_events_30d"
                      name="min_fallback_events_30d"
                      type="number"
                      min={1}
                      defaultValue={thresholdsConfig.effectiveThresholds.minFallbackEvents30d}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="org_weekly_growth_ratio_threshold">Crecimiento semanal (ratio)</Label>
                    <Input
                      id="org_weekly_growth_ratio_threshold"
                      name="weekly_growth_ratio_threshold"
                      type="number"
                      min={0}
                      step="0.01"
                      defaultValue={thresholdsConfig.effectiveThresholds.weeklyGrowthRatioThreshold}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="org_min_weekly_queries">Min. queries semanales</Label>
                    <Input
                      id="org_min_weekly_queries"
                      name="min_weekly_queries"
                      type="number"
                      min={1}
                      defaultValue={thresholdsConfig.effectiveThresholds.minWeeklyQueries}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" size="sm">Guardar override</Button>
                  <Button type="submit" size="sm" variant="outline" formAction={clearCatalogVectorStoreOrgThresholdsAction}>
                    Limpiar override
                  </Button>
                </div>
              </form>
              <p className="text-xs text-muted-foreground">
                Estado override: {thresholdsConfig.organizationThresholds ? "activo" : "usa global"}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Desglose diario</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Query</TableHead>
                  <TableHead className="text-right">Reindex</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byDay.length ? (
                  byDay.map((row) => (
                    <TableRow key={row.day}>
                      <TableCell>{row.day}</TableCell>
                      <TableCell className="text-right">{row.query}</TableCell>
                      <TableCell className="text-right">{row.reindex}</TableCell>
                      <TableCell className="text-right font-medium">{row.total}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      Sin actividad en la ventana seleccionada.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Historial de umbrales</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Acción</TableHead>
                  <TableHead>Cambio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {thresholdsHistory.length ? (
                  thresholdsHistory.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>{formatDate(entry.createdAt)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {entry.scope === "global" ? "Global" : "Organización"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {entry.changedByName ?? entry.changedBy ?? "Sistema"}
                      </TableCell>
                      <TableCell>{entry.action}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatThresholdDiff(entry.before, entry.after)}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      Sin historial de cambios de umbrales.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppViewLayout>
  )
}
