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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import {
  createContactoTemplate,
  deleteContactoTemplate,
  deleteProspeccionCampana,
  listContactoTemplates,
  updateContactoTemplate,
  getContactoMetrics,
  getProspeccionCampanaPreset,
  getProspeccionCampanas,
  type ContactoTemplate,
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
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardPreset, setWizardPreset] = useState<ProspeccionWizardPreset | null>(null)
  const [editCampanaId, setEditCampanaId] = useState<string | null>(null)
  const [templatesDialogOpen, setTemplatesDialogOpen] = useState(false)
  const [templatesCampanaId, setTemplatesCampanaId] = useState<string | null>(null)
  const [templatesCampanaNombre, setTemplatesCampanaNombre] = useState<string>("")
  const [templatesItems, setTemplatesItems] = useState<ContactoTemplate[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [templateSaving, setTemplateSaving] = useState(false)
  const [templateDeletingId, setTemplateDeletingId] = useState<string | null>(null)
  const [templateError, setTemplateError] = useState<string | null>(null)
  const [templateForm, setTemplateForm] = useState({
    id: "",
    canal: "correo" as "correo" | "whatsapp" | "llamada",
    nombre: "",
    slug: "",
    descripcion: "",
    asunto: "",
    cuerpoTexto: "",
    cuerpoHtml: "",
    twilioSid: "",
  })
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
    setEditCampanaId(null)
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
        setEditCampanaId(campanaId)
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

  const handleDeleteCampana = useCallback(
    async (campanaId: string) => {
      setBanner(null)
      setDeleteLoading(campanaId)
      try {
        const response = await deleteProspeccionCampana(campanaId)
        setBanner({
          type: "success",
          message: `Campaña eliminada. ${response.envios_cancelados ?? 0} envíos pendientes cancelados.`,
        })
        await fetchCampanas()
      } catch (err) {
        const message = err instanceof Error ? err.message : "No se pudo eliminar la campaña."
        setBanner({ type: "error", message })
      } finally {
        setDeleteLoading(null)
      }
    },
    [fetchCampanas]
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

  const resetTemplateForm = useCallback(() => {
    setTemplateForm({
      id: "",
      canal: "correo",
      nombre: "",
      slug: "",
      descripcion: "",
      asunto: "",
      cuerpoTexto: "",
      cuerpoHtml: "",
      twilioSid: "",
    })
  }, [])

  const slugify = useCallback((value: string) => {
    return value
      .toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80)
  }, [])

  const loadCampaignTemplates = useCallback(async (campanaId: string) => {
    setTemplatesLoading(true)
    setTemplateError(null)
    try {
      const response = await listContactoTemplates({ campana_id: campanaId })
      setTemplatesItems(Array.isArray(response?.items) ? response.items : [])
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudieron cargar las plantillas."
      setTemplateError(message)
      setTemplatesItems([])
    } finally {
      setTemplatesLoading(false)
    }
  }, [])

  const handleManageTemplates = useCallback(
    async (campanaId: string, campanaNombre?: string | null) => {
      setTemplatesCampanaId(campanaId)
      setTemplatesCampanaNombre(campanaNombre ?? `Campaña ${campanaId.slice(0, 8)}`)
      resetTemplateForm()
      setTemplatesDialogOpen(true)
      await loadCampaignTemplates(campanaId)
    },
    [loadCampaignTemplates, resetTemplateForm]
  )

  const handleTemplateEdit = useCallback((template: ContactoTemplate) => {
    const metadata = template.metadata && typeof template.metadata === "object" ? template.metadata : {}
    setTemplateForm({
      id: template.id,
      canal: template.canal,
      nombre: template.nombre ?? "",
      slug: template.slug ?? "",
      descripcion: template.descripcion ?? "",
      asunto: template.asunto ?? "",
      cuerpoTexto: template.cuerpo_texto ?? "",
      cuerpoHtml: template.cuerpo_html ?? "",
      twilioSid: typeof metadata["twilio_content_sid"] === "string" ? metadata["twilio_content_sid"] : "",
    })
  }, [])

  const handleTemplateSave = useCallback(async () => {
    if (!templatesCampanaId) {
      setTemplateError("Selecciona una campaña.")
      return
    }
    const nombre = templateForm.nombre.trim()
    const slug = (templateForm.slug.trim() || slugify(nombre)).trim()
    if (!nombre || !slug) {
      setTemplateError("Nombre y slug son obligatorios.")
      return
    }
    setTemplateSaving(true)
    setTemplateError(null)
    const metadata: Record<string, unknown> = {}
    if (templateForm.twilioSid.trim()) metadata["twilio_content_sid"] = templateForm.twilioSid.trim()
    try {
      if (templateForm.id) {
        await updateContactoTemplate(templateForm.id, {
          canal: templateForm.canal,
          nombre,
          slug,
          descripcion: templateForm.descripcion.trim() || null,
          asunto: templateForm.asunto.trim() || null,
          cuerpo_texto: templateForm.cuerpoTexto || null,
          cuerpo_html: templateForm.cuerpoHtml || null,
          metadata,
          campana_id: templatesCampanaId,
        })
      } else {
        await createContactoTemplate({
          canal: templateForm.canal,
          nombre,
          slug,
          descripcion: templateForm.descripcion.trim() || null,
          asunto: templateForm.asunto.trim() || null,
          cuerpo_texto: templateForm.cuerpoTexto || null,
          cuerpo_html: templateForm.cuerpoHtml || null,
          metadata,
          activo: true,
          campana_id: templatesCampanaId,
        })
      }
      await loadCampaignTemplates(templatesCampanaId)
      resetTemplateForm()
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo guardar la plantilla."
      setTemplateError(message)
    } finally {
      setTemplateSaving(false)
    }
  }, [loadCampaignTemplates, resetTemplateForm, slugify, templateForm, templatesCampanaId])

  const handleTemplateDelete = useCallback(
    async (templateId: string) => {
      if (!templatesCampanaId) return
      setTemplateDeletingId(templateId)
      setTemplateError(null)
      try {
        await deleteContactoTemplate(templateId)
        await loadCampaignTemplates(templatesCampanaId)
        if (templateForm.id === templateId) resetTemplateForm()
      } catch (err) {
        const message = err instanceof Error ? err.message : "No se pudo eliminar la plantilla."
        setTemplateError(message)
      } finally {
        setTemplateDeletingId(null)
      }
    },
    [loadCampaignTemplates, resetTemplateForm, templateForm.id, templatesCampanaId]
  )

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
                <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!group.campana_id}
                  onClick={() =>
                    group.campana_id && void handleManageTemplates(group.campana_id, group.campana_nombre)
                  }
                >
                  Plantillas
                </Button>
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
                  Editar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive"
                  disabled={!group.campana_id || deleteLoading === group.campana_id}
                  onClick={() => group.campana_id && void handleDeleteCampana(group.campana_id)}
                >
                  {deleteLoading === group.campana_id ? (
                    <IconLoader className="mr-2 size-4 animate-spin" />
                  ) : (
                    <IconX className="mr-2 size-4" />
                  )}
                  Eliminar
                </Button>
                </div>
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
        onClose={() => {
          setWizardOpen(false)
          setEditCampanaId(null)
        }}
        selectedIds={[]}
        preset={wizardPreset}
        editCampanaId={editCampanaId}
        onCompleted={handleWizardCompleted}
      />

      <Dialog open={templatesDialogOpen} onOpenChange={setTemplatesDialogOpen}>
        <DialogContent className="w-[96vw] max-w-6xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Plantillas · {templatesCampanaNombre || "Campaña"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-[1.2fr_1fr] max-h-[72vh] overflow-hidden">
            <div className="rounded-lg border p-3 overflow-y-auto">
              {templatesLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <IconLoader className="size-4 animate-spin" /> Cargando plantillas...
                </div>
              ) : null}
              {!templatesLoading && !templatesItems.length ? (
                <p className="text-sm text-muted-foreground">No hay plantillas para esta campaña.</p>
              ) : null}
              <div className="space-y-2">
                {templatesItems.map((template) => (
                  <div key={template.id} className="rounded-md border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold">{template.nombre}</p>
                        <p className="text-xs text-muted-foreground">
                          {template.canal} · {template.slug}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => handleTemplateEdit(template)}>
                          Editar
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="text-destructive"
                          disabled={templateDeletingId === template.id}
                          onClick={() => void handleTemplateDelete(template.id)}
                        >
                          {templateDeletingId === template.id ? (
                            <IconLoader className="size-4 animate-spin" />
                          ) : (
                            <IconX className="size-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-lg border p-3 overflow-y-auto space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">{templateForm.id ? "Editar plantilla" : "Nueva plantilla"}</p>
                <Button type="button" variant="ghost" size="sm" onClick={resetTemplateForm}>
                  Limpiar
                </Button>
              </div>
              <div className="space-y-1">
                <Label>Canal</Label>
                <Select
                  value={templateForm.canal}
                  onValueChange={(value) =>
                    setTemplateForm((prev) => ({ ...prev, canal: value as "correo" | "whatsapp" | "llamada" }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="correo">Correo</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="llamada">Llamada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Nombre</Label>
                <Input
                  value={templateForm.nombre}
                  onChange={(event) =>
                    setTemplateForm((prev) => ({
                      ...prev,
                      nombre: event.target.value,
                      slug: prev.slug ? prev.slug : slugify(event.target.value),
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Slug</Label>
                <Input value={templateForm.slug} onChange={(event) => setTemplateForm((prev) => ({ ...prev, slug: event.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Descripción</Label>
                <Input
                  value={templateForm.descripcion}
                  onChange={(event) => setTemplateForm((prev) => ({ ...prev, descripcion: event.target.value }))}
                />
              </div>
              {templateForm.canal === "correo" ? (
                <>
                  <div className="space-y-1">
                    <Label>Asunto</Label>
                    <Input
                      value={templateForm.asunto}
                      onChange={(event) => setTemplateForm((prev) => ({ ...prev, asunto: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Cuerpo (texto)</Label>
                    <Textarea
                      rows={4}
                      value={templateForm.cuerpoTexto}
                      onChange={(event) => setTemplateForm((prev) => ({ ...prev, cuerpoTexto: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Cuerpo (HTML)</Label>
                    <Textarea
                      rows={5}
                      value={templateForm.cuerpoHtml}
                      onChange={(event) => setTemplateForm((prev) => ({ ...prev, cuerpoHtml: event.target.value }))}
                    />
                  </div>
                </>
              ) : null}
              {templateForm.canal === "whatsapp" ? (
                <>
                  <div className="space-y-1">
                    <Label>Mensaje</Label>
                    <Textarea
                      rows={4}
                      value={templateForm.cuerpoTexto}
                      onChange={(event) => setTemplateForm((prev) => ({ ...prev, cuerpoTexto: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Twilio Content SID (opcional)</Label>
                    <Input
                      value={templateForm.twilioSid}
                      onChange={(event) => setTemplateForm((prev) => ({ ...prev, twilioSid: event.target.value }))}
                    />
                  </div>
                </>
              ) : null}
              {templateForm.canal === "llamada" ? (
                <div className="space-y-1">
                  <Label>Guion</Label>
                  <Textarea
                    rows={4}
                    value={templateForm.cuerpoTexto}
                    onChange={(event) => setTemplateForm((prev) => ({ ...prev, cuerpoTexto: event.target.value }))}
                  />
                </div>
              ) : null}
              {templateError ? (
                <div className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {templateError}
                </div>
              ) : null}
              <Button type="button" className="w-full" onClick={() => void handleTemplateSave()} disabled={templateSaving}>
                {templateSaving ? "Guardando..." : templateForm.id ? "Guardar cambios" : "Crear plantilla"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ProspeccionContactDrawer open={drawerOpen} onOpenChange={setDrawerOpen} data={drawerData} />
    </div>
  )
}
