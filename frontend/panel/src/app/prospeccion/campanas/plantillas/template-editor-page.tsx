"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { IconArrowLeft, IconLoader, IconPhoto, IconUpload } from "@tabler/icons-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { TemplateAiAssistant, type TemplateAiDraft } from "../components/template-ai-assistant"
import {
  createContactoTemplate,
  createWhatsProspTemplate,
  listContactoTemplates,
  listCrmCampaigns,
  listWhatsAppAtribucionReglas,
  updateContactoTemplate,
  updateWhatsProspTemplate,
  type ContactoTemplate,
  type ContactoTemplateImagenVariable,
  type CrmCampaign,
  type WhatsAppAtribucionRule,
} from "@/lib/prospeccion/prospectos-client"

type Props = { templateId?: string; initialCampaignId?: string }
type Channel = "correo" | "whatsapp"
type EmailFormat = "html" | "texto"
type LogoAsset = { id: string; nombre: string; file_url: string }

const IMAGE_SLOTS: Array<{ key: ContactoTemplateImagenVariable; label: string }> = [
  { key: "logo_url", label: "Logo" },
  { key: "hero_image_url", label: "Imagen principal" },
  { key: "product_image_1_url", label: "Producto 1" },
  { key: "product_image_2_url", label: "Producto 2" },
  { key: "product_image_3_url", label: "Producto 3" },
  { key: "product_image_4_url", label: "Producto 4" },
  { key: "warranty_image_url", label: "Garantía" },
]

const TEMPLATE_VARIABLES = [
  "{{display_name}}",
  "{{nombre}}",
  "{{titulo}}",
  "{{primer_apellido}}",
  "{{segundo_apellido}}",
  "{{empresa}}",
  "{{email}}",
  "{{telefono}}",
  "{{segmento}}",
  "{{canal_origen}}",
]

type FormState = {
  id: string
  canal: Channel
  campanaId: string
  nombre: string
  descripcion: string
  asunto: string
  cuerpoTexto: string
  cuerpoHtml: string
  emailFormat: EmailFormat
  metaTemplateName: string
  metaTemplateLanguage: string
  metaCategory: "marketing" | "utility" | "authentication"
  websiteBaseUrl: string
  websiteLinkLabel: string
  demoLinkLabel: string
  internalLinkLabel: string
  internalLinkUrl: string
}

const emptyForm = (campaign?: CrmCampaign): FormState => ({
  id: "",
  canal: campaign?.canal === "whatsapp" ? "whatsapp" : "correo",
  campanaId: campaign?.id ?? "",
  nombre: "",
  descripcion: "",
  asunto: "",
  cuerpoTexto: "",
  cuerpoHtml: "",
  emailFormat: "html",
  metaTemplateName: "",
  metaTemplateLanguage: "es_MX",
  metaCategory: "marketing",
  websiteBaseUrl: "https://talia.mx/",
  websiteLinkLabel: "Visitar sitio web",
  demoLinkLabel: "Agenda tu demo",
  internalLinkLabel: "",
  internalLinkUrl: "",
})

function slugify(value: string, canal: Channel): string {
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90)
  return `${canal}-${slug || "plantilla"}`.slice(0, 120)
}

function formFromTemplate(template: ContactoTemplate, campaignId: string): FormState {
  return {
    id: template.id,
    canal: template.canal === "whatsapp" ? "whatsapp" : "correo",
    campanaId: campaignId,
    nombre: template.nombre ?? "",
    descripcion: template.descripcion ?? "",
    asunto: template.asunto ?? "",
    cuerpoTexto: template.cuerpo_texto ?? "",
    cuerpoHtml: template.cuerpo_html ?? "",
    emailFormat: template.cuerpo_html?.trim() ? "html" : "texto",
    metaTemplateName: template.template_name ?? "",
    metaTemplateLanguage: template.language_code ?? "es_MX",
    metaCategory: template.meta_category ?? "marketing",
    websiteBaseUrl: "https://talia.mx/",
    websiteLinkLabel: "Visitar sitio web",
    demoLinkLabel: "Agenda tu demo",
    internalLinkLabel: "",
    internalLinkUrl: "",
  }
}

export function TemplateEditorPage({ templateId, initialCampaignId }: Props) {
  const router = useRouter()
  const logoFileInputRef = useRef<HTMLInputElement>(null)
  const [campaigns, setCampaigns] = useState<CrmCampaign[]>([])
  const [templates, setTemplates] = useState<ContactoTemplate[]>([])
  const [logos, setLogos] = useState<LogoAsset[]>([])
  const [logosLoading, setLogosLoading] = useState(false)
  const [logoUploading, setLogoUploading] = useState(false)
  const [imageIds, setImageIds] = useState<Partial<Record<ContactoTemplateImagenVariable, string>>>({})
  const [selectedImageSlot, setSelectedImageSlot] = useState<ContactoTemplateImagenVariable>("logo_url")
  const [waRules, setWaRules] = useState<WhatsAppAtribucionRule[]>([])
  const [waRulesLoading, setWaRulesLoading] = useState(false)
  const [selectedWaRuleId, setSelectedWaRuleId] = useState("")
  const [waLinkLabel, setWaLinkLabel] = useState("Escríbenos por WhatsApp")
  const [tenantPhone, setTenantPhone] = useState("")
  const [form, setForm] = useState<FormState>(() => emptyForm())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const selectedCampaign = useMemo(
    () => campaigns.find((campaign) => campaign.id === form.campanaId) ?? null,
    [campaigns, form.campanaId],
  )

  const loadLogos = useCallback(async () => {
    setLogosLoading(true)
    try {
      const response = await fetch("/api/settings/logos", { cache: "no-store" })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.detail === "string" ? payload.detail : "No se pudieron cargar las imágenes.")
      }
      const items = Array.isArray(payload?.logos) ? payload.logos : []
      setLogos(
        items.flatMap((item: unknown) => {
          if (!item || typeof item !== "object") return []
          const row = item as Record<string, unknown>
          const fileUrl = typeof row.file_url === "string" ? row.file_url.trim() : ""
          if (!fileUrl) return []
          return [{
            id: String(row.id ?? fileUrl),
            nombre: typeof row.nombre === "string" && row.nombre.trim() ? row.nombre.trim() : "Imagen",
            file_url: fileUrl,
          }]
        }),
      )
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudieron cargar las imágenes.")
    } finally {
      setLogosLoading(false)
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      if (!initialCampaignId) {
        throw new Error("No se recibió la campaña. Regresa a Campañas y abre sus plantillas desde ahí.")
      }

      const campaignResponse = await listCrmCampaigns()
      const campaignItems = Array.isArray(campaignResponse) ? campaignResponse : []
      const validCampaigns = campaignItems.filter(
        (campaign): campaign is CrmCampaign & { canal: Channel } =>
          campaign.canal === "correo" || campaign.canal === "whatsapp",
      )
      const campaign = validCampaigns.find((item) => item.id === initialCampaignId)
      if (!campaign) throw new Error("No se encontró la campaña seleccionada o no tiene un canal válido.")

      setCampaigns(validCampaigns)
      const response = await listContactoTemplates({
        campana_id: campaign.id,
        canal: campaign.canal,
      })
      const items = Array.isArray(response?.items) ? response.items : []
      setTemplates(items)

      if (templateId) {
        const template = items.find((item) => item.id === templateId)
        if (!template) throw new Error("No se encontró la plantilla dentro de la campaña seleccionada.")
        setForm(formFromTemplate(template, campaign.id))
        setImageIds(
          Object.fromEntries((template.imagenes ?? []).map((image) => [image.variable_clave, image.logo_id])),
        )
      } else {
        setForm(emptyForm(campaign))
        setImageIds({})
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo cargar el editor de plantillas.")
    } finally {
      setLoading(false)
    }
  }, [initialCampaignId, templateId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void loadLogos()
  }, [loadLogos])

  useEffect(() => {
    if (loading) return
    setWaRulesLoading(true)
    void (async () => {
      try {
        const [settingsResponse, rulesResponse] = await Promise.all([
          fetch("/api/settings/variables", { cache: "no-store" }),
          listWhatsAppAtribucionReglas({ limit: 500, activo: true }),
        ])
        const settings = await settingsResponse.json().catch(() => ({}))
        if (settingsResponse.ok && settings && typeof settings === "object") {
          const row = settings as Record<string, unknown>
          const website =
            (typeof row.sitio_web === "string" && row.sitio_web.trim()) ||
            (typeof row.dominio_principal === "string" && row.dominio_principal.trim()) ||
            ""
          const phone = typeof row.telefono === "string" ? row.telefono.trim() : ""
          if (website) setForm((previous) => ({ ...previous, websiteBaseUrl: website }))
          setTenantPhone(phone)
        }
        setWaRules(Array.isArray(rulesResponse?.items) ? rulesResponse.items : [])
      } catch {
        setWaRules([])
      } finally {
        setWaRulesLoading(false)
      }
    })()
  }, [loading])

  const appendToContent = useCallback((value: string) => {
    setForm((previous) => {
      const field = previous.canal === "correo" && previous.emailFormat === "html" ? "cuerpoHtml" : "cuerpoTexto"
      const current = previous[field]
      const separator = current.trim() ? "\n" : ""
      return { ...previous, [field]: `${current}${separator}${value}` }
    })
  }, [])

  const handleLogoUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setLogoUploading(true)
    setError(null)
    try {
      const body = new FormData()
      body.append("file", file, file.name || "imagen.png")
      body.append("nombre", file.name || "Imagen de prospección")
      if (form.campanaId) body.append("campana_id", form.campanaId)
      body.append("canal", form.canal)
      if (form.id) body.append("template_id", form.id)
      body.append("template_slug", slugify(form.nombre || "plantilla", form.canal))

      const response = await fetch("/api/settings/logos", { method: "POST", body })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.detail === "string" ? payload.detail : "No se pudo subir la imagen.")
      }
      const uploaded = payload as LogoAsset
      setLogos((previous) => [uploaded, ...previous.filter((item) => item.id !== uploaded.id)])
      setImageIds((previous) => ({ ...previous, [selectedImageSlot]: uploaded.id }))
      setNotice("Imagen cargada y asignada a la plantilla.")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo subir la imagen.")
    } finally {
      setLogoUploading(false)
      if (logoFileInputRef.current) logoFileInputRef.current.value = ""
    }
  }, [form.campanaId, form.canal, form.id, form.nombre, selectedImageSlot])

  const insertSelectedImage = useCallback(() => {
    const token = `{{${selectedImageSlot}}}`
    if (form.canal === "correo" && form.emailFormat === "html") {
      appendToContent(
        `<img src="${token}" alt="" style="display:block;width:100%;max-width:600px;height:auto;margin:20px auto;border:0;" />`,
      )
      return
    }
    appendToContent(token)
  }, [appendToContent, form.canal, form.emailFormat, selectedImageSlot])

  const normalizeUrl = useCallback((value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return ""
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  }, [])

  const insertLink = useCallback((label: string, url: string) => {
    const safeLabel = label.trim() || url
    if (!url) return setError("Escribe o configura una URL antes de insertar el enlace.")
    if (form.canal === "correo" && form.emailFormat === "html") {
      appendToContent(`<a href="${url}" target="_blank" rel="noopener noreferrer">${safeLabel}</a>`)
    } else {
      appendToContent(`${safeLabel}: ${url}`)
    }
    setNotice("Enlace insertado en el contenido.")
  }, [appendToContent, form.canal, form.emailFormat])

  const previewHtml = useMemo(() => {
    const imageUrls = Object.fromEntries(
      IMAGE_SLOTS.map(({ key }) => {
        const asset = logos.find((logo) => logo.id === imageIds[key])
        return [key, asset?.file_url ?? ""]
      }),
    )
    let html = form.cuerpoHtml
    for (const [key, value] of Object.entries(imageUrls)) {
      html = html.replaceAll(`{{${key}}}`, value)
    }
    const website = normalizeUrl(form.websiteBaseUrl)
    let demo = ""
    try {
      demo = website ? new URL("/demo.html", website).toString() : ""
    } catch {
      demo = website
    }
    return html.replaceAll("{{website_url}}", website).replaceAll("{{booking_url}}", demo)
  }, [form.cuerpoHtml, form.websiteBaseUrl, imageIds, logos, normalizeUrl])

  const waMeUrl = useMemo(() => {
    const phone = tenantPhone.replace(/\D+/g, "")
    const phrase = waRules.find((rule) => rule.id === selectedWaRuleId)?.frase_objetivo?.trim() ?? ""
    if (!phone || !phrase) return ""
    return `https://wa.me/${phone}?text=${encodeURIComponent(phrase)}`
  }, [selectedWaRuleId, tenantPhone, waRules])

  const applyDraft = (draft: TemplateAiDraft) => {
    setForm((previous) => ({
      ...previous,
      nombre: previous.nombre.trim() ? previous.nombre : draft.nombre_sugerido,
      descripcion: previous.descripcion.trim() ? previous.descripcion : draft.descripcion,
      asunto: draft.asunto ?? previous.asunto,
      cuerpoTexto:
        previous.canal === "whatsapp" || previous.emailFormat === "texto"
          ? draft.cuerpo_texto
          : previous.cuerpoTexto,
      cuerpoHtml: draft.cuerpo_html ?? previous.cuerpoHtml,
      emailFormat: draft.cuerpo_html ? "html" : previous.emailFormat,
      metaCategory:
        draft.meta_category_sugerida === "marketing" ||
        draft.meta_category_sugerida === "utility" ||
        draft.meta_category_sugerida === "authentication"
          ? draft.meta_category_sugerida
          : previous.metaCategory,
      metaTemplateLanguage: draft.language_code_sugerido ?? previous.metaTemplateLanguage,
    }))
    setNotice("Borrador generado. Revisa el contenido y las advertencias antes de guardar.")
  }

  const handleSave = async () => {
    const name = form.nombre.trim()
    const content =
      form.canal === "whatsapp"
        ? form.cuerpoTexto.trim()
        : form.emailFormat === "html"
          ? form.cuerpoHtml.trim()
          : form.cuerpoTexto.trim()

    if (!form.campanaId) return setError("No hay una campaña asociada a esta plantilla.")
    if (!name) return setError("Escribe un nombre para la plantilla.")
    if (!content) return setError("Escribe el contenido de la plantilla.")

    setSaving(true)
    setError(null)
    try {
      const imagenes = IMAGE_SLOTS.flatMap(({ key }) => {
        const logoId = imageIds[key]
        return logoId ? [{ variable_clave: key, logo_id: logoId }] : []
      })
      const payload = {
        canal: form.canal,
        campana_id: form.campanaId,
        nombre: name,
        slug: slugify(name, form.canal),
        descripcion: form.descripcion.trim() || null,
        asunto: form.canal === "correo" ? form.asunto.trim() || null : null,
        cuerpo_texto:
          form.canal === "whatsapp" ||
          (form.canal === "correo" && form.emailFormat === "texto")
            ? form.cuerpoTexto
            : null,
        cuerpo_html: form.canal === "correo" && form.emailFormat === "html" ? form.cuerpoHtml : null,
        activo: true,
        imagenes,
        metadata:
          form.canal === "whatsapp"
            ? {
                template_name: form.metaTemplateName.trim() || null,
                template_language: form.metaTemplateLanguage,
                meta_category: form.metaCategory,
              }
            : {},
      }

      if (form.canal === "whatsapp") {
        const whatsPayload = {
          nombre: name,
          slug: payload.slug,
          descripcion: payload.descripcion,
          cuerpo_texto: form.cuerpoTexto,
          template_name: form.metaTemplateName.trim(),
          language_code: form.metaTemplateLanguage.trim(),
          meta_category: form.metaCategory,
          template_status: "draft" as const,
          activo: true,
          metadata: payload.metadata,
          imagenes,
        }
        if (form.id) await updateWhatsProspTemplate(form.id, whatsPayload)
        else await createWhatsProspTemplate(whatsPayload)
      } else if (form.id) {
        await updateContactoTemplate(form.id, payload)
      } else {
        const response = await createContactoTemplate(payload)
        const created = response?.template
        if (created?.id) {
          router.replace(
            `/prospeccion/campanas/plantillas/${created.id}/editar?campana_id=${encodeURIComponent(form.campanaId)}`,
          )
          return
        }
      }

      setNotice(form.id ? "Plantilla actualizada correctamente." : "Plantilla guardada correctamente.")
      const refreshed = await listContactoTemplates({
        campana_id: form.campanaId,
        canal: form.canal,
      })
      setTemplates(Array.isArray(refreshed?.items) ? refreshed.items : [])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo guardar la plantilla.")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-2 text-sm text-muted-foreground">
        <IconLoader className="size-4 animate-spin" /> Cargando editor...
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-10">
      <header className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <Button
            type="button"
            variant="ghost"
            className="-ml-3 h-8 px-3"
            onClick={() => router.push("/prospeccion/campanas")}
          >
            <IconArrowLeft className="mr-2 size-4" /> Regresar a campañas
          </Button>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Plantillas de campaña</p>
            <h1 className="text-3xl font-semibold tracking-tight">
              {form.id ? "Editar plantilla" : "Nueva plantilla"}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Define el contenido que utilizará esta campaña en sus envíos de prospección.
            </p>
          </div>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <Button
            type="button"
            variant="outline"
            className="flex-1 sm:flex-none"
            onClick={() => router.push("/prospeccion/campanas")}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            className="flex-1 sm:flex-none"
            onClick={() => void handleSave()}
            disabled={saving || !selectedCampaign}
          >
            {saving ? <IconLoader className="mr-2 size-4 animate-spin" /> : null}
            {saving ? "Guardando..." : "Guardar plantilla"}
          </Button>
        </div>
      </header>

      {error ? (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
        </div>
      ) : null}

      {selectedCampaign ? (
        <section className="rounded-xl border bg-muted/20 px-4 py-4 sm:px-5" aria-label="Campaña seleccionada">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,440px)] lg:items-end">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Campaña seleccionada
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <h2 className="truncate text-lg font-semibold">{selectedCampaign.nombre}</h2>
                <Badge variant="outline">{form.canal === "correo" ? "Correo" : "WhatsApp"}</Badge>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Plantilla de esta campaña</Label>
              <Select
                value={form.id || "__new__"}
                onValueChange={(value) => {
                  if (value === "__new__") {
                    router.push(
                      `/prospeccion/campanas/plantillas/nueva?campana_id=${encodeURIComponent(form.campanaId)}`,
                    )
                    return
                  }
                  router.push(
                    `/prospeccion/campanas/plantillas/${value}/editar?campana_id=${encodeURIComponent(form.campanaId)}`,
                  )
                }}
              >
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="Selecciona una plantilla" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__new__">+ Crear nueva plantilla</SelectItem>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>
      ) : null}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <main className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Identidad de la plantilla</CardTitle>
              <CardDescription>Estos datos ayudan a reconocer y reutilizar la plantilla.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="template-name">Nombre</Label>
                <Input
                  id="template-name"
                  value={form.nombre}
                  onChange={(event) => setForm((previous) => ({ ...previous, nombre: event.target.value }))}
                  placeholder="Primer contacto comercial"
                />
              </div>
              <div className="space-y-2">
                <Label>Canal</Label>
                <div className="flex h-10 items-center justify-between rounded-md border bg-muted/30 px-3 text-sm">
                  <span>{form.canal === "correo" ? "Correo electrónico" : "WhatsApp"}</span>
                  <Badge variant="secondary">Fijo por campaña</Badge>
                </div>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="template-description">
                  Descripción interna <span className="font-normal text-muted-foreground">(opcional)</span>
                </Label>
                <Input
                  id="template-description"
                  value={form.descripcion}
                  onChange={(event) => setForm((previous) => ({ ...previous, descripcion: event.target.value }))}
                  placeholder="Objetivo y uso de esta plantilla"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contenido</CardTitle>
              <CardDescription>
                {form.canal === "correo"
                  ? "Elige un único formato para evitar duplicar el contenido del correo."
                  : "Redacta el mensaje que se enviará por WhatsApp."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {form.canal === "correo" ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="template-subject">Asunto</Label>
                    <Input
                      id="template-subject"
                      value={form.asunto}
                      onChange={(event) => setForm((previous) => ({ ...previous, asunto: event.target.value }))}
                      placeholder="Una idea para {{empresa}}"
                    />
                  </div>
                  <div className="max-w-sm space-y-2">
                    <Label>Formato del correo</Label>
                    <Select
                      value={form.emailFormat}
                      onValueChange={(value) => setForm((previous) => ({ ...previous, emailFormat: value as EmailFormat }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="html">HTML con diseño</SelectItem>
                        <SelectItem value="texto">Texto plano</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Solo se guardará el formato elegido.</p>
                  </div>
                  {form.emailFormat === "html" ? (
                    <div className="space-y-2">
                      <Label htmlFor="template-html">HTML del correo</Label>
                      <Textarea
                        id="template-html"
                        className="min-h-[440px] resize-y font-mono text-xs leading-5"
                        value={form.cuerpoHtml}
                        onChange={(event) => setForm((previous) => ({ ...previous, cuerpoHtml: event.target.value }))}
                        placeholder="<p>Hola {{nombre}}...</p>"
                      />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label htmlFor="template-plain-text">Texto plano</Label>
                      <Textarea
                        id="template-plain-text"
                        className="min-h-[360px] resize-y"
                        value={form.cuerpoTexto}
                        onChange={(event) => setForm((previous) => ({ ...previous, cuerpoTexto: event.target.value }))}
                        placeholder="Hola {{nombre}}..."
                      />
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="meta-template-name">Nombre en Meta</Label>
                      <Input id="meta-template-name" value={form.metaTemplateName} onChange={(event) => setForm((previous) => ({ ...previous, metaTemplateName: event.target.value }))} placeholder="primer_contacto" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="meta-language">Idioma</Label>
                      <Input id="meta-language" value={form.metaTemplateLanguage} onChange={(event) => setForm((previous) => ({ ...previous, metaTemplateLanguage: event.target.value }))} placeholder="es_MX" />
                    </div>
                  </div>
                  <div className="max-w-sm space-y-2">
                    <Label>Categoría</Label>
                    <Select value={form.metaCategory} onValueChange={(value) => setForm((previous) => ({ ...previous, metaCategory: value as FormState["metaCategory"] }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="marketing">Marketing</SelectItem>
                        <SelectItem value="utility">Utility</SelectItem>
                        <SelectItem value="authentication">Authentication</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="whatsapp-body">Texto de la plantilla</Label>
                    <Textarea id="whatsapp-body" className="min-h-[360px] resize-y" value={form.cuerpoTexto} onChange={(event) => setForm((previous) => ({ ...previous, cuerpoTexto: event.target.value }))} placeholder="Hola {{nombre}}, ..." />
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Personalización</CardTitle>
              <CardDescription>
                Inserta variables del prospecto en el contenido activo de la plantilla.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {TEMPLATE_VARIABLES.map((variable) => (
                <Button
                  key={variable}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="font-mono text-xs"
                  onClick={() => appendToContent(variable)}
                >
                  {variable}
                </Button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Imágenes de la plantilla</CardTitle>
              <CardDescription>
                Sube imágenes, consulta la galería del tenant y asígnalas a una variable reutilizable.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <input
                ref={logoFileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => void handleLogoUpload(event)}
              />

              <div className="grid gap-4 md:grid-cols-[minmax(0,260px)_1fr] md:items-end">
                <div className="space-y-2">
                  <Label>Uso de la imagen</Label>
                  <Select
                    value={selectedImageSlot}
                    onValueChange={(value) => setSelectedImageSlot(value as ContactoTemplateImagenVariable)}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {IMAGE_SLOTS.map((slot) => (
                        <SelectItem key={slot.key} value={slot.key}>{slot.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => logoFileInputRef.current?.click()}
                    disabled={logoUploading}
                  >
                    {logoUploading ? <IconLoader className="mr-2 size-4 animate-spin" /> : <IconUpload className="mr-2 size-4" />}
                    {logoUploading ? "Subiendo..." : "Subir imagen"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => void loadLogos()} disabled={logosLoading}>
                    {logosLoading ? <IconLoader className="mr-2 size-4 animate-spin" /> : <IconPhoto className="mr-2 size-4" />}
                    Actualizar galería
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={insertSelectedImage}
                    disabled={!imageIds[selectedImageSlot]}
                  >
                    Insertar en el contenido
                  </Button>
                </div>
              </div>

              {logosLoading && !logos.length ? (
                <div className="flex min-h-32 items-center justify-center gap-2 rounded-lg border text-sm text-muted-foreground">
                  <IconLoader className="size-4 animate-spin" /> Cargando imágenes...
                </div>
              ) : logos.length ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {logos.map((logo) => {
                    const selected = imageIds[selectedImageSlot] === logo.id
                    return (
                      <button
                        key={logo.id}
                        type="button"
                        className={`overflow-hidden rounded-lg border p-2 text-left transition-colors ${selected ? "border-primary ring-2 ring-primary/20" : "hover:border-primary/60"}`}
                        onClick={() => setImageIds((previous) => ({ ...previous, [selectedImageSlot]: logo.id }))}
                      >
                        <div className="flex h-36 items-center justify-center overflow-hidden rounded-md bg-muted/30">
                          <Image
                            src={logo.file_url}
                            alt={logo.nombre}
                            width={480}
                            height={320}
                            unoptimized
                            className="max-h-full w-auto max-w-full object-contain"
                          />
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="truncate text-xs font-medium">{logo.nombre}</span>
                          {selected ? <Badge variant="secondary">Asignada</Badge> : null}
                        </div>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed px-4 py-10 text-center">
                  <IconPhoto className="mx-auto size-7 text-muted-foreground" />
                  <p className="mt-2 text-sm font-medium">No hay imágenes disponibles</p>
                  <p className="mt-1 text-xs text-muted-foreground">Sube la primera imagen para esta plantilla.</p>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {IMAGE_SLOTS.map((slot) => (
                  <div key={slot.key} className="space-y-2 rounded-lg border p-3">
                    <Label>{slot.label}</Label>
                    <Select
                      value={imageIds[slot.key] || "__none__"}
                      onValueChange={(value) =>
                        setImageIds((previous) => ({
                          ...previous,
                          [slot.key]: value === "__none__" ? undefined : value,
                        }))
                      }
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Sin imagen</SelectItem>
                        {logos.map((logo) => (
                          <SelectItem key={logo.id} value={logo.id}>{logo.nombre}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="font-mono text-xs text-muted-foreground">{`{{${slot.key}}}`}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Enlaces y llamadas a la acción</CardTitle>
              <CardDescription>
                Inserta enlaces al sitio, agenda de demo o cualquier página específica.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="website-base-url">URL principal del sitio</Label>
                <Input
                  id="website-base-url"
                  value={form.websiteBaseUrl}
                  onChange={(event) => setForm((previous) => ({ ...previous, websiteBaseUrl: event.target.value }))}
                  placeholder="https://tu-dominio.com"
                />
                <p className="text-xs text-muted-foreground">
                  Se utiliza para previsualizar los enlaces dinámicos del sitio y de la agenda.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-3 rounded-lg border p-4">
                  <div className="space-y-2">
                    <Label htmlFor="website-link-label">Texto del enlace web</Label>
                    <Input
                      id="website-link-label"
                      value={form.websiteLinkLabel}
                      onChange={(event) => setForm((previous) => ({ ...previous, websiteLinkLabel: event.target.value }))}
                    />
                  </div>
                  <Button type="button" variant="outline" onClick={() => insertLink(form.websiteLinkLabel, "{{website_url}}")}>
                    Insertar enlace al sitio
                  </Button>
                </div>

                <div className="space-y-3 rounded-lg border p-4">
                  <div className="space-y-2">
                    <Label htmlFor="demo-link-label">Texto del enlace de demo</Label>
                    <Input
                      id="demo-link-label"
                      value={form.demoLinkLabel}
                      onChange={(event) => setForm((previous) => ({ ...previous, demoLinkLabel: event.target.value }))}
                    />
                  </div>
                  <Button type="button" variant="outline" onClick={() => insertLink(form.demoLinkLabel, "{{booking_url}}")}>
                    Insertar enlace para demo
                  </Button>
                </div>
              </div>

              <div className="rounded-lg border p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
                  <div className="min-w-0 flex-1 space-y-2">
                    <Label>Frase de WhatsApp para captación</Label>
                    <Select value={selectedWaRuleId || "__none__"} onValueChange={(value) => setSelectedWaRuleId(value === "__none__" ? "" : value)}>
                      <SelectTrigger>
                        <SelectValue placeholder={waRulesLoading ? "Cargando frases..." : "Selecciona una frase"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Sin frase</SelectItem>
                        {waRules.map((rule) => (
                          <SelectItem key={rule.id} value={rule.id}>
                            {(rule.nombre_regla || "Regla") + " · " + (rule.frase_objetivo || "")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <Label htmlFor="whatsapp-link-label">Texto del enlace</Label>
                    <Input id="whatsapp-link-label" value={waLinkLabel} onChange={(event) => setWaLinkLabel(event.target.value)} />
                  </div>
                  <Button type="button" variant="outline" disabled={!waMeUrl} onClick={() => insertLink(waLinkLabel, waMeUrl)}>
                    Insertar WhatsApp
                  </Button>
                </div>
                {!waRulesLoading && !waRules.length ? (
                  <p className="mt-2 text-xs text-amber-700">
                    No hay frases activas para este tenant. Puedes crearlas en la vista de atribución de WhatsApp.
                  </p>
                ) : null}
              </div>

              <div className="rounded-lg border p-4">
                <p className="text-sm font-medium">Enlace personalizado</p>
                <p className="mt-1 text-xs text-muted-foreground">Para páginas internas, catálogos, precios o demos específicas.</p>
                <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] md:items-end">
                  <div className="space-y-2">
                    <Label htmlFor="internal-link-label">Texto visible</Label>
                    <Input id="internal-link-label" value={form.internalLinkLabel} onChange={(event) => setForm((previous) => ({ ...previous, internalLinkLabel: event.target.value }))} placeholder="Conoce nuestros precios" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="internal-link-url">URL o ruta</Label>
                    <Input id="internal-link-url" value={form.internalLinkUrl} onChange={(event) => setForm((previous) => ({ ...previous, internalLinkUrl: event.target.value }))} placeholder="/precios o https://..." />
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      const rawUrl = form.internalLinkUrl.trim()
                      const url = rawUrl.startsWith("/") ? rawUrl : normalizeUrl(rawUrl)
                      insertLink(form.internalLinkLabel, url)
                    }}
                  >
                    Agregar enlace
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </main>

        <aside className="space-y-6 xl:sticky xl:top-4">
          <TemplateAiAssistant canal={form.canal} campanaId={form.campanaId || null} onApply={applyDraft} />
        </aside>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vista previa de la plantilla</CardTitle>
          <CardDescription>
            Revisa el resultado completo antes de guardar. Esta área utiliza el ancho disponible de la página.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {form.canal === "correo" && form.emailFormat === "html" ? (
            <div className="overflow-auto rounded-lg border bg-muted/40 p-3 sm:p-6">
              <iframe
                title="Vista previa completa del correo"
                className="mx-auto min-h-[720px] w-full max-w-[900px] rounded-md border bg-white shadow-sm"
                sandbox=""
                srcDoc={
                  previewHtml ||
                  "<p style='color:#888;font:14px sans-serif;padding:24px'>El HTML aparecerá aquí.</p>"
                }
              />
            </div>
          ) : (
            <div className="rounded-lg border bg-muted/40 p-3 sm:p-6">
              <pre className="mx-auto min-h-64 max-w-4xl whitespace-pre-wrap rounded-md border bg-background p-5 text-sm leading-6 shadow-sm">
                {form.cuerpoTexto || "El contenido aparecerá aquí."}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
