"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { IconAlertTriangle, IconLoader, IconRefresh } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import {
  getContactoMetrics,
  type ContactoMetrics,
} from "@/lib/prospeccion/prospectos-client"

const canalLabel: Record<string, string> = {
  correo: "Correo",
  whatsapp: "WhatsApp",
  llamada: "Llamada",
  voz: "Voz",
}

const estadoPalette: Record<string, string> = {
  enviado: "text-emerald-600",
  entregado: "text-emerald-600",
  pendiente: "text-amber-600",
  procesando: "text-amber-600",
  fallido: "text-rose-600",
  error: "text-rose-600",
  cancelado: "text-slate-500",
  omitido: "text-slate-500",
}

export function CampanasMetricsClient() {
  const [data, setData] = useState<ContactoMetrics | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchMetrics = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await getContactoMetrics()
      setData(response)
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudieron cargar las métricas."
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchMetrics()
  }, [fetchMetrics])

  const entries = useMemo(() => Object.entries(data?.canales ?? {}), [data])

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle className="text-base font-semibold">Salud por canal</CardTitle>
          <p className="text-sm text-muted-foreground">
            Totales acumulados de envíos desde que se reinició el worker.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void fetchMetrics()} disabled={loading}>
          <IconRefresh className={cn("mr-2 size-4", loading && "animate-spin")} />
          Actualizar
        </Button>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="mb-4 flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <IconAlertTriangle className="size-4" />
            <span>{error}</span>
          </div>
        ) : null}
        {!entries.length && !loading ? (
          <p className="text-sm text-muted-foreground">Aún no hay métricas registradas.</p>
        ) : null}
        {entries.length ? (
          <div className="grid gap-4 md:grid-cols-3">
            {entries.map(([canal, valores]) => (
              <div key={canal} className="rounded-lg border p-4">
                <div className="text-sm font-semibold">
                  {canalLabel[canal] ?? canal}
                </div>
                <div className="text-2xl font-bold">{valores.totales}</div>
                <Separator className="my-3" />
                <div className="space-y-1 text-sm">
                  {Object.entries(valores.por_estado).map(([estado, count]) => (
                    <div key={`${canal}-${estado}`} className="flex items-center justify-between text-muted-foreground">
                      <span className={estadoPalette[estado] ?? "text-muted-foreground"}>{estado}</span>
                      <span>{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}
        {loading ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <IconLoader className="size-4 animate-spin" /> Actualizando métricas...
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
