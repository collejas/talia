import Link from "next/link"

import {
  fetchCatalogVectorStoreMetrics,
  fetchCatalogVectorStoreStatus,
  type CatalogVectorStoreMetricsBucket,
} from "@/app/settings/productos/actions"
import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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

export default async function ProductosObservabilidadPage() {
  const [status, metrics] = await Promise.all([
    fetchCatalogVectorStoreStatus(),
    fetchCatalogVectorStoreMetrics({ days: 30, limit: 5000 }),
  ])

  const queryEvents = sumByType(metrics.buckets, "query")
  const reindexEvents = sumByType(metrics.buckets, "reindex")
  const topReasons = aggregateByReason(metrics.buckets).slice(0, 8)
  const byDay = aggregateByDay(metrics.buckets).slice(0, 30)

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
      </div>
    </AppViewLayout>
  )
}
