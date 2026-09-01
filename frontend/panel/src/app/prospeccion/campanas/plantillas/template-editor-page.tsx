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
import { VisualEmailTemplateEditor } from "./components/visual-email-template-editor"
import {
  createContactoTemplate,
  createContactoTemplateVersion,
  sendContactoTemplateTest,
  createWhatsProspTemplate,
  listContactoTemplates,
  listContactoTemplateVersions,
  getContactoTemplateVersionTree,
  listCrmCampaigns,
  listProspectos,
  listWhatsAppAtribucionReglas,
  updateContactoTemplate,
  updateWhatsProspTemplate,
  publishContactoTemplateVersion,
  type ContactoTemplateVersion,
  type ContactoTemplate,
  type ContactoTemplateImagenVariable,
  type CrmCampaign,
  type ProspectoItem,
  type WhatsAppAtribucionRule,
} from "@/lib/prospeccion/prospectos-client"

type Props = { templateId?: string; initialCampaignId?: string }
type Channel = "correo" | "whatsapp"
type EmailFormat = "html" | "texto"
type EmailCreationMode = "visual" | "html" | "ai"
type EmailMessageKind = "transactional" | "broadcast"
type LogoAsset = { id: string; nombre: string; file_url: string }
type EmailVariable = { clave: string; etiqueta: string; descripcion?: string }
type VisualStructureElement = { id?: string; kind: string; content?: string; href?: string; imageId?: string }
type VisualStructureColumn = { id?: string; width?: number; elements?: VisualStructureElement[] }
type VisualStructureBlock = { id?: string; kind: string; title?: string; content?: string; href?: string; imageId?: string; columns?: VisualStructureColumn[] }

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

const PREVIEW_VARIABLE_PATTERN = /{{s*([A-Za-z0-9_]+)s*}}/g

type FormState = {
  id: string
  canal: Channel
  campanaId: string
  nombre: string
  descripcion: string
  asunto: string
  cuerpoTexto: string
  cuerpoHtml: string
  emailCreationMode: EmailCreationMode | null
  emailFormat: EmailFormat
  emailMessageKind: EmailMessageKind
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
  emailCreationMode: null,
  emailFormat: "html",
  emailMessageKind: "broadcast",
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
    emailCreationMode:
      template.email_creation_mode === "html" || template.email_creation_mode === "ai"
        ? template.email_creation_mode
        : template.cuerpo_html?.trim()
          ? "html"
          : "visual",
    emailFormat: template.cuerpo_html?.trim() ? "html" : "texto",
    emailMessageKind: template.email_message_kind === "transactional" ? "transactional" : "broadcast",
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
  const [versions, setVersions] = useState<ContactoTemplateVersion[]>([])
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
  const [previewProspecto, setPreviewProspecto] = useState<ProspectoItem | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(() => emptyForm())
  const [visualStructure, setVisualStructure] = useState("[]")
  const [emailVariables, setEmailVariables] = useState<EmailVariable[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [testRecipient, setTestRecipient] = useState("")
  const [testSending, setTestSending] = useState(false)

  const selectedCampaign = useMemo(
    () => campaigns.find((campaign) => campaign.id === form.campanaId) ?? null,
    [campaigns, form.campanaId],
  )

  const needsEmailCreationMode = form.canal === "correo" && !form.id && !form.emailCreationMode

  useEffect(() => {
    if (form.canal !== "correo") return
    void fetch("/api/prospeccion/plantillas/ai?canal=correo", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => {
        if (Array.isArray(payload?.items)) setEmailVariables(payload.items as EmailVariable[])
      })
      .catch(() => setEmailVariables([]))
  }, [form.canal])

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
      if (templateId) {
        const template = items.find((item) => item.id === templateId)
        if (!template) throw new Error("No se encontró la plantilla dentro de la campaña seleccionada.")
        setForm(formFromTemplate(template, campaign.id))
        const versionsResponse = await listContactoTemplateVersions(template.id)
        setVersions(Array.isArray(versionsResponse?.items) ? versionsResponse.items : [])
        if (template.version_activa_id) {
          const treeResponse = await getContactoTemplateVersionTree(template.id, template.version_activa_id)
          const structure = (treeResponse.bloques ?? []).map((block) => {
            const row = block as Record<string, unknown>
            return {
              id: String(row.id ?? crypto.randomUUID()),
              kind: row.tipo_bloque === "texto" ? "text" : row.tipo_bloque === "imagen" ? "image" : row.tipo_bloque === "boton" ? "button" : row.tipo_bloque === "separador" ? "divider" : row.tipo_bloque === "espacio" ? "space" : row.tipo_bloque === "columnas" ? "columns" : "text",
              title: String(row.titulo ?? "Bloque"),
              content: String(row.contenido ?? ""),
              href: typeof row.destino_url === "string" ? row.destino_url : undefined,
              imageId: typeof row.logo_id === "string" ? row.logo_id : undefined,
              columns: Array.isArray(row.columnas) ? row.columnas.map((column, columnIndex) => {
                const columnRow = column as Record<string, unknown>
                return {
                  id: String(columnRow.id ?? `column-${columnIndex}`),
                  width: Number(columnRow.ancho_porcentaje ?? 50),
                  elements: Array.isArray(columnRow.elementos) ? columnRow.elementos.map((element, elementIndex) => {
                    const elementRow = element as Record<string, unknown>
                    return {
                      id: String(elementRow.id ?? `element-${elementIndex}`),
                      kind: elementRow.tipo_elemento === "imagen" ? "image" : elementRow.tipo_elemento === "boton" ? "button" : "text",
                      content: String(elementRow.contenido ?? ""),
                      href: typeof elementRow.destino_url === "string" ? elementRow.destino_url : undefined,
                      imageId: typeof elementRow.logo_id === "string" ? elementRow.logo_id : undefined,
                    }
                  }) : [],
                }
              }) : undefined,
            }
          })
          setVisualStructure(JSON.stringify(structure))
        } else {
          setVisualStructure("[]")
        }
        setImageIds(
          Object.fromEntries((template.imagenes ?? []).map((image) => [image.variable_clave, image.logo_id])),
        )
      } else {
        setForm(emptyForm(campaign))
        setVersions([])
        setVisualStructure("[]")
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

  useEffect(() => {
    if (loading || previewLoading || previewProspecto) return
    setPreviewLoading(true)
    setPreviewError(null)
    void listProspectos({ limit: 1, offset: 0, order: "creado" })
      .then((response) => {
        const item = Array.isArray(response?.items) ? response.items[0] ?? null : null
        setPreviewProspecto(item)
        if (!item) setPreviewError("No hay prospectos disponibles para la vista previa.")
      })
      .catch((reason) => {
        setPreviewError(reason instanceof Error ? reason.message : "No se pudo cargar el prospecto de vista previa.")
      })
      .finally(() => setPreviewLoading(false))
  }, [loading, previewLoading, previewProspecto])

  const appendToContent = useCallback((value: string) => {
    setForm((previous) => {
      const field = previous.canal === "correo" && previous.emailFormat === "html" ? "cuerpoHtml" : "cuerpoTexto"
      const current = previous[field]
      const separator = current.trim() ? "\n" : ""
      return { ...previous, [field]: `${current}${separator}${value}` }
    })
  }, [])

  const handleVisualHtmlChange = useCallback((value: string) => {
    setForm((previous) => ({ ...previous, cuerpoHtml: value, emailFormat: "html" }))
  }, [])

  const handleVisualStructureChange = useCallback((value: string) => {
    setVisualStructure(value)
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

  const previewVariableValues = useMemo(() => {
    const prospecto = previewProspecto
    const website = normalizeUrl(form.websiteBaseUrl)
    const tracking = (() => {
      try {
        const url = new URL(website)
        url.searchParams.set("utm_source", "prospeccion")
        url.searchParams.set("utm_medium", "email")
        url.searchParams.set("utm_campaign", form.campanaId)
        url.searchParams.set("utm_content", "preview")
        return url.toString()
      } catch {
        return website
      }
    })()
    const booking = (() => {
      try {
        const url = new URL("/demo.html", website)
        url.searchParams.set("utm_source", "prospeccion")
        url.searchParams.set("utm_medium", "email")
        url.searchParams.set("utm_campaign", form.campanaId)
        url.searchParams.set("intent", "demo_booking")
        return url.toString()
      } catch {
        return website
      }
    })()
    const whatsapp = (() => {
      const phone = tenantPhone.replace(/\D+/g, "")
      const phrase = waRules.find((rule) => rule.id === selectedWaRuleId)?.frase_objetivo?.trim() ?? ""
      if (!phone) return ""
      return phrase
        ? `https://wa.me/${phone}?text=${encodeURIComponent(phrase)}`
        : `https://wa.me/${phone}`
    })()
    const custom = (() => {
      const raw = form.internalLinkUrl.trim()
      if (!raw) return ""
      try {
        return raw.startsWith("/") ? new URL(raw, website).toString() : normalizeUrl(raw)
      } catch {
        return ""
      }
    })()
    const imageUrls = Object.fromEntries(
      IMAGE_SLOTS.map(({ key }) => {
        const asset = logos.find((logo) => logo.id === imageIds[key])
        return [key, asset?.file_url ?? ""]
      }),
    )
    return {
      display_name: prospecto?.display_name?.trim() || "María",
      nombre: prospecto?.nombre?.trim() || "María",
      titulo: prospecto?.titulo?.trim() || "Directora",
      primer_apellido: prospecto?.primer_apellido?.trim() || "García",
      segundo_apellido: prospecto?.segundo_apellido?.trim() || "",
      empresa: prospecto?.nombre_comercial?.trim() || prospecto?.segmento?.trim() || "Empresa de ejemplo",
      email: prospecto?.email?.trim() || prospecto?.correo_principal?.trim() || "contacto@ejemplo.com",
      telefono: prospecto?.phone_e164?.trim() || prospecto?.phone?.trim() || "5555555555",
      segmento: prospecto?.segmento?.trim() || prospecto?.actividad?.trim() || "su industria",
      canal_origen: prospecto?.fuente === "google_places" ? "Google" : prospecto?.fuente === "denue" ? "DENUE" : "Manual",
      tracking_url: tracking,
      website_url: website,
      booking_url: booking,
      booking_link_text: form.demoLinkLabel || "Agenda tu demo",
      whatsapp_url: whatsapp,
      whatsapp_link_text: waLinkLabel || "Escríbenos por WhatsApp",
      custom_url: custom,
      website_link_text: form.websiteLinkLabel || "Visitar sitio web",
      ...imageUrls,
    }
  }, [
    form.campanaId,
    form.demoLinkLabel,
    form.internalLinkUrl,
    form.websiteBaseUrl,
    form.websiteLinkLabel,
    imageIds,
    logos,
    normalizeUrl,
    previewProspecto,
    selectedWaRuleId,
    tenantPhone,
    waLinkLabel,
    waRules,
  ])

  const renderPreviewVariables = useCallback((value: string) => {
    return value.replace(PREVIEW_VARIABLE_PATTERN, (match, key: string) => {
      const resolved = previewVariableValues[key as keyof typeof previewVariableValues]
      return resolved == null ? match : String(resolved)
    })
  }, [previewVariableValues])

  const previewHtml = useMemo(
    () => renderPreviewVariables(form.cuerpoHtml),
    [form.cuerpoHtml, renderPreviewVariables],
  )

  const previewText = useMemo(
    () => renderPreviewVariables(form.cuerpoTexto),
    [form.cuerpoTexto, renderPreviewVariables],
  )

  const waMeUrl = useMemo(() => {
    const phone = tenantPhone.replace(/\D+/g, "")
    const phrase = waRules.find((rule) => rule.id === selectedWaRuleId)?.frase_objetivo?.trim() ?? ""
    if (!phone || !phrase) return ""
    return `https://wa.me/${phone}?text=${encodeURIComponent(phrase)}`
  }, [selectedWaRuleId, tenantPhone, waRules])

  const customAiUrl = useMemo(() => {
    const raw = form.internalLinkUrl.trim()
    if (!raw) return ""
    try {
      const base = normalizeUrl(form.websiteBaseUrl)
      const url = raw.startsWith("/") ? new URL(raw, base) : new URL(normalizeUrl(raw))
      return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : ""
    } catch {
      return ""
    }
  }, [form.internalLinkUrl, form.websiteBaseUrl, normalizeUrl])

  const aiVariableValues = useMemo(
    () => ({ whatsapp_url: waMeUrl, custom_url: customAiUrl }),
    [customAiUrl, waMeUrl],
  )

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

  const handlePublishLatest = async () => {
    if (!form.id) return setError("Guarda primero la plantilla para poder publicarla.")
    const latestDraft = versions.find((version) => version.estado === "borrador")
    if (!latestDraft) return setError("No hay un borrador de versión para publicar.")
    setSaving(true)
    setError(null)
    try {
      const response = await publishContactoTemplateVersion(form.id, latestDraft.id)
      setVersions((current) => current.map((version) => (
        version.id === response.version.id
          ? response.version
          : version.estado === "publicada" ? { ...version, estado: "archivada" } : version
      )))
      setNotice("Versión publicada correctamente.")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo publicar la versión.")
    } finally {
      setSaving(false)
    }
  }

  const handleSendTest = async () => {
    const recipient = testRecipient.trim()
    if (!recipient) {
      setError("Escribe el correo que recibirá la prueba.")
      return
    }
    setTestSending(true)
    setError(null)
    setNotice(null)
    try {
      const response = await sendContactoTemplateTest({
        destinatario: recipient,
        asunto: form.asunto.trim(),
        cuerpo_texto: form.emailFormat === "texto" ? form.cuerpoTexto : null,
        cuerpo_html: form.emailFormat === "html" ? form.cuerpoHtml : null,
        campana_id: form.campanaId,
        template_id: form.id || null,
      })
      setNotice(`Prueba enviada a ${response.recipient}. Variables tomadas de: ${response.sample_prospect}.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo enviar la prueba.")
    } finally {
      setTestSending(false)
    }
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
    if (form.canal === "correo" && !form.emailCreationMode) return setError("Selecciona cómo quieres crear la plantilla.")
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
        email_message_kind: form.canal === "correo" ? form.emailMessageKind : null,
        email_creation_mode: form.canal === "correo" ? form.emailCreationMode : "visual",
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

      let savedTemplateId = form.id
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
          savedTemplateId = created.id
        }
      }

      if (form.canal === "correo" && savedTemplateId) {
        const visualBlocks = form.emailCreationMode === "visual" && form.emailFormat === "html"
          ? (() => {
              try {
                const parsed = JSON.parse(visualStructure) as unknown
                return Array.isArray(parsed) ? parsed as VisualStructureBlock[] : []
              } catch {
                return []
              }
            })()
          : []
        const versionResponse = await createContactoTemplateVersion(savedTemplateId, {
          metodo_creacion: form.emailCreationMode ?? "visual",
          asunto: form.asunto.trim() || null,
          cuerpo_texto: form.emailFormat === "texto" ? form.cuerpoTexto : null,
          cuerpo_html: form.emailFormat === "html" ? form.cuerpoHtml : null,
          bloques: visualBlocks.map((block, index) => ({
            orden: index,
            tipo_bloque: block.kind === "text" ? "texto" : block.kind === "image" ? "imagen" : block.kind === "button" ? "boton" : block.kind === "divider" ? "separador" : block.kind === "space" ? "espacio" : block.kind === "columns" ? "columnas" : "firma",
            titulo: block.title,
            contenido: block.content,
            destino_url: block.href,
            logo_id: block.imageId,
            columnas: (block.columns ?? []).map((column, columnIndex) => ({
              orden: columnIndex as 0 | 1,
              ancho_porcentaje: column.width ?? (columnIndex === 0 ? 50 : 50),
              elementos: (column.elements ?? []).map((element, elementIndex) => ({
                orden: elementIndex,
                tipo_elemento: element.kind === "text" ? "texto" : element.kind === "image" ? "imagen" : "boton",
                contenido: element.content,
                destino_url: element.href,
                logo_id: element.imageId,
              })),
            })),
          })),
        })
        setVersions((current) => [versionResponse.version, ...current])
      }

      if (!form.id && savedTemplateId) {
        router.replace(
          `/prospeccion/campanas/plantillas/${savedTemplateId}/editar?campana_id=${encodeURIComponent(form.campanaId)}`,
        )
        return
      }

      setNotice(form.canal === "correo" ? "Borrador de versión guardado correctamente." : form.id ? "Plantilla actualizada correctamente." : "Plantilla guardada correctamente.")
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
    <div className="w-full space-y-6 pb-10">
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
          {form.id && versions.some((version) => version.estado === "borrador") ? (
            <Button
              type="button"
              variant="secondary"
              className="flex-1 sm:flex-none"
              onClick={() => void handlePublishLatest()}
              disabled={saving}
            >
              Publicar versión
            </Button>
          ) : null}
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

      {form.canal === "correo" && !needsEmailCreationMode ? (
        <section className="rounded-xl border bg-muted/20 px-4 py-4 sm:px-5" aria-label="Enviar prueba">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="min-w-0 flex-1 space-y-2">
              <Label htmlFor="template-test-recipient">Correo que recibirá la prueba</Label>
              <Input
                id="template-test-recipient"
                type="email"
                value={testRecipient}
                onChange={(event) => setTestRecipient(event.target.value)}
                placeholder="tu-correo@dominio.com"
              />
              <p className="text-xs text-muted-foreground">
                Se usará un prospecto aleatorio solo para sustituir las variables. El correo se enviará únicamente al destinatario que escribas.
              </p>
            </div>
            <Button type="button" onClick={() => void handleSendTest()} disabled={testSending || !form.asunto.trim()}>
              {testSending ? <IconLoader className="mr-2 size-4 animate-spin" /> : null}
              {testSending ? "Enviando..." : "Enviar prueba por correo normal"}
            </Button>
          </div>
        </section>
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
            <p className="text-sm text-muted-foreground">
              Aquí crearás una plantilla asociada a esta campaña. El canal no se puede cambiar desde esta pantalla.
            </p>
          </div>
        </section>
      ) : null}

      {needsEmailCreationMode ? (
        <Card className="w-full border-violet-200">
          <CardHeader className="text-center">
            <CardTitle>¿Cómo quieres crear esta plantilla?</CardTitle>
            <CardDescription>
              La plantilla quedará asociada a la campaña «{selectedCampaign?.nombre ?? ""}» y al canal Correo.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <button
              type="button"
              className="rounded-xl border p-5 text-left transition hover:border-violet-400 hover:bg-violet-50/50"
              onClick={() => setForm((previous) => ({ ...previous, emailCreationMode: "visual", emailFormat: "html" }))}
            >
              <span className="text-2xl">▦</span>
              <span className="mt-3 block font-semibold">Editor visual</span>
              <span className="mt-1 block text-sm text-muted-foreground">Construye el correo con bloques, imágenes, botones y variables.</span>
            </button>
            <button
              type="button"
              className="rounded-xl border p-5 text-left transition hover:border-violet-400 hover:bg-violet-50/50"
              onClick={() => setForm((previous) => ({ ...previous, emailCreationMode: "html", emailFormat: "html" }))}
            >
              <span className="font-mono text-2xl">&lt;/&gt;</span>
              <span className="mt-3 block font-semibold">Código HTML</span>
              <span className="mt-1 block text-sm text-muted-foreground">Escribe directamente el código del correo y revisa su vista previa.</span>
            </button>
            <button
              type="button"
              className="rounded-xl border border-violet-200 bg-violet-50/40 p-5 text-left transition hover:border-violet-400 hover:bg-violet-100/60"
              onClick={() => setForm((previous) => ({ ...previous, emailCreationMode: "ai", emailFormat: "html" }))}
            >
              <span className="text-2xl">✦</span>
              <span className="mt-3 block font-semibold">Asistente IA</span>
              <span className="mt-1 block text-sm text-muted-foreground">Elige imágenes, variables y estilo antes de escribir tu prompt.</span>
            </button>
          </CardContent>
        </Card>
      ) : null}

      {!needsEmailCreationMode && form.canal === "correo" ? (
        <section className="w-full space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Datos del correo</CardTitle>
              <CardDescription>Define la información básica que verá el destinatario y el tipo de envío.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_260px]">
              <div className="space-y-2">
                <Label htmlFor="email-template-name">Nombre de la plantilla</Label>
                <Input
                  id="email-template-name"
                  value={form.nombre}
                  onChange={(event) => setForm((previous) => ({ ...previous, nombre: event.target.value }))}
                  placeholder="Primer contacto comercial"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email-template-subject">Asunto del correo</Label>
                <Input
                  id="email-template-subject"
                  value={form.asunto}
                  onChange={(event) => setForm((previous) => ({ ...previous, asunto: event.target.value }))}
                  placeholder="Una idea para {{empresa}}"
                />
              </div>
              <div className="space-y-2">
                <Label>Tipo de envío</Label>
                <Select
                  value={form.emailMessageKind}
                  onValueChange={(value) => setForm((previous) => ({ ...previous, emailMessageKind: value as EmailMessageKind }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="broadcast">Campaña comercial</SelectItem>
                    <SelectItem value="transactional">Aviso transaccional</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contenido de la plantilla</CardTitle>
              <CardDescription>Trabaja únicamente con el método que elegiste al comenzar.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {form.emailCreationMode === "visual" ? (
                <VisualEmailTemplateEditor
                  value={form.cuerpoHtml}
                  assets={logos}
                  websiteBaseUrl={form.websiteBaseUrl}
                  whatsappRules={waRules}
                  tenantPhone={tenantPhone}
                  whatsappRulesLoading={waRulesLoading}
                  onChange={handleVisualHtmlChange}
                  onStructureChange={handleVisualStructureChange}
                  structure={visualStructure}
                />
              ) : null}

              {form.emailCreationMode === "html" ? (
                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="email-template-html">Código HTML</Label>
                      <p className="mt-1 text-xs text-muted-foreground">Escribe o pega el HTML del correo. Puedes insertar datos del prospecto desde el catálogo.</p>
                    </div>
                    <Textarea
                      id="email-template-html"
                      className="min-h-[520px] resize-y font-mono text-xs leading-5"
                      value={form.cuerpoHtml}
                      onChange={(event) => setForm((previous) => ({ ...previous, cuerpoHtml: event.target.value, emailFormat: "html" }))}
                      placeholder="<p>Hola {{nombre}}...</p>"
                    />
                    {emailVariables.length ? (
                      <div className="flex flex-wrap gap-2">
                        {emailVariables.map((variable) => (
                          <Button key={variable.clave} type="button" variant="outline" size="sm" onClick={() => appendToContent(`{{${variable.clave}}}`)}>
                            {variable.etiqueta}
                          </Button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="overflow-hidden rounded-lg border bg-muted/30">
                    <div className="border-b bg-background px-4 py-3 text-sm font-medium">Vista previa</div>
                    <iframe
                      title="Vista previa del correo HTML"
                      className="h-[600px] w-full bg-white"
                      sandbox=""
                      srcDoc={previewHtml || "<p style='font:14px sans-serif;padding:24px;color:#888'>La vista previa aparecerá aquí.</p>"}
                    />
                  </div>
                </div>
              ) : null}

              {form.emailCreationMode === "ai" ? (
                <TemplateAiAssistant
                  canal="correo"
                  campanaId={form.campanaId || null}
                  variableValues={aiVariableValues}
                  onApply={applyDraft}
                />
              ) : null}
            </CardContent>
          </Card>
        </section>
      ) : null}

      {!needsEmailCreationMode && form.canal !== "correo" ? <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
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
                  <span>WhatsApp</span>
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
                Redacta el mensaje que se enviará por WhatsApp.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {
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
              }
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
                {IMAGE_SLOTS.map((slot) => {
                  const assignedLogo = logos.find((logo) => logo.id === imageIds[slot.key]) ?? null
                  return (
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
                        <SelectTrigger className="h-12 w-full">
                          {assignedLogo ? (
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded border bg-white">
                                <Image
                                  src={assignedLogo.file_url}
                                  alt=""
                                  width={64}
                                  height={64}
                                  unoptimized
                                  className="max-h-full w-auto max-w-full object-contain"
                                />
                              </span>
                              <span className="truncate">{assignedLogo.nombre}</span>
                            </span>
                          ) : (
                            <SelectValue placeholder="Sin imagen" />
                          )}
                        </SelectTrigger>
                        <SelectContent className="min-w-[280px]">
                          <SelectItem value="__none__">Sin imagen</SelectItem>
                          {logos.map((logo) => (
                            <SelectItem key={logo.id} value={logo.id} textValue={logo.nombre} className="py-2">
                              <span className="flex min-w-0 items-center gap-3">
                                <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded border bg-white">
                                  <Image
                                    src={logo.file_url}
                                    alt=""
                                    width={80}
                                    height={80}
                                    unoptimized
                                    className="max-h-full w-auto max-w-full object-contain"
                                  />
                                </span>
                                <span className="truncate">{logo.nombre}</span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="font-mono text-xs text-muted-foreground">{`{{${slot.key}}}`}</p>
                    </div>
                  )
                })}
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

        {form.canal === "whatsapp" || form.emailCreationMode === "ai" ? (
          <aside className="space-y-6 xl:sticky xl:top-4">
            <TemplateAiAssistant
              canal={form.canal}
              campanaId={form.campanaId || null}
              variableValues={aiVariableValues}
              onApply={applyDraft}
            />
          </aside>
        ) : null}
      </div> : null}

      {!needsEmailCreationMode && form.canal !== "correo" ? <Card>
        <CardHeader>
          <CardTitle className="text-base">Vista previa de la plantilla</CardTitle>
          <CardDescription>
            Revisa el resultado completo antes de guardar. Las variables se muestran con datos del primer prospecto disponible del tenant.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {previewLoading ? (
            <p className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
              <IconLoader className="size-3.5 animate-spin" /> Cargando datos reales para la vista previa...
            </p>
          ) : null}
          {previewError ? (
            <p className="mb-3 text-xs text-amber-700">
              {previewError} Se muestran valores de ejemplo para que puedas revisar el diseño.
            </p>
          ) : null}
          {(form.canal as Channel) === "correo" && form.emailFormat === "html" ? (
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
                {previewText || "El contenido aparecerá aquí."}
              </pre>
            </div>
          )}
        </CardContent>
      </Card> : null}
    </div>
  )
}
