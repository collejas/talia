"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { IconAlertTriangle, IconCopy, IconLoader, IconRefresh, IconTargetArrow, IconX } from "@tabler/icons-react"

import { ProspeccionCampaignWizard, type ProspeccionWizardPreset } from "@/components/prospeccion/prospeccion-campaign-wizard"
import {
  ProspeccionContactDrawer,
  type ProspeccionContactDrawerData,
} from "@/components/prospeccion/prospeccion-contact-drawer"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import {
  getContactoMetrics,
  getProspeccionCampanaPreset,
  getProspeccionCampanas,
  type ContactoMetrics,
  type ProspeccionCampanaGroup,
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

type CampanaChannelRaw = {
  enabled?: boolean
  templateSlug?: string | null
  subject?: string | null
  body?: string | null
  message?: string | null
  schedule?: string | null
}

type CampanaChannelPresetEntry = {
  enabled?: boolean
  templateSlug?: string
  subject?: string
  body?: string
  message?: string
  schedule?: string
}

type CampanaChannelPreset = Partial<Record<"correo" | "whatsapp" | "llamada", CampanaChannelPresetEntry>>

export function CampanasMetricsClient() {
  const [data, setData] = useState<ContactoMetrics | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [campanas, setCampanas] = useState<ProspeccionCampanaGroup[]>([])
  const [campanasLoading, setCampanasLoading] = useState(false)
  const [campanasError, setCampanasError] = useState<string | null>(null)
  const [duplicateLoading, setDuplicateLoading] = useState<string | null>(null)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardPreset, setWizardPreset] = useState<ProspeccionWizardPreset | null>(null)
  const [drawerData, setDrawerData] = useState<ProspeccionContactDrawerData | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [banner, setBanner] = useState<{ type: "success" | "error"; message: string } | null>(null)

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

  const fetchCampanas = useCallback(async () => {
    setCampanasLoading(true)
    setCampanasError(null)
    try {
      const response = await getProspeccionCampanas(12)
      setCampanas(response.items ?? [])
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudieron cargar las campañas recientes."
      setCampanasError(message)
    } finally {
      setCampanasLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchCampanas()
  }, [fetchCampanas])

  const handleNewCampaign = useCallback(() => {
    setWizardPreset({ source: "lista" })
    setWizardOpen(true)
  }, [])

  const handleDuplicateCampana = useCallback(
    async (campanaId: string) => {
      setBanner(null)
      setDuplicateLoading(campanaId)
      try {
        const response = await getProspeccionCampanaPreset(campanaId)
        const canalesRaw = (response.defaults?.canales ?? {}) as Partial<
          Record<"correo" | "whatsapp" | "llamada", CampanaChannelRaw>
        >
        const canalesPreset: CampanaChannelPreset = {}
        const programacion = response.defaults?.programacion ?? {}
        ;(["correo", "whatsapp", "llamada"] as const).forEach((canal) => {
          const config = canalesRaw[canal]
          if (!config) return
          canalesPreset[canal] = {
            enabled: config.enabled ?? true,
            templateSlug: config.templateSlug ?? undefined,
            subject: config.subject ?? undefined,
            body: config.body ?? undefined,
            message: config.message ?? undefined,
            schedule: config.schedule ?? programacion[canal] ?? undefined,
          }
        })
        setWizardPreset({
          source: response.defaults?.source,
          listaId: response.defaults?.lista_id ?? null,
          filtros: response.defaults?.filtros,
          canales: canalesPreset,
          titulo: response.defaults?.titulo ?? "",
          campanaId: response.defaults?.campana_id ?? response.campana?.id ?? null,
          campanaNombre: response.campana?.nombre ?? undefined,
        })
        setWizardOpen(true)
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "No se pudo preparar la duplicación. Verifica que la campaña tenga al menos un lote."
        setBanner({ type: "error", message })
      } finally {
        setDuplicateLoading(null)
      }
    },
    []
  )

  const handleWizardCompleted = useCallback(
    (result: {
      batchId?: string | null
      contactos?: ProspeccionContactDrawerData["results"]
      omitidos?: ProspeccionContactDrawerData["omitidos"]
      total?: number
    }) => {
      setBanner({
        type: "success",
        message: `Lote programado correctamente${result.total ? ` para ${result.total} prospectos` : ""}.`,
      })
      setDrawerData({
        batchId: result.batchId,
        results: result.contactos ?? [],
        omitidos: result.omitidos,
      })
      setDrawerOpen(true)
      void fetchCampanas()
    },
    [fetchCampanas]
  )

  const dismissBanner = useCallback(() => setBanner(null), [])

  return (
    <div className="space-y-6">
      {banner ? (
        <div
          className={cn(
            "flex items-center justify-between rounded-md border px-3 py-2 text-sm",
            banner.type === "success"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200"
              : "border-destructive/40 bg-destructive/10 text-destructive"
          )}
        >
          <span>{banner.message}</span>
          <Button variant="ghost" size="icon" className="size-6" onClick={dismissBanner}>
            <IconX className="size-4" />
          </Button>
        </div>
      ) : null}

      <Card className="bg-gradient-to-br from-primary/10 via-background to-background">
        <CardHeader className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <CardTitle className="text-base font-semibold">Lanza una nueva campaña</CardTitle>
            <p className="text-sm text-muted-foreground">
              Define filtros, selecciona plantillas y programa envíos multicanal desde un solo wizard.
            </p>
          </div>
          <Button onClick={handleNewCampaign}>
            <IconTargetArrow className="mr-2 size-4" />
            Crear campaña
          </Button>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm text-muted-foreground md:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-wide">Audiencias</p>
            <p className="text-base text-foreground">Listas inteligentes o filtros dinámicos.</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide">Canales</p>
            <p className="text-base text-foreground">Correo, WhatsApp y llamadas coordinadas.</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide">Seguimiento</p>
            <p className="text-base text-foreground">Monitorea resultados en Contactos y KPIs.</p>
          </div>
        </CardContent>
      </Card>

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
                  <div className="text-sm font-semibold">{canalLabel[canal] ?? canal}</div>
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

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base font-semibold">Campañas recientes</CardTitle>
            <p className="text-sm text-muted-foreground">Agrupadas por campana y con conteo de estados por lote.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void fetchCampanas()} disabled={campanasLoading}>
            <IconRefresh className={cn("mr-2 size-4", campanasLoading && "animate-spin")} />
            Actualizar
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {campanasError ? (
            <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <IconAlertTriangle className="size-4" />
              <span>{campanasError}</span>
            </div>
          ) : null}
          {!campanas.length && !campanasLoading ? (
            <p className="text-sm text-muted-foreground">Aún no tienes campañas registradas.</p>
          ) : null}
          {campanas.map((group, index) => (
            <div key={group.campana_id ?? `sin-${index}`} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{group.campana_nombre ?? "Sin campaña"}</p>
                  <p className="text-xs text-muted-foreground">
                    {group.batches.length} lote{group.batches.length === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  {Object.entries(group.totales).map(([estado, count]) => (
                    <Badge key={`${group.campana_id ?? "sin"}-${estado}`} variant="outline">
                      {estado}: {count}
                    </Badge>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!group.campana_id || duplicateLoading === group.campana_id}
                  onClick={() => group.campana_id && void handleDuplicateCampana(group.campana_id)}
                >
                  {duplicateLoading === group.campana_id ? (
                    <IconLoader className="mr-2 size-4 animate-spin" />
                  ) : (
                    <IconCopy className="mr-2 size-4" />
                  )}
                  Duplicar
                </Button>
              </div>
              <div className="mt-4 space-y-3">
                {group.batches.map((batch) => (
                  <div key={batch.id} className="rounded-md border bg-muted/30 p-3 text-sm shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium">
                          {batch.titulo || batch.campana_nombre || `Lote ${batch.id.slice(0, 8)}`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {(batch.total_prospectos ?? 0).toLocaleString("es-MX")} prospectos ·{" "}
                          {(batch.canales ?? []).join(", ") || "Sin canales"}
                        </p>
                      </div>
                      <Badge variant="secondary" className="capitalize">
                        {batch.estado ?? "pendiente"}
                      </Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {Object.entries(batch.totales).map(([estado, count]) => (
                        <span key={`${batch.id}-${estado}`} className="rounded bg-background/80 px-2 py-0.5">
                          {estado}: {count}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {campanasLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <IconLoader className="size-4 animate-spin" /> Cargando campañas...
            </div>
          ) : null}
        </CardContent>
      </Card>

      <ProspeccionCampaignWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        selectedIds={[]}
        preset={wizardPreset}
        onCompleted={handleWizardCompleted}
      />

      <ProspeccionContactDrawer open={drawerOpen} onOpenChange={setDrawerOpen} data={drawerData} />
    </div>
  )
}
