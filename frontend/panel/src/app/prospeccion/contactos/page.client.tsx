"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { IconAlertTriangle, IconLoader, IconRefresh } from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  listContactoBatches,
  listContactoEnvios,
  type ContactoBatch,
  type ContactoEnvio,
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

export default function ContactosPageClient() {
  const [batches, setBatches] = useState<ContactoBatch[]>([])
  const [batchError, setBatchError] = useState<string | null>(null)
  const [batchLoading, setBatchLoading] = useState(false)
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null)
  const [envios, setEnvios] = useState<ContactoEnvio[]>([])
  const [envioLoading, setEnvioLoading] = useState(false)
  const [envioError, setEnvioError] = useState<string | null>(null)

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

  useEffect(() => {
    void fetchBatches()
  }, [fetchBatches])

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

  useEffect(() => {
    void fetchEnvios(selectedBatchId)
  }, [fetchEnvios, selectedBatchId])

  const selectedBatch = useMemo(() => batches.find((batch) => batch.id === selectedBatchId) ?? null, [
    batches,
    selectedBatchId,
  ])

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
                        <TableCell className="font-medium">{batchLabel(batch)}</TableCell>
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
          <CardTitle className="text-base font-semibold">
            {selectedBatch ? `Envíos del lote ${selectedBatch.id}` : "Selecciona un lote"}
          </CardTitle>
        </CardHeader>
        <CardContent>
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {envioLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                        <IconLoader className="mr-2 inline size-4 animate-spin" /> Cargando envíos...
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {!envioLoading && !envios.length ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
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
                            <Badge variant={estadoVariant[envio.estado] ?? "default"}>{envio.estado}</Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {envio.detalle && typeof envio.detalle.reason === "string"
                              ? (envio.detalle.reason as string)
                              : ""}
                          </TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">
                            {formatDate(envio.procesado_en || envio.programado_en)}
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
