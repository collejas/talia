"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { IconAlertTriangle, IconLoader, IconPencil, IconRefresh, IconTargetArrow, IconX } from "@tabler/icons-react"
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
  createCrmCampaign,
  createContactoTemplate,
  deleteContactoTemplate,
  deleteProspeccionCampana,
  listContactoTemplates,
  listCrmCampaigns,
  updateContactoTemplate,
  updateProspeccionCampana,
  getContactoMetrics,
  getProspeccionCampanas,
  type CrmCampaign,
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

export function CampanasMetricsClient() {
  const [data, setData] = useState<ContactoMetrics | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [campanas, setCampanas] = useState<ProspeccionCampanaGroup[]>([])
  const [campanasLoading, setCampanasLoading] = useState(false)
  const [campanasError, setCampanasError] = useState<string | null>(null)
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null)
  const [crmCampaigns, setCrmCampaigns] = useState<CrmCampaign[]>([])
  const [campaignDialogOpen, setCampaignDialogOpen] = useState(false)
  const [campaignFormMode, setCampaignFormMode] = useState<"create" | "edit">("create")
  const [campaignFormId, setCampaignFormId] = useState<string | null>(null)
  const [campaignFormName, setCampaignFormName] = useState("")
  const [campaignFormCanal, setCampaignFormCanal] = useState<"correo" | "whatsapp" | "llamada">("whatsapp")
  const [campaignSaving, setCampaignSaving] = useState(false)
  const [templatesDialogOpen, setTemplatesDialogOpen] = useState(false)
  const [templatesCampanaId, setTemplatesCampanaId] = useState<string | null>(null)
  const [templatesCampanaNombre, setTemplatesCampanaNombre] = useState<string>("")
  const [templatesCampanaCanal, setTemplatesCampanaCanal] = useState<"correo" | "whatsapp" | "llamada" | null>(null)
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
      const [resumen, campaignList] = await Promise.all([getProspeccionCampanas(25), listCrmCampaigns()])
      const campaignMap = new Map<string, ProspeccionCampanaGroup>()
      ;(resumen.items ?? []).forEach((item) => {
        if (item.campana_id) {
          campaignMap.set(item.campana_id, item)
        }
      })
      const full = (campaignList ?? []).map((campaign) => {
        const fromResumen = campaignMap.get(campaign.id)
        return (
          fromResumen ?? {
            campana_id: campaign.id,
            campana_nombre: campaign.nombre ?? `Campaña ${campaign.id.slice(0, 8)}`,
            batches: [],
            totales: {},
          }
        )
      })
      setCrmCampaigns(campaignList ?? [])
      setCampanas(full)
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
    setCampaignFormMode("create")
    setCampaignFormId(null)
    setCampaignFormName("")
    setCampaignFormCanal("whatsapp")
    setCampaignDialogOpen(true)
  }, [])

  const handleEditCampana = useCallback((campanaId: string) => {
    const current = crmCampaigns.find((item) => item.id === campanaId)
    if (!current) return
    setCampaignFormMode("edit")
    setCampaignFormId(campanaId)
    setCampaignFormName(current.nombre ?? "")
    const canal = current.canal === "correo" || current.canal === "llamada" || current.canal === "whatsapp" ? current.canal : "whatsapp"
    setCampaignFormCanal(canal)
    setCampaignDialogOpen(true)
  }, [crmCampaigns])

  const handleSaveCampaign = useCallback(async () => {
    const nombre = campaignFormName.trim()
    if (!nombre) {
      setBanner({ type: "error", message: "Escribe el nombre de la campaña." })
      return
    }
    setCampaignSaving(true)
    setBanner(null)
    try {
      if (campaignFormMode === "create") {
        await createCrmCampaign({ nombre, tipo: "prospeccion", canal: campaignFormCanal })
        setBanner({ type: "success", message: "Campaña creada." })
      } else if (campaignFormId) {
        await updateProspeccionCampana(campaignFormId, { campana_nombre: nombre })
        setBanner({ type: "success", message: "Campaña actualizada." })
      }
      setCampaignDialogOpen(false)
      await fetchCampanas()
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo guardar la campaña."
      setBanner({ type: "error", message })
    } finally {
      setCampaignSaving(false)
    }
  }, [campaignFormCanal, campaignFormId, campaignFormMode, campaignFormName, fetchCampanas])

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

  const dismissBanner = useCallback(() => setBanner(null), [])

  const resetTemplateForm = useCallback(() => {
    setTemplateForm({
      id: "",
      canal: templatesCampanaCanal ?? "correo",
      nombre: "",
      slug: "",
      descripcion: "",
      asunto: "",
      cuerpoTexto: "",
      cuerpoHtml: "",
      twilioSid: "",
    })
  }, [templatesCampanaCanal])

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
      const campaign = crmCampaigns.find((item) => item.id === campanaId)
      const canal =
        campaign?.canal === "correo" || campaign?.canal === "whatsapp" || campaign?.canal === "llamada"
          ? campaign.canal
          : null
      setTemplatesCampanaId(campanaId)
      setTemplatesCampanaNombre(campanaNombre ?? `Campaña ${campanaId.slice(0, 8)}`)
      setTemplatesCampanaCanal(canal)
      setTemplateForm({
        id: "",
        canal: canal ?? "correo",
        nombre: "",
        slug: "",
        descripcion: "",
        asunto: "",
        cuerpoTexto: "",
        cuerpoHtml: "",
        twilioSid: "",
      })
      setTemplatesDialogOpen(true)
      await loadCampaignTemplates(campanaId)
    },
    [crmCampaigns, loadCampaignTemplates]
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
    if (templatesCampanaCanal && templateForm.canal !== templatesCampanaCanal) {
      setTemplateError(`Esta campaña solo permite plantillas del canal ${canalLabel[templatesCampanaCanal]}.`)
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
    const canalToSave = templatesCampanaCanal ?? templateForm.canal
    try {
      if (templateForm.id) {
        await updateContactoTemplate(templateForm.id, {
          canal: canalToSave,
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
          canal: canalToSave,
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
  }, [loadCampaignTemplates, resetTemplateForm, slugify, templateForm, templatesCampanaCanal, templatesCampanaId])

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
            <CardTitle className="text-base font-semibold">Gestiona campañas</CardTitle>
            <p className="text-sm text-muted-foreground">
              Crea campañas y administra sus plantillas. La ejecución se hace desde `prospeccion/prospectos`.
            </p>
          </div>
          <Button onClick={handleNewCampaign}>
            <IconTargetArrow className="mr-2 size-4" />
            Crear campaña
          </Button>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm text-muted-foreground md:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-wide">Campañas</p>
            <p className="text-base text-foreground">Define nombre y objetivo comercial.</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide">Plantillas</p>
            <p className="text-base text-foreground">Variantes por canal ligadas a cada campaña.</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide">Ejecución</p>
            <p className="text-base text-foreground">Selecciona prospectos y lanza desde la vista de Prospectos.</p>
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
                  disabled={!group.campana_id}
                  onClick={() => group.campana_id && handleEditCampana(group.campana_id)}
                >
                  <IconPencil className="mr-2 size-4" />
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

      <Dialog open={campaignDialogOpen} onOpenChange={setCampaignDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{campaignFormMode === "create" ? "Crear campaña" : "Editar campaña"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="campaign-name">Nombre</Label>
              <Input
                id="campaign-name"
                value={campaignFormName}
                onChange={(event) => setCampaignFormName(event.target.value)}
                placeholder="Ej. Prospección Inmobiliaria Q1"
              />
            </div>
            <div className="space-y-1">
              <Label>Canal</Label>
              <Select
                value={campaignFormCanal}
                onValueChange={(value) => setCampaignFormCanal(value as "correo" | "whatsapp" | "llamada")}
                disabled={campaignFormMode === "edit"}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="correo">Correo</SelectItem>
                  <SelectItem value="llamada">Llamada</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {campaignFormMode === "create"
                  ? "La campaña queda ligada a un solo canal."
                  : "El canal no se puede cambiar después de crear la campaña."}
              </p>
            </div>
            <Button type="button" className="w-full" onClick={() => void handleSaveCampaign()} disabled={campaignSaving}>
              {campaignSaving ? "Guardando..." : campaignFormMode === "create" ? "Crear campaña" : "Guardar cambios"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
                  disabled={Boolean(templatesCampanaCanal)}
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
                {templatesCampanaCanal ? (
                  <p className="text-xs text-muted-foreground">
                    Canal fijo por campaña: {canalLabel[templatesCampanaCanal]}.
                  </p>
                ) : null}
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

    </div>
  )
}
