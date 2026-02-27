"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { IconAlertTriangle, IconLoader, IconRefresh, IconRepeat } from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  cancelarContactoBatch,
  getContactoBatchResumen,
  getContactoMetrics,
  listContactoBatches,
  listContactoEnvios,
  listContactoLogs,
  listProspectosQueryMetadata,
  reintentarContactoEnvio,
  type ContactoBatch,
  type ContactoBatchResumen,
  type ContactoEnvio,
  type ContactoLog,
  type ContactoMetrics,
} from "@/lib/prospeccion/prospectos-client"
import { cn } from "@/lib/utils"

const estadoVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  pendiente: "secondary",
  completado: "default",
  cancelado: "outline",
  error: "destructive",
}

const canalLabel: Record<string, string> = {
  correo: "Correo",
  whatsapp: "WhatsApp",
  llamada: "Llamada",
}

const fuenteLabel: Record<string, string> = {
  google_places: "Google Places",
  denue: "DENUE",
  usuario: "Usuario",
}

const envioEstadoVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  pendiente: "secondary",
  procesando: "secondary",
  enviado: "default",
  entregado: "default",
  fallido: "destructive",
  error: "destructive",
  omitido: "outline",
}

const RETRYABLE_ESTADOS = new Set(["error", "fallido", "omitido"])

export default function ContactosPageClient() {
  const [batches, setBatches] = useState<ContactoBatch[]>([])
  const [batchError, setBatchError] = useState<string | null>(null)
  const [batchLoading, setBatchLoading] = useState(false)
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null)
  const [envios, setEnvios] = useState<ContactoEnvio[]>([])
  const [envioLoading, setEnvioLoading] = useState(false)
  const [envioError, setEnvioError] = useState<string | null>(null)
  const [batchSummary, setBatchSummary] = useState<ContactoBatchResumen | null>(null)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [retryingEnvioId, setRetryingEnvioId] = useState<string | null>(null)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [queryLabelMap, setQueryLabelMap] = useState<Record<string, string>>({})

  const fetchBatches = useCallback(async () => {
    setBatchLoading(true)
    setBatchError(null)
    try {
      const response = await listContactoBatches({ limit: 20 })
      setBatches(response.items ?? [])
      if (!selectedBatchId && response.items?.length) {
        setSelectedBatchId(response.items[0].id)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudieron cargar los lotes."
      setBatchError(message)
    } finally {
      setBatchLoading(false)
    }
  }, [selectedBatchId])

  const [metrics, setMetrics] = useState<ContactoMetrics | null>(null)
  const [metricsError, setMetricsError] = useState<string | null>(null)
  const [logs, setLogs] = useState<ContactoLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsError, setLogsError] = useState<string | null>(null)

  const fetchBatchSummary = useCallback(async (batchId: string | null) => {
    if (!batchId) {
      setBatchSummary(null)
      setSummaryError(null)
      return
    }
    try {
      const response = await getContactoBatchResumen(batchId)
      setBatchSummary(response)
      setSummaryError(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo cargar el resumen del lote."
      setSummaryError(message)
    }
  }, [])

  const fetchMetrics = useCallback(async () => {
    try {
      const response = await getContactoMetrics()
      setMetrics(response)
      setMetricsError(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudieron cargar las métricas."
      setMetricsError(message)
    }
  }, [])

  const fetchLogs = useCallback(async (batchId: string | null) => {
    if (!batchId) {
      setLogs([])
      setLogsError(null)
      return
    }
    setLogsLoading(true)
    setLogsError(null)
    try {
      const response = await listContactoLogs({ batch_id: batchId, limit: 200 })
      setLogs(response.items ?? [])
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo cargar la bitácora del lote."
      setLogsError(message)
      setLogs([])
    } finally {
      setLogsLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchBatches()
    void fetchMetrics()
  }, [fetchBatches, fetchMetrics])

  useEffect(() => {
    let cancelled = false
    const loadQueryLabels = async () => {
      const values = Array.from(new Set(batches.flatMap((batch) => extractBatchQueryValues(batch))))
      if (!values.length) {
        setQueryLabelMap({})
        return
      }
      try {
        const response = await listProspectosQueryMetadata({ queries: values })
        if (cancelled) return
        const next: Record<string, string> = {}
        ;(response.queries ?? []).forEach((item) => {
          if (!item?.value) return
          next[item.value] = item.label || item.value
        })
        setQueryLabelMap(next)
      } catch {
        if (!cancelled) {
          setQueryLabelMap({})
        }
      }
    }
    void loadQueryLabels()
    return () => {
      cancelled = true
    }
  }, [batches])

  const fetchEnvios = useCallback(
    async (batchId: string | null) => {
      if (!batchId) {
        setEnvios([])
        return
      }
      setEnvioLoading(true)
      setEnvioError(null)
      try {
        const response = await listContactoEnvios({ batch_id: batchId, limit: 100 })
        setEnvios(response.items ?? [])
      } catch (err) {
        const message = err instanceof Error ? err.message : "No se pudieron cargar los envíos."
        setEnvioError(message)
        setEnvios([])
      } finally {
        setEnvioLoading(false)
      }
    },
    []
  )

  const handleRetryEnvio = useCallback(
    async (envioId: string) => {
      if (!selectedBatchId) return
      setRetryingEnvioId(envioId)
      setEnvioError(null)
      try {
        await reintentarContactoEnvio(envioId)
        await fetchEnvios(selectedBatchId)
        await fetchBatchSummary(selectedBatchId)
        await fetchLogs(selectedBatchId)
      } catch (err) {
        const message = err instanceof Error ? err.message : "No se pudo reintentar el envío."
        setEnvioError(message)
      } finally {
        setRetryingEnvioId(null)
      }
    },
    [fetchBatchSummary, fetchEnvios, fetchLogs, selectedBatchId]
  )

  const handleCancelBatch = useCallback(async () => {
    if (!selectedBatchId) return
    setCancelLoading(true)
    setCancelError(null)
    try {
      await cancelarContactoBatch(selectedBatchId)
      await fetchBatchSummary(selectedBatchId)
      await fetchEnvios(selectedBatchId)
      await fetchLogs(selectedBatchId)
      await fetchBatches()
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo cancelar el lote."
      setCancelError(message)
    } finally {
      setCancelLoading(false)
    }
  }, [fetchBatchSummary, fetchBatches, fetchEnvios, fetchLogs, selectedBatchId])

  useEffect(() => {
    if (!selectedBatchId) {
      setBatchSummary(null)
      setEnvios([])
      setLogs([])
      setLogsError(null)
      return
    }
    void fetchBatchSummary(selectedBatchId)
    void fetchEnvios(selectedBatchId)
    void fetchLogs(selectedBatchId)
    const source = new EventSource(`/api/prospeccion/contacto/batches/${selectedBatchId}/stream`)
    source.onmessage = (event) => {
      if (!event?.data) return
      try {
        const payload = JSON.parse(event.data) as { type?: string }
        if (payload?.type === "ping" || payload?.type === "connected") {
          return
        }
        if (payload?.type === "batch") {
          void fetchBatches()
          void fetchMetrics()
        }
      } catch {
        return
      }
      void fetchBatchSummary(selectedBatchId)
      void fetchEnvios(selectedBatchId)
      void fetchLogs(selectedBatchId)
    }
    source.onerror = () => {
      source.close()
    }
    return () => {
      source.close()
    }
  }, [fetchBatchSummary, fetchEnvios, fetchLogs, fetchBatches, fetchMetrics, selectedBatchId])

  const selectedBatch = useMemo(() => batches.find((batch) => batch.id === selectedBatchId) ?? null, [
    batches,
    selectedBatchId,
  ])
  const canCancelBatch =
    selectedBatch && !["completado", "cancelado"].includes(selectedBatch.estado ?? "")

  const metricEntries = metrics?.canales ? Object.entries(metrics.canales) : []
  const conversionEntries = useMemo(() => {
    const rows = metrics?.conversion_por_fuente ?? []
    const sourceOrder = ["google_places", "denue", "usuario"]
    return [...rows].sort((a, b) => sourceOrder.indexOf(a.fuente) - sourceOrder.indexOf(b.fuente))
  }, [metrics?.conversion_por_fuente])

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base font-semibold">Lotes recientes</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => void fetchBatches()} disabled={batchLoading}>
            <IconRefresh className={cn("mr-1.5 size-4", batchLoading && "animate-spin")} />
            Actualizar
          </Button>
        </CardHeader>
        <CardContent>
          {batchError ? (
            <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <IconAlertTriangle className="size-4" />
              <span>{batchError}</span>
            </div>
          ) : null}
          <div className="mt-4 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lote</TableHead>
                  <TableHead>Canales</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Creado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batchLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                      <IconLoader className="mr-2 inline size-4 animate-spin" /> Cargando lotes...
                    </TableCell>
                  </TableRow>
                ) : null}
                {!batchLoading && !batches.length ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                      Aún no hay envíos registrados.
                    </TableCell>
                  </TableRow>
                ) : null}
                {!batchLoading
                  ? batches.map((batch) => (
                        <TableRow
                        key={batch.id}
                        className={cn("cursor-pointer", selectedBatchId === batch.id && "bg-muted/50")}
                        onClick={() => setSelectedBatchId(batch.id)}
                      >
                        <TableCell className="font-medium">
                          <div>{batchLabel(batch)}</div>
                          {resolveBatchQueryLabel(batch, queryLabelMap) ? (
                            <p className="text-xs font-normal text-muted-foreground">
                              Consulta: {resolveBatchQueryLabel(batch, queryLabelMap)}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell className="space-x-1">
                          {batch.canales.map((canal) => (
                            <Badge key={canal} variant="outline">
                              {canalLabel[canal] ?? canal}
                            </Badge>
                          ))}
                        </TableCell>
                        <TableCell>{batch.total_prospectos}</TableCell>
                        <TableCell>
                          <Badge variant={estadoVariant[batch.estado] ?? "default"}>{batch.estado}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatDate(batch.creado_en)}</TableCell>
                      </TableRow>
                    ))
                  : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Salud por canal</CardTitle>
        </CardHeader>
        <CardContent>
          {metricsError ? (
            <div className="mb-4 flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <IconAlertTriangle className="size-4" />
              <span>{metricsError}</span>
            </div>
          ) : null}
          {metricEntries.length ? (
            <div className="grid gap-4 md:grid-cols-3">
              {metricEntries.map(([canal, data]) => (
                <div key={canal} className="rounded-lg border p-4">
                  <div className="text-sm font-semibold">{canalLabel[canal] ?? canal}</div>
                  <div className="text-2xl font-bold">{data.totales}</div>
                  <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                    {Object.entries(data.por_estado).map(([estado, count]) => (
                      <div key={estado} className="flex items-center justify-between">
                        <span>{estado}</span>
                        <span>{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Aún no hay métricas registradas.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Conversión por fuente</CardTitle>
        </CardHeader>
        <CardContent>
          {conversionEntries.length ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fuente</TableHead>
                    <TableHead className="text-right">Prospectos</TableHead>
                    <TableHead className="text-right">Contactados</TableHead>
                    <TableHead className="text-right">% Contacto</TableHead>
                    <TableHead className="text-right">Convertidos</TableHead>
                    <TableHead className="text-right">% Conversión</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {conversionEntries.map((item) => (
                    <TableRow key={item.fuente}>
                      <TableCell className="font-medium">{fuenteLabel[item.fuente] ?? item.fuente}</TableCell>
                      <TableCell className="text-right">{item.total_prospectos}</TableCell>
                      <TableCell className="text-right">{item.prospectos_contactados}</TableCell>
                      <TableCell className="text-right">{formatPercent(item.conversion_contacto_pct)}</TableCell>
                      <TableCell className="text-right">{item.prospectos_convertidos}</TableCell>
                      <TableCell className="text-right">{formatPercent(item.conversion_convertido_pct)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Aún no hay datos de conversión por fuente.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base font-semibold">
            {selectedBatch ? `Envíos del lote ${selectedBatch.id}` : "Selecciona un lote"}
          </CardTitle>
          {selectedBatch && canCancelBatch ? (
            <Button variant="destructive" size="sm" onClick={() => void handleCancelBatch()} disabled={cancelLoading}>
              {cancelLoading ? (
                <>
                  <IconLoader className="mr-2 size-4 animate-spin" />
                  Cancelando...
                </>
              ) : (
                "Cancelar lote"
              )}
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          {cancelError ? (
            <div className="mb-4 flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <IconAlertTriangle className="size-4" />
              <span>{cancelError}</span>
            </div>
          ) : null}
          {summaryError ? (
            <div className="mb-4 flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <IconAlertTriangle className="size-4" />
              <span>{summaryError}</span>
            </div>
          ) : null}
          {batchSummary ? (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {Object.entries(batchSummary.totales).map(([estado, count]) => (
                <Badge key={estado} variant={envioEstadoVariant[estado] ?? "outline"}>
                  {estado}: {count}
                </Badge>
              ))}
              <span className="text-xs text-muted-foreground">
                Total envíos: {batchSummary.total_envios}
              </span>
            </div>
          ) : null}
          {envioError ? (
            <div className="mb-4 flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <IconAlertTriangle className="size-4" />
              <span>{envioError}</span>
            </div>
          ) : null}
          {selectedBatch ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                <TableRow>
                  <TableHead>Prospecto</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Detalle</TableHead>
                  <TableHead className="text-right">Procesado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
                <TableBody>
                  {envioLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                        <IconLoader className="mr-2 inline size-4 animate-spin" /> Cargando envíos...
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {!envioLoading && !envios.length ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                        El lote aún no tiene envíos registrados.
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {!envioLoading
                    ? envios.map((envio) => (
                        <TableRow key={envio.id}>
                          <TableCell>
                            <div className="font-medium">{prospectoLabel(envio)}</div>
                            <p className="text-xs text-muted-foreground">{envio.prospecto_id}</p>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{canalLabel[envio.canal] ?? envio.canal}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={envioEstadoVariant[envio.estado] ?? "default"}>{envio.estado}</Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {envio.detalle && typeof envio.detalle.reason === "string"
                              ? (envio.detalle.reason as string)
                              : ""}
                          </TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">
                            {formatDate(envio.procesado_en || envio.programado_en)}
                          </TableCell>
                          <TableCell className="text-right">
                            {RETRYABLE_ESTADOS.has(envio.estado) ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => void handleRetryEnvio(envio.id)}
                                disabled={retryingEnvioId === envio.id}
                              >
                                <IconRepeat className="mr-1.5 size-4" />
                                {retryingEnvioId === envio.id ? "Reintentando..." : "Reintentar"}
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    : null}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Selecciona un lote para ver sus envíos.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base font-semibold">Timeline del lote</CardTitle>
            <p className="text-sm text-muted-foreground">
              Eventos detallados registrados en la bitácora (Brevo/Twilio/voz) para el lote seleccionado.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => selectedBatchId && void fetchLogs(selectedBatchId)}
            disabled={!selectedBatchId || logsLoading}
          >
            <IconRefresh className={cn("mr-1.5 size-4", logsLoading && "animate-spin")} />
            Actualizar
          </Button>
        </CardHeader>
        <CardContent>
          {logsError ? (
            <div className="mb-4 flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <IconAlertTriangle className="size-4" />
              <span>{logsError}</span>
            </div>
          ) : null}
          {!selectedBatchId ? (
            <p className="text-sm text-muted-foreground">Selecciona un lote para consultar su timeline.</p>
          ) : null}
          {selectedBatchId ? (
            logs.length ? (
              <ol className="space-y-3">
                {logs.map((log) => (
                  <li key={log.id} className="rounded-lg border bg-muted/40 p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{canalLabel[log.canal] ?? log.canal}</Badge>
                        <span className="font-medium">{log.accion ?? "Evento"}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant={envioEstadoVariant[log.estado] ?? "outline"} className="capitalize">
                          {log.estado}
                        </Badge>
                        <span>{formatDate(log.creado_en)}</span>
                      </div>
                    </div>
                    {log.envio_id ? (
                      <p className="mt-1 text-xs text-muted-foreground">Envio: {log.envio_id}</p>
                    ) : null}
                    {log.detalle ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatLogMessage(log.detalle) || "Sin mensaje adicional."}
                      </p>
                    ) : null}
                    {log.error ? (
                      <p className="mt-1 text-xs text-destructive">Error: {log.error}</p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {extractLogHighlights(log.detalle).map((item) => (
                        <span
                          key={`${log.id}-${item.label}`}
                          className="rounded-full bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground"
                        >
                          {item.label}: <span className="text-foreground">{item.value}</span>
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
              </ol>
            ) : logsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <IconLoader className="size-4 animate-spin" /> Cargando eventos...
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Este lote aún no tiene eventos registrados.</p>
            )
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

function formatDate(value?: string | null) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}

function batchLabel(batch: ContactoBatch): string {
  const canales = batch.canales.map((canal) => canalLabel[canal] ?? canal).join(", ")
  const created = formatDate(batch.creado_en)
  return `${canales || "Lote"} · ${created}`
}

function prospectoLabel(envio: ContactoEnvio): string {
  const detalle = envio.detalle
  const displayName = detalle && typeof detalle["display_name"] === "string" ? detalle["display_name"] : null
  if (displayName) return displayName
  const email = detalle && typeof detalle["email"] === "string" ? detalle["email"] : null
  if (email) return email
  return "Prospecto sin nombre"
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "0%"
  return `${value.toFixed(2)}%`
}

function formatLogMessage(detalle?: Record<string, unknown> | null): string {
  if (!detalle || typeof detalle !== "object") {
    return ""
  }
  const message = detalle["message"]
  if (typeof message === "string" && message.trim()) {
    return message.trim()
  }
  const status = detalle["status"]
  if (typeof status === "string" && status.trim()) {
    return `Estado reportado: ${status.trim()}`
  }
  return ""
}

function extractLogHighlights(detalle?: Record<string, unknown> | null) {
  if (!detalle || typeof detalle !== "object") {
    return []
  }
  const mapping: Array<[string, string]> = [
    ["brevo_message_id", "Brevo"],
    ["message_id", "Mensaje"],
    ["mensaje_id", "Mensaje"],
    ["whatsapp_sid", "WhatsApp SID"],
    ["call_sid", "Call SID"],
    ["twilio_sid", "Twilio SID"],
    ["provider_message_id", "Provider ID"],
  ]
  const highlights: Array<{ label: string; value: string }> = []
  for (const [key, label] of mapping) {
    const value = detalle[key]
    if (typeof value === "string" && value.trim()) {
      highlights.push({ label, value: value.trim() })
    }
  }
  return highlights
}

function normalizeBusquedaLabel(value: unknown): string | null {
  if (typeof value !== "string") return null
  const base = value.trim()
  if (!base) return null
  const cleaned = base.replace(/\s*\(recuperada desde resultados\)\s*/gi, "").trim()
  return cleaned || null
}

function sanitizeQueryDisplayLabel(value: unknown): string | null {
  const normalized = normalizeBusquedaLabel(value)
  if (!normalized) return null
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    return null
  }
  return normalized
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function extractBatchQueryValues(batch: ContactoBatch): string[] {
  const values: string[] = []
  const filters = isRecord(batch.filtros) ? batch.filtros : null
  if (!filters) return values
  const queryFilters = filters["query_filters"]
  if (Array.isArray(queryFilters)) {
    queryFilters.forEach((item) => {
      const normalized = normalizeBusquedaLabel(item)
      if (normalized) values.push(normalized)
    })
  }
  const metadataQueries = filters["metadata_queries"]
  if (Array.isArray(metadataQueries)) {
    metadataQueries.forEach((item) => {
      const normalized = normalizeBusquedaLabel(item)
      if (normalized) values.push(normalized)
    })
  }
  ;["query", "busqueda_query", "busqueda_id"].forEach((key) => {
    const normalized = normalizeBusquedaLabel(filters[key])
    if (normalized) values.push(normalized)
  })
  return values
}

function resolveBatchQueryLabel(batch: ContactoBatch, labelMap: Record<string, string>): string | null {
  const values = extractBatchQueryValues(batch)
  if (!values.length) return null
  const labels = values.map((value) => sanitizeQueryDisplayLabel(labelMap[value] ?? value)).filter(Boolean) as string[]
  if (!labels.length) return null
  const unique = Array.from(new Set(labels))
  if (unique.length <= 2) return unique.join(", ")
  return `${unique.slice(0, 2).join(", ")} +${unique.length - 2}`
}
