"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { IconArrowLeft, IconEdit, IconLoader, IconPlus, IconRocket, IconVersions } from "@tabler/icons-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  listContactoTemplateVersions,
  listContactoTemplates,
  listCrmCampaigns,
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

export function CampaignTemplatesCenter({ campaignId }: Props) {
  const router = useRouter()
  const [campaign, setCampaign] = useState<CrmCampaign | null>(null)
  const [templates, setTemplates] = useState<ContactoTemplate[]>([])
  const [versions, setVersions] = useState<Record<string, ContactoTemplateVersion[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedTemplateId, setExpandedTemplateId] = useState<string | null>(null)
  const [publishingVersionId, setPublishingVersionId] = useState<string | null>(null)

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
      const response = await listContactoTemplates({ campana_id: campaignId, canal: selected.canal })
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
      {!loading && !templates.length ? <Card><CardContent className="py-12 text-center"><p className="font-medium">Esta campaña aún no tiene plantillas.</p><p className="mt-1 text-sm text-muted-foreground">Crea la primera plantilla para comenzar a preparar sus envíos.</p></CardContent></Card> : null}
      <div className="grid gap-4 md:grid-cols-2">
        {templates.map((template) => {
          const templateVersions = versions[template.id] ?? []
          const active = templateVersions.find((version) => version.estado === "publicada")
          const latest = templateVersions[0]
          return (
            <Card key={template.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><CardTitle className="truncate text-lg">{template.nombre}</CardTitle><CardDescription className="mt-1 truncate">{template.asunto || "Sin asunto"}</CardDescription></div>
                  <Badge variant={active ? "default" : "outline"}>{statusLabel(active ?? latest)}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/40 p-3 text-sm">
                  <div><p className="text-xs text-muted-foreground">Tipo</p><p className="font-medium">{template.email_message_kind === "transactional" ? "Transactional" : "Broadcast"}</p></div>
                  <div><p className="text-xs text-muted-foreground">Versiones</p><p className="font-medium">{templateVersions.length || "—"}</p></div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => router.push(`/prospeccion/campanas/plantillas/${template.id}/editar?campana_id=${encodeURIComponent(campaignId ?? "")}`)}><IconEdit className="mr-2 size-3.5" /> Editar</Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setExpandedTemplateId((current) => current === template.id ? null : template.id)}><IconVersions className="mr-2 size-3.5" /> {expandedTemplateId === template.id ? "Ocultar versiones" : "Ver versiones"}</Button>
                  {latest?.estado === "borrador" ? <Button type="button" size="sm" onClick={() => router.push(`/prospeccion/campanas/plantillas/${template.id}/editar?campana_id=${encodeURIComponent(campaignId ?? "")}&version_id=${encodeURIComponent(latest.id)}`)}><IconRocket className="mr-2 size-3.5" /> Revisar y publicar</Button> : null}
                </div>
                {expandedTemplateId === template.id ? <div className="space-y-3 border-t pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Historial de versiones</p>
                  {!templateVersions.length ? <p className="text-sm text-muted-foreground">Aún no hay versiones registradas.</p> : null}
                  {templateVersions.map((version) => <div key={version.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-medium">Versión {version.numero}</p><p className="text-xs text-muted-foreground">{version.metodo_creacion === "visual" ? "Editor visual" : version.metodo_creacion === "ai" ? "Asistente IA" : "Código HTML"}</p></div><Badge variant={version.estado === "publicada" ? "default" : "outline"}>{statusLabel(version)}</Badge></div>
                    {version.cuerpo_html ? <iframe title={`Vista previa versión ${version.numero}`} sandbox="" srcDoc={version.cuerpo_html} className="mt-3 h-48 w-full rounded border bg-white" /> : <p className="mt-3 whitespace-pre-wrap rounded bg-muted/30 p-3 text-xs">{version.cuerpo_texto || "Sin contenido"}</p>}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => router.push(`/prospeccion/campanas/plantillas/${template.id}/editar?campana_id=${encodeURIComponent(campaignId ?? "")}&version_id=${encodeURIComponent(version.id)}`)}>Editar esta versión</Button>
                      {version.estado === "borrador" ? <Button type="button" size="sm" onClick={() => void publishVersion(template.id, version.id)} disabled={publishingVersionId === version.id}>{publishingVersionId === version.id ? <IconLoader className="mr-2 size-3.5 animate-spin" /> : <IconRocket className="mr-2 size-3.5" />} Publicar esta versión</Button> : null}
                    </div>
                  </div>)}
                </div> : null}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
