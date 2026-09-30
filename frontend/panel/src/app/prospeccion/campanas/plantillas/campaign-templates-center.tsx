"use client"

import { Fragment, useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { IconArrowLeft, IconEdit, IconLoader, IconPlus, IconRocket, IconSearch, IconTrash, IconVersions } from "@tabler/icons-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  deleteContactoTemplate,
  listContactoTemplateVersions,
  listContactoTemplates,
  listCrmCampaigns,
  deleteContactoTemplateVersion,
  deleteWhatsProspTemplate,
  publishContactoTemplateVersion,
  type ContactoTemplate,
  type ContactoTemplateVersion,
  type CrmCampaign,
} from "@/lib/prospeccion/prospectos-client"

type Props = { campaignId?: string }

function statusLabel(version: ContactoTemplateVersion | undefined) {
  if (!version) return "Sin versión"
  if (version.estado === "publicada") return "Publicada"
  if (version.estado === "borrador") return "Borrador"
  if (version.estado === "probada") return "Probada"
  return "Archivada"
}

function templateStatusLabel(template: ContactoTemplate, version: ContactoTemplateVersion | undefined) {
  if (template.canal === "whatsapp") {
    if (template.template_status === "approved") return "Aprobada"
    if (template.template_status === "archived") return "Archivada"
    return "Borrador"
  }
  return statusLabel(version)
}

function templateStatusKey(template: ContactoTemplate, version: ContactoTemplateVersion | undefined) {
  if (template.canal === "whatsapp") return template.template_status || "draft"
  return version?.estado || "sin_version"
}

function templateCategoryLabel(template: ContactoTemplate) {
  if (template.canal !== "whatsapp") return template.email_message_kind === "transactional" ? "Transactional" : "Broadcast"
  return template.meta_category === "utility" ? "Utility" : template.meta_category === "authentication" ? "Authentication" : "Marketing"
}

export function CampaignTemplatesCenter({ campaignId }: Props) {
  const router = useRouter()
  const [campaign, setCampaign] = useState<CrmCampaign | null>(null)
  const [templates, setTemplates] = useState<ContactoTemplate[]>([])
  const [versions, setVersions] = useState<Record<string, ContactoTemplateVersion[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedTemplateId, setExpandedTemplateId] = useState<string | null>(null)
  const [publishingVersionId, setPublishingVersionId] = useState<string | null>(null)
  const [deletingVersionId, setDeletingVersionId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [categoryFilter, setCategoryFilter] = useState("all")

  const load = useCallback(async () => {
    if (!campaignId) {
      setError("No se recibió la campaña. Regresa a Campañas y abre sus plantillas desde ahí.")
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const campaigns = await listCrmCampaigns()
      const selected = campaigns.find((item) => item.id === campaignId)
      if (!selected || (selected.canal !== "correo" && selected.canal !== "whatsapp")) {
        throw new Error("No se encontró la campaña seleccionada o no tiene un canal válido.")
      }
      const response = await listContactoTemplates({ campana_id: campaignId, canal: selected.canal, includeArchived: true })
      const items = Array.isArray(response?.items) ? response.items : []
      const versionEntries = await Promise.all(items.map(async (template) => {
        if (template.canal !== "correo") return [template.id, []] as const
        const result = await listContactoTemplateVersions(template.id)
        return [template.id, result.items ?? []] as const
      }))
      setCampaign(selected)
      setTemplates(items)
      setVersions(Object.fromEntries(versionEntries))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudieron cargar las plantillas.")
    } finally {
      setLoading(false)
    }
  }, [campaignId])

  useEffect(() => { void load() }, [load])

  const title = useMemo(() => campaign?.nombre ?? "Campaña", [campaign?.nombre])

  const publishVersion = async (templateId: string, versionId: string) => {
    setPublishingVersionId(versionId)
    setError(null)
    try {
      await publishContactoTemplateVersion(templateId, versionId)
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo publicar la versión.")
    } finally {
      setPublishingVersionId(null)
    }
  }

  const deleteVersion = async (templateId: string, version: ContactoTemplateVersion) => {
    if (version.estado === "publicada") return
    if (!window.confirm(`¿Eliminar la versión ${version.numero}? Esta acción no se puede deshacer.`)) return

    setDeletingVersionId(version.id)
    setError(null)
    try {
      await deleteContactoTemplateVersion(templateId, version.id)
      await load()
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "No se pudo eliminar la versión."
      if (message.includes("contact_template_version_has_real_sends")) {
        setError("No se puede eliminar: esta versión tiene envíos reales.")
      } else if (message.includes("contact_template_version_send_history_unknown")) {
        setError("No se puede eliminar: no es posible determinar con certeza la versión usada por envíos históricos.")
      } else if (message.includes("contact_template_version_active_or_published")) {
        setError("No se puede eliminar una versión publicada o activa.")
      } else {
        setError(message)
      }
    } finally {
      setDeletingVersionId(null)
    }
  }

  const deleteTemplate = async (template: ContactoTemplate) => {
    const label = template.nombre || template.template_name || "esta plantilla"
    if (!window.confirm(`¿Eliminar ${label}? Esta acción no se puede deshacer.`)) return
    setError(null)
    try {
      if (template.canal === "whatsapp") await deleteWhatsProspTemplate(template.id)
      else await deleteContactoTemplate(template.id)
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo eliminar la plantilla.")
    }
  }

  const filteredTemplates = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase()
    return templates.filter((template) => {
      const latest = (versions[template.id] ?? [])[0]
      const matchesSearch = !normalizedSearch || [
        template.nombre,
        template.slug,
        template.template_name,
        template.descripcion,
        template.asunto,
      ].some((value) => String(value ?? "").toLocaleLowerCase().includes(normalizedSearch))
      const matchesStatus = statusFilter === "all" || templateStatusKey(template, latest) === statusFilter
      const matchesCategory = categoryFilter === "all" || (template.meta_category || template.email_message_kind || "broadcast") === categoryFilter
      return matchesSearch && matchesStatus && matchesCategory
    })
  }, [categoryFilter, search, statusFilter, templates, versions])

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-10">
      <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Button type="button" variant="ghost" className="-ml-3 mb-3 h-8 px-3" onClick={() => router.push("/prospeccion/campanas")}>
            <IconArrowLeft className="mr-2 size-4" /> Regresar a campañas
          </Button>
          <p className="text-sm font-medium text-muted-foreground">Centro de plantillas</p>
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Administra las plantillas asociadas al canal de esta campaña.</p>
        </div>
        <Button type="button" onClick={() => router.push(`/prospeccion/campanas/plantillas/nueva?campana_id=${encodeURIComponent(campaignId ?? "")}`)} disabled={!campaign}>
          <IconPlus className="mr-2 size-4" /> Nueva plantilla
        </Button>
      </header>

      {error ? <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div> : null}
      {loading ? <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><IconLoader className="size-4 animate-spin" /> Cargando plantillas...</div> : null}
      {!loading && templates.length ? (
        <Card>
          <CardHeader className="gap-4 border-b pb-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle className="text-base">Plantillas de la campaña</CardTitle>
                <CardDescription>{filteredTemplates.length} de {templates.length} plantillas visibles</CardDescription>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative min-w-64">
                  <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar plantilla..." className="pl-9" />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Estado" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los estados</SelectItem>
                    <SelectItem value="approved">Aprobadas</SelectItem>
                    <SelectItem value="publicada">Publicadas</SelectItem>
                    <SelectItem value="borrador">Borradores</SelectItem>
                    <SelectItem value="archived">Archivadas</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Categoría" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las categorías</SelectItem>
                    <SelectItem value="marketing">Marketing</SelectItem>
                    <SelectItem value="utility">Utility</SelectItem>
                    <SelectItem value="authentication">Authentication</SelectItem>
                    <SelectItem value="transactional">Transactional</SelectItem>
                    <SelectItem value="broadcast">Broadcast</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Plantilla</th>
                    <th className="px-4 py-3 font-medium">Canal</th>
                    <th className="px-4 py-3 font-medium">Estado</th>
                    <th className="px-4 py-3 font-medium">Categoría</th>
                    <th className="px-4 py-3 font-medium">Idioma</th>
                    <th className="px-4 py-3 text-right font-medium">Versiones</th>
                    <th className="w-48 px-4 py-3 text-right font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {!filteredTemplates.length ? (
                    <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">No hay plantillas que coincidan con los filtros.</td></tr>
                  ) : filteredTemplates.map((template) => {
          const templateVersions = versions[template.id] ?? []
          const active = templateVersions.find((version) => version.estado === "publicada")
          const latest = templateVersions[0]
          return (
            <Fragment key={template.id}>
              <tr className="border-t align-middle">
                <td className="px-4 py-3"><div className="font-medium">{template.nombre}</div><div className="max-w-64 truncate text-xs text-muted-foreground">{template.canal === "whatsapp" ? template.template_name || "Sin nombre técnico" : template.asunto || "Sin asunto"}</div></td>
                <td className="px-4 py-3"><Badge variant="outline">{template.canal === "whatsapp" ? "WhatsApp · Meta" : "Correo"}</Badge></td>
                <td className="px-4 py-3"><Badge variant={templateStatusKey(template, active ?? latest) === "approved" || templateStatusKey(template, active ?? latest) === "publicada" ? "default" : "outline"}>{templateStatusLabel(template, active ?? latest)}</Badge></td>
                <td className="px-4 py-3 text-muted-foreground">{templateCategoryLabel(template)}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{template.language_code || "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums">{template.canal === "whatsapp" ? "—" : templateVersions.length || "—"}</td>
                <td className="px-4 py-3"><div className="flex justify-end gap-1">
                  <Button type="button" variant="outline" size="sm" onClick={() => router.push(`/prospeccion/campanas/plantillas/${template.id}/editar?campana_id=${encodeURIComponent(campaignId ?? "")}`)}><IconEdit className="mr-1.5 size-3.5" /> Editar</Button>
                  {latest?.estado === "borrador" ? <Button type="button" variant="ghost" size="sm" onClick={() => router.push(`/prospeccion/campanas/plantillas/${template.id}/editar?campana_id=${encodeURIComponent(campaignId ?? "")}&version_id=${encodeURIComponent(latest.id)}`)} aria-label="Revisar y publicar"><IconRocket className="size-4" /></Button> : null}
                  {template.canal === "correo" ? <Button type="button" variant="ghost" size="sm" onClick={() => setExpandedTemplateId((current) => current === template.id ? null : template.id)} aria-label="Ver versiones"><IconVersions className="size-4" /></Button> : null}
                  <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => void deleteTemplate(template)} aria-label="Eliminar plantilla"><IconTrash className="size-4" /></Button>
                </div></td>
              </tr>
              {expandedTemplateId === template.id ? <tr><td colSpan={7} className="bg-muted/20 px-4 py-4">
                <div className="space-y-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Historial de versiones</p>
                  {!templateVersions.length ? <p className="text-sm text-muted-foreground">Aún no hay versiones registradas.</p> : null}
                  {templateVersions.map((version) => <div key={version.id} className="rounded-lg border bg-background p-3">
                    <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-medium">Versión {version.numero}</p><p className="text-xs text-muted-foreground">{version.metodo_creacion === "visual" ? "Editor visual" : version.metodo_creacion === "ai" ? "Asistente IA" : "Código HTML"}</p></div><Badge variant={version.estado === "publicada" ? "default" : "outline"}>{statusLabel(version)}</Badge></div>
                    {version.cuerpo_html ? <iframe title={`Vista previa versión ${version.numero}`} sandbox="" srcDoc={version.cuerpo_html} className="mt-3 h-48 w-full rounded border bg-white" /> : <p className="mt-3 whitespace-pre-wrap rounded bg-muted/30 p-3 text-xs">{version.cuerpo_texto || "Sin contenido"}</p>}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => router.push(`/prospeccion/campanas/plantillas/${template.id}/editar?campana_id=${encodeURIComponent(campaignId ?? "")}&version_id=${encodeURIComponent(version.id)}`)}>Editar esta versión</Button>
                      {version.estado === "borrador" ? <Button type="button" size="sm" onClick={() => void publishVersion(template.id, version.id)} disabled={publishingVersionId === version.id || deletingVersionId === version.id}>{publishingVersionId === version.id ? <IconLoader className="mr-2 size-3.5 animate-spin" /> : <IconRocket className="mr-2 size-3.5" />} Publicar</Button> : null}
                      {version.estado !== "publicada" ? <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => void deleteVersion(template.id, version)} disabled={deletingVersionId === version.id || publishingVersionId === version.id}>{deletingVersionId === version.id ? <IconLoader className="mr-2 size-3.5 animate-spin" /> : <IconTrash className="mr-2 size-3.5" />} Eliminar</Button> : null}
                    </div>
                  </div>)}
                </div>
              </td></tr> : null}
            </Fragment>
          )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}
      {!loading && !templates.length ? <Card><CardContent className="py-12 text-center"><p className="font-medium">Esta campaña aún no tiene plantillas.</p><p className="mt-1 text-sm text-muted-foreground">Crea la primera plantilla para comenzar a preparar sus envíos.</p></CardContent></Card> : null}
    </div>
  )
}
