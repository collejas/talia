"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { IconAlertTriangle, IconLoader, IconPencil, IconRefresh, IconTargetArrow, IconX } from "@tabler/icons-react"
import Image from "next/image"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import {
  createCrmCampaign,
  createContactoTemplate,
  deleteContactoTemplate,
  deleteProspeccionCampana,
  getProspeccionCampanaAtribucion,
  importBrevoContactoTemplate,
  listBrevoCatalogTemplates,
  listContactoTemplates,
  listCrmCampaigns,
  updateContactoTemplate,
  updateProspeccionCampana,
  getProspeccionCampanas,
  listProspectosQueryMetadata,
  type BrevoCatalogTemplate,
  type CrmCampaign,
  type ContactoTemplate,
  type ProspeccionCampanaAtribucionItem,
  type ProspeccionCampanaGroup,
} from "@/lib/prospeccion/prospectos-client"

const canalLabel: Record<string, string> = {
  correo: "Correo",
  whatsapp: "WhatsApp",
  llamada: "Llamada",
  voz: "Voz",
}

type LogoAsset = {
  id: string
  nombre: string
  file_url: string
}

const EMAIL_LOGO_IMG_STYLE = "width:83.333%;height:auto;display:block;margin:0 auto;"

export function CampanasMetricsClient() {
  const [campanas, setCampanas] = useState<ProspeccionCampanaGroup[]>([])
  const [campanasLoading, setCampanasLoading] = useState(false)
  const [campanasError, setCampanasError] = useState<string | null>(null)
  const [atribucionItems, setAtribucionItems] = useState<ProspeccionCampanaAtribucionItem[]>([])
  const [atribucionLoading, setAtribucionLoading] = useState(false)
  const [atribucionError, setAtribucionError] = useState<string | null>(null)
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
  const [queryLabelMap, setQueryLabelMap] = useState<Record<string, string>>({})
  const [brevoCatalog, setBrevoCatalog] = useState<BrevoCatalogTemplate[]>([])
  const [brevoLoading, setBrevoLoading] = useState(false)
  const [brevoImportingId, setBrevoImportingId] = useState<number | null>(null)
  const [tenantBaseUrl, setTenantBaseUrl] = useState<string>("")
  const [logos, setLogos] = useState<LogoAsset[]>([])
  const [logosLoading, setLogosLoading] = useState(false)
  const [logoUploading, setLogoUploading] = useState(false)
  const [selectedLogoUrl, setSelectedLogoUrl] = useState<string>("")
  const logoFileInputRef = useRef<HTMLInputElement | null>(null)
  const correoTextoRef = useRef<HTMLTextAreaElement | null>(null)
  const correoHtmlRef = useRef<HTMLTextAreaElement | null>(null)
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
    nombreIa: "",
    nombreEmpresa: "",
    ctaBaseUrl: "https://talia.mx/",
  })
  const [banner, setBanner] = useState<{ type: "success" | "error"; message: string } | null>(null)

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

  const fetchAtribucion = useCallback(async () => {
    setAtribucionLoading(true)
    setAtribucionError(null)
    try {
      const response = await getProspeccionCampanaAtribucion({ limit: 250 })
      setAtribucionItems(Array.isArray(response?.items) ? response.items : [])
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo cargar la atribución por plantilla."
      setAtribucionError(message)
      setAtribucionItems([])
    } finally {
      setAtribucionLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchAtribucion()
  }, [fetchAtribucion])

  useEffect(() => {
    let cancelled = false
    const loadQueryLabels = async () => {
      const batches = campanas.flatMap((group) => group.batches ?? [])
      const values = Array.from(new Set(batches.flatMap((batch) => extractBatchQueryValues(batch.filtros))))
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
  }, [campanas])

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

  const normalizeLogoUrl = useCallback((value: string) => {
    const trimmed = value.trim()
    return trimmed || ""
  }, [])

  const normalizeWebBaseUrl = useCallback((value: string | null | undefined) => {
    const raw = (value || "").trim()
    if (!raw) return ""
    if (/^https?:\/\//i.test(raw)) return raw
    return `https://${raw}`
  }, [])

  useEffect(() => {
    if (!templatesDialogOpen) return
    void (async () => {
      try {
        const response = await fetch("/api/settings/variables", { cache: "no-store" })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok || !payload || typeof payload !== "object") return
        const sitioWeb = normalizeWebBaseUrl(
          typeof (payload as Record<string, unknown>).sitio_web === "string"
            ? ((payload as Record<string, unknown>).sitio_web as string)
            : "",
        )
        const dominio = normalizeWebBaseUrl(
          typeof (payload as Record<string, unknown>).dominio_principal === "string"
            ? ((payload as Record<string, unknown>).dominio_principal as string)
            : "",
        )
        const resolved = sitioWeb || dominio || ""
        setTenantBaseUrl(resolved)
        setTemplateForm((prev) => ({ ...prev, ctaBaseUrl: resolved }))
      } catch {
        // keep fallback
      }
    })()
  }, [normalizeWebBaseUrl, templatesDialogOpen])

  const resetTemplateForm = useCallback(() => {
    setSelectedLogoUrl("")
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
      nombreIa: "",
      nombreEmpresa: "",
      ctaBaseUrl: "https://talia.mx/",
    })
  }, [templatesCampanaCanal])

  const appendTemplateToken = useCallback((field: "cuerpoTexto" | "cuerpoHtml", token: string) => {
    const fieldRef = field === "cuerpoTexto" ? correoTextoRef.current : correoHtmlRef.current
    setTemplateForm((prev) => {
      const current = prev[field] ?? ""
      if (!fieldRef) {
        const separator = current && !current.endsWith("\n") ? "\n" : ""
        return { ...prev, [field]: `${current}${separator}${token}` }
      }
      const start = fieldRef.selectionStart ?? current.length
      const end = fieldRef.selectionEnd ?? current.length
      const nextValue = `${current.slice(0, start)}${token}${current.slice(end)}`
      const caret = start + token.length
      window.requestAnimationFrame(() => {
        fieldRef.focus()
        fieldRef.setSelectionRange(caret, caret)
      })
      return { ...prev, [field]: nextValue }
    })
  }, [])

  const insertCorreoLogo = useCallback(
    (logoUrl: string) => {
      const normalized = normalizeLogoUrl(logoUrl)
      if (!normalized) return
      setSelectedLogoUrl(normalized)
      appendTemplateToken("cuerpoTexto", "{{logo_url}}")
      const htmlFocused = typeof document !== "undefined" && document.activeElement === correoHtmlRef.current
      const hasHtmlContent = Boolean((templateForm.cuerpoHtml ?? "").trim())
      if (htmlFocused || hasHtmlContent) {
        appendTemplateToken("cuerpoHtml", `<img src="{{logo_url}}" alt="Logo" style="${EMAIL_LOGO_IMG_STYLE}" />`)
      }
    },
    [appendTemplateToken, normalizeLogoUrl, templateForm.cuerpoHtml]
  )

  const loadLogos = useCallback(async () => {
    if (logosLoading) return
    setLogosLoading(true)
    setTemplateError(null)
    try {
      const response = await fetch("/api/settings/logos", { cache: "no-store" })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.detail === "string" ? payload.detail : "No se pudieron cargar los logos.")
      }
      const items = Array.isArray(payload?.logos) ? payload.logos : []
      const normalized = items
        .map((item: unknown) => {
          if (!item || typeof item !== "object") return null
          const row = item as Record<string, unknown>
          const fileUrl = typeof row.file_url === "string" ? row.file_url.trim() : ""
          if (!fileUrl) return null
          return {
            id: String(row.id ?? fileUrl),
            nombre: typeof row.nombre === "string" && row.nombre.trim() ? row.nombre.trim() : "Logo",
            file_url: fileUrl,
          } as LogoAsset
        })
        .filter((item: LogoAsset | null): item is LogoAsset => item != null)
      setLogos(normalized)
      if (normalized.length) setSelectedLogoUrl(normalized[0].file_url)
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudieron cargar los logos."
      setTemplateError(message)
    } finally {
      setLogosLoading(false)
    }
  }, [logosLoading])

  const whatsappMediaUrl = useMemo(() => {
    const base = normalizeLogoUrl(selectedLogoUrl)
    if (!base) return ""
    try {
      const url = new URL(base)
      url.searchParams.set("utm_source", "prospeccion")
      url.searchParams.set("utm_medium", "whatsapp_media")
      if (templatesCampanaId) url.searchParams.set("utm_campaign", templatesCampanaId)
      if (templateForm.slug.trim()) url.searchParams.set("template_slug", templateForm.slug.trim())
      if (templateForm.id) url.searchParams.set("template_id", templateForm.id)
      if (templateForm.canal) url.searchParams.set("canal", templateForm.canal)
      return url.toString()
    } catch {
      return base
    }
  }, [normalizeLogoUrl, selectedLogoUrl, templateForm.canal, templateForm.id, templateForm.slug, templatesCampanaId])

  const whatsappCtaUrl = useMemo(() => {
    const base = (tenantBaseUrl || templateForm.ctaBaseUrl || "").trim()
    if (!base) return ""
    try {
      const url = new URL(base)
      url.searchParams.set("utm_source", "prospeccion")
      url.searchParams.set("utm_medium", "whatsapp_cta")
      if (templatesCampanaId) url.searchParams.set("utm_campaign", templatesCampanaId)
      if (templateForm.slug.trim()) {
        url.searchParams.set("template_slug", templateForm.slug.trim())
        url.searchParams.set("kw", templateForm.slug.trim())
      }
      if (templateForm.id) url.searchParams.set("template_id", templateForm.id)
      if (templateForm.canal) url.searchParams.set("canal", templateForm.canal)
      return url.toString()
    } catch {
      return base
    }
  }, [templateForm.canal, templateForm.ctaBaseUrl, templateForm.id, templateForm.slug, templatesCampanaId, tenantBaseUrl])

  const handleLogoFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) return
      setLogoUploading(true)
      setTemplateError(null)
      try {
        const formData = new FormData()
        formData.append("file", file, file.name || "logo.png")
        formData.append("nombre", file.name || "Logo prospeccion")
        if (templatesCampanaId) formData.append("campana_id", templatesCampanaId)
        if (templateForm.canal) formData.append("canal", templateForm.canal)
        if (templateForm.id) formData.append("template_id", templateForm.id)
        if (templateForm.slug.trim()) formData.append("template_slug", templateForm.slug.trim())

        const response = await fetch("/api/settings/logos", {
          method: "POST",
          body: formData,
        })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(typeof payload?.detail === "string" ? payload.detail : "No se pudo subir la imagen.")
        }
        const uploaded = payload as LogoAsset
        setLogos((prev) => [uploaded, ...prev.filter((item) => item.id !== uploaded.id)])
        setSelectedLogoUrl(uploaded.file_url)
      } catch (err) {
        const message = err instanceof Error ? err.message : "No se pudo subir la imagen."
        setTemplateError(message)
      } finally {
        setLogoUploading(false)
        if (logoFileInputRef.current) logoFileInputRef.current.value = ""
      }
    },
    [templateForm.canal, templateForm.id, templateForm.slug, templatesCampanaId]
  )

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

  const loadBrevoCatalog = useCallback(async (canalOverride?: "correo" | "whatsapp" | "llamada" | null) => {
    const effectiveCanal = canalOverride ?? templatesCampanaCanal
    if (!effectiveCanal || effectiveCanal !== "correo") {
      setBrevoCatalog([])
      return
    }
    setBrevoLoading(true)
    try {
      const response = await listBrevoCatalogTemplates({ limit: 50 })
      setBrevoCatalog(Array.isArray(response?.items) ? response.items : [])
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo cargar el catálogo Brevo."
      setTemplateError(message)
      setBrevoCatalog([])
    } finally {
      setBrevoLoading(false)
    }
  }, [templatesCampanaCanal])

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
      setSelectedLogoUrl("")
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
        nombreIa: "",
        nombreEmpresa: "",
        ctaBaseUrl: "https://talia.mx/",
      })
      setTemplatesDialogOpen(true)
      await loadCampaignTemplates(campanaId)
      if (canal === "correo") {
        await loadBrevoCatalog(canal)
      } else {
        setBrevoCatalog([])
      }
    },
    [crmCampaigns, loadBrevoCatalog, loadCampaignTemplates]
  )

  const handleTemplateEdit = useCallback((template: ContactoTemplate) => {
    const metadata = template.metadata && typeof template.metadata === "object" ? template.metadata : {}
    const logoFromMetadata = typeof metadata["logo_url"] === "string" ? metadata["logo_url"].trim() : ""
    setSelectedLogoUrl(logoFromMetadata)
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
      nombreIa:
        (typeof metadata["nombre_ia"] === "string" ? metadata["nombre_ia"] : "") ||
        (typeof metadata["assistant_name"] === "string" ? metadata["assistant_name"] : ""),
      nombreEmpresa:
        (typeof metadata["organizacion_nombre"] === "string" ? metadata["organizacion_nombre"] : "") ||
        (typeof metadata["brand_name"] === "string" ? metadata["brand_name"] : "") ||
        (typeof metadata["empresa"] === "string" ? metadata["empresa"] : ""),
      ctaBaseUrl:
        (typeof metadata["tracking_base_url"] === "string" && metadata["tracking_base_url"].trim()) || "https://talia.mx/",
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
    const normalizedLogoUrl = normalizeLogoUrl(selectedLogoUrl)
    if (templateForm.canal === "correo" && normalizedLogoUrl) {
      metadata["logo_url"] = normalizedLogoUrl
    }
    if (templateForm.canal === "whatsapp" && normalizedLogoUrl) {
      metadata["media_url_base"] = normalizedLogoUrl
      if (whatsappMediaUrl) metadata["media_url_tracked"] = whatsappMediaUrl
    }
    if (templateForm.canal === "whatsapp") {
      metadata["tracking_base_url"] = (tenantBaseUrl || templateForm.ctaBaseUrl || "").trim() || null
      if (whatsappCtaUrl) metadata["cta_url_tracked"] = whatsappCtaUrl
    }
    if (templateForm.nombreIa.trim()) {
      metadata["nombre_ia"] = templateForm.nombreIa.trim()
      metadata["assistant_name"] = templateForm.nombreIa.trim()
    }
    if (templateForm.nombreEmpresa.trim()) {
      metadata["organizacion_nombre"] = templateForm.nombreEmpresa.trim()
      metadata["brand_name"] = templateForm.nombreEmpresa.trim()
      metadata["empresa"] = templateForm.nombreEmpresa.trim()
    }
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
  }, [loadCampaignTemplates, normalizeLogoUrl, resetTemplateForm, selectedLogoUrl, slugify, templateForm, templatesCampanaCanal, templatesCampanaId, tenantBaseUrl, whatsappCtaUrl, whatsappMediaUrl])

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

  const handleImportBrevoTemplate = useCallback(
    async (brevoTemplateId: number) => {
      if (!templatesCampanaId) {
        setTemplateError("Selecciona una campaña.")
        return
      }
      setBrevoImportingId(brevoTemplateId)
      setTemplateError(null)
      try {
        await importBrevoContactoTemplate({
          brevo_template_id: brevoTemplateId,
          campana_id: templatesCampanaId,
        })
        await loadCampaignTemplates(templatesCampanaId)
        setBanner({ type: "success", message: "Plantilla importada desde Brevo." })
      } catch (err) {
        const message = err instanceof Error ? err.message : "No se pudo importar la plantilla Brevo."
        setTemplateError(message)
      } finally {
        setBrevoImportingId(null)
      }
    },
    [loadCampaignTemplates, templatesCampanaId]
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
                        {resolveBatchQueryLabel(batch.filtros, queryLabelMap) ? (
                          <p className="text-xs text-muted-foreground">
                            Consulta: {resolveBatchQueryLabel(batch.filtros, queryLabelMap)}
                          </p>
                        ) : null}
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

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base font-semibold">Atribución por plantilla</CardTitle>
            <p className="text-sm text-muted-foreground">Métricas persistentes por campaña/canal/plantilla.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void fetchAtribucion()} disabled={atribucionLoading}>
            <IconRefresh className={cn("mr-2 size-4", atribucionLoading && "animate-spin")} />
            Actualizar
          </Button>
        </CardHeader>
        <CardContent>
          {atribucionError ? (
            <div className="mb-3 flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <IconAlertTriangle className="size-4" />
              <span>{atribucionError}</span>
            </div>
          ) : null}
          {!atribucionItems.length && !atribucionLoading ? (
            <p className="text-sm text-muted-foreground">Aún no hay datos de atribución por plantilla.</p>
          ) : null}
          {atribucionItems.length ? (
            <div className="space-y-2">
              {atribucionItems.slice(0, 25).map((item, index) => (
                <div key={`${item.campana_id || "sin"}-${item.template_id || item.template_slug || index}`} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">{item.template_nombre || item.template_slug || "Plantilla"}</p>
                      <p className="text-xs text-muted-foreground">
                        {(item.campana_nombre || "Sin campaña")} · {(canalLabel[item.canal || ""] || item.canal || "canal")}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <Badge variant="outline">Totales: {item.envios_totales}</Badge>
                      <Badge variant="outline">Entregados: {item.envios_entregados}</Badge>
                      <Badge variant="outline">Respondidos: {item.envios_respondidos}</Badge>
                      <Badge variant="outline">Aperturas: {item.brevo_aperturas}</Badge>
                      <Badge variant="outline">Clics: {item.brevo_clicks}</Badge>
                      <Badge variant="outline">Sesiones UTM: {item.sesiones_utm}</Badge>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span>Enviados: {item.envios_enviados}</span>
                    <span>Fallidos: {item.envios_fallidos}</span>
                    <span>Omitidos: {item.envios_omitidos}</span>
                    <span>Entrega: {formatPercent(item.tasa_entrega_pct)}</span>
                    <span>Respuesta: {formatPercent(item.tasa_respuesta_pct)}</span>
                    <span>Clic/Sesión: {formatPercent(item.click_to_session_pct)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          {atribucionLoading ? (
            <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <IconLoader className="size-4 animate-spin" /> Cargando atribución...
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
        <DialogContent className="w-[98vw] max-w-7xl max-h-[92vh] overflow-hidden p-3 sm:p-4">
          <DialogHeader>
            <DialogTitle className="text-base">Plantillas · {templatesCampanaNombre || "Campaña"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 lg:grid-cols-[0.6fr_1.4fr] h-[78vh] overflow-hidden">
            <div className="rounded-lg border p-2 overflow-y-auto text-xs">
              {templatesCampanaCanal === "correo" ? (
                <div className="mb-3 rounded-md border bg-muted/30 p-2">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide">Catálogo Brevo</p>
                    <Button type="button" variant="outline" size="sm" onClick={() => void loadBrevoCatalog()} disabled={brevoLoading}>
                      {brevoLoading ? "Cargando..." : "Actualizar"}
                    </Button>
                  </div>
                  {!brevoCatalog.length ? (
                    <p className="text-xs text-muted-foreground">Sin plantillas Brevo disponibles o sin configuración.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {brevoCatalog.slice(0, 12).map((item) => (
                        <div key={item.id} className="rounded border bg-background p-2">
                          <p className="text-xs font-medium">{item.name}</p>
                          <p className="truncate text-[11px] text-muted-foreground">{item.subject || "Sin asunto"}</p>
                          <div className="mt-1 flex items-center justify-between gap-2">
                            <Badge variant="outline">{item.is_active ? "Activa" : "Inactiva"}</Badge>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={brevoImportingId === item.id}
                              onClick={() => void handleImportBrevoTemplate(item.id)}
                            >
                              {brevoImportingId === item.id ? "Importando..." : "Importar"}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
              {templatesLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <IconLoader className="size-4 animate-spin" /> Cargando plantillas...
                </div>
              ) : null}
              {!templatesLoading && !templatesItems.length ? (
                <p className="text-sm text-muted-foreground">No hay plantillas para esta campaña.</p>
              ) : null}
              <div className="space-y-1.5">
                {templatesItems.map((template) => (
                  <div key={template.id} className="rounded-md border p-2">
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
            <div className="rounded-lg border p-2 overflow-y-auto space-y-2 text-xs">
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
              {templateForm.canal !== "whatsapp" ? (
                <>
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
                    <Input
                      value={templateForm.slug}
                      onChange={(event) => setTemplateForm((prev) => ({ ...prev, slug: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Descripción</Label>
                    <Input
                      value={templateForm.descripcion}
                      onChange={(event) => setTemplateForm((prev) => ({ ...prev, descripcion: event.target.value }))}
                    />
                  </div>
                </>
              ) : null}
              {templateForm.canal === "correo" ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label>Nombre IA (opcional)</Label>
                      <Input
                        value={templateForm.nombreIa}
                        onChange={(event) => setTemplateForm((prev) => ({ ...prev, nombreIa: event.target.value }))}
                        placeholder="Tal-IA"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Empresa (opcional)</Label>
                      <Input
                        value={templateForm.nombreEmpresa}
                        onChange={(event) => setTemplateForm((prev) => ({ ...prev, nombreEmpresa: event.target.value }))}
                        placeholder="Geoactiv"
                      />
                    </div>
                  </div>
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
                      ref={correoTextoRef}
                      rows={4}
                      value={templateForm.cuerpoTexto}
                      onChange={(event) => setTemplateForm((prev) => ({ ...prev, cuerpoTexto: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-2 rounded-md border p-2">
                    <input
                      ref={logoFileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => void handleLogoFileChange(event)}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => logoFileInputRef.current?.click()}
                        disabled={logoUploading}
                      >
                        {logoUploading ? "Subiendo..." : "Subir imagen"}
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => void loadLogos()} disabled={logosLoading}>
                        {logosLoading ? "Cargando..." : "Cargar galería"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => insertCorreoLogo(selectedLogoUrl)}
                        disabled={!selectedLogoUrl}
                      >
                        Insertar seleccionado
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      La imagen se guarda con contexto de campaña/canal/plantilla para trazabilidad.
                    </p>
                    {logos.length ? (
                      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                        {logos.map((logo) => (
                          <button
                            key={logo.id}
                            type="button"
                            className={cn(
                              "rounded border p-1 text-left",
                              selectedLogoUrl === logo.file_url ? "border-primary" : "border-border"
                            )}
                            onClick={() => setSelectedLogoUrl(logo.file_url)}
                          >
                            <Image
                              src={logo.file_url}
                              alt={logo.nombre}
                              width={160}
                              height={48}
                              unoptimized
                              className="h-12 w-full rounded object-contain"
                            />
                            <p className="mt-1 truncate text-[10px] text-muted-foreground">{logo.nombre}</p>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="space-y-1">
                    <Label>Cuerpo (HTML)</Label>
                    <Textarea
                      ref={correoHtmlRef}
                      rows={5}
                      value={templateForm.cuerpoHtml}
                      onChange={(event) => setTemplateForm((prev) => ({ ...prev, cuerpoHtml: event.target.value }))}
                    />
                    <p className="text-xs text-muted-foreground">
                      Variables: {"{{nombre}}, {{empresa}}, {{email}}, {{telefono}}, {{segmento}}, {{logo_url}}"}.
                    </p>
                  </div>
                </>
              ) : null}
              {templateForm.canal === "whatsapp" ? (
                <>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label>Twilio Content SID</Label>
                      <Input
                        value={templateForm.twilioSid}
                        onChange={(event) => setTemplateForm((prev) => ({ ...prev, twilioSid: event.target.value }))}
                        placeholder="HX..."
                      />
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
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label>Slug</Label>
                      <Input
                        value={templateForm.slug}
                        onChange={(event) => setTemplateForm((prev) => ({ ...prev, slug: event.target.value }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Descripción</Label>
                      <Input
                        value={templateForm.descripcion}
                        onChange={(event) => setTemplateForm((prev) => ({ ...prev, descripcion: event.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label>Nombre IA (opcional)</Label>
                      <Input
                        value={templateForm.nombreIa}
                        onChange={(event) => setTemplateForm((prev) => ({ ...prev, nombreIa: event.target.value }))}
                        placeholder="Tal-IA"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Empresa (opcional)</Label>
                      <Input
                        value={templateForm.nombreEmpresa}
                        onChange={(event) => setTemplateForm((prev) => ({ ...prev, nombreEmpresa: event.target.value }))}
                        placeholder="Geoactiv"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>Mensaje</Label>
                    <Textarea
                      rows={4}
                      value={templateForm.cuerpoTexto}
                      onChange={(event) => setTemplateForm((prev) => ({ ...prev, cuerpoTexto: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-2 rounded-md border p-2">
                    <input
                      ref={logoFileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => void handleLogoFileChange(event)}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => logoFileInputRef.current?.click()}
                        disabled={logoUploading}
                      >
                        {logoUploading ? "Subiendo..." : "Subir imagen"}
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => void loadLogos()} disabled={logosLoading}>
                        {logosLoading ? "Cargando..." : "Cargar galería"}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Se guarda con contexto de campaña/canal/plantilla para trazabilidad.
                    </p>
                    {logos.length ? (
                      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                        {logos.map((logo) => (
                          <button
                            key={logo.id}
                            type="button"
                            className={cn(
                              "rounded border p-1 text-left",
                              selectedLogoUrl === logo.file_url ? "border-primary" : "border-border"
                            )}
                            onClick={() => setSelectedLogoUrl(logo.file_url)}
                          >
                            <Image
                              src={logo.file_url}
                              alt={logo.nombre}
                              width={160}
                              height={48}
                              unoptimized
                              className="h-12 w-full rounded object-contain"
                            />
                            <p className="mt-1 truncate text-[10px] text-muted-foreground">{logo.nombre}</p>
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label>URL de imagen para Twilio Media</Label>
                        <div className="flex gap-2">
                          <Input value={whatsappMediaUrl} readOnly placeholder="Sube o selecciona una imagen..." />
                          <Button
                            type="button"
                            variant="outline"
                            onClick={async () => {
                              if (!whatsappMediaUrl) return
                              try {
                                await navigator.clipboard.writeText(whatsappMediaUrl)
                                setBanner({ type: "success", message: "URL de imagen copiada." })
                              } catch {
                                setTemplateError("No se pudo copiar la URL.")
                              }
                            }}
                            disabled={!whatsappMediaUrl}
                          >
                            Copiar
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label>URL CTA con seguimiento</Label>
                        <div className="flex gap-2">
                          <Input value={whatsappCtaUrl} readOnly />
                          <Button
                            type="button"
                            variant="outline"
                            onClick={async () => {
                              if (!whatsappCtaUrl) return
                              try {
                                await navigator.clipboard.writeText(whatsappCtaUrl)
                                setBanner({ type: "success", message: "URL CTA copiada." })
                              } catch {
                                setTemplateError("No se pudo copiar la URL CTA.")
                              }
                            }}
                            disabled={!whatsappCtaUrl}
                          >
                            Copiar
                          </Button>
                        </div>
                      </div>
                    </div>
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
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

function extractBatchQueryValues(rawFilters: unknown): string[] {
  if (!isRecord(rawFilters)) return []
  const values: string[] = []
  const queryFilters = rawFilters["query_filters"]
  if (Array.isArray(queryFilters)) {
    queryFilters.forEach((item) => {
      const normalized = normalizeBusquedaLabel(item)
      if (normalized) values.push(normalized)
    })
  }
  const metadataQueries = rawFilters["metadata_queries"]
  if (Array.isArray(metadataQueries)) {
    metadataQueries.forEach((item) => {
      const normalized = normalizeBusquedaLabel(item)
      if (normalized) values.push(normalized)
    })
  }
  ;["query", "busqueda_query", "busqueda_id"].forEach((key) => {
    const normalized = normalizeBusquedaLabel(rawFilters[key])
    if (normalized) values.push(normalized)
  })
  return values
}

function resolveBatchQueryLabel(rawFilters: unknown, labelMap: Record<string, string>): string | null {
  const values = extractBatchQueryValues(rawFilters)
  if (!values.length) return null
  const labels = values.map((value) => sanitizeQueryDisplayLabel(labelMap[value] ?? value)).filter(Boolean) as string[]
  if (!labels.length) return null
  const unique = Array.from(new Set(labels))
  if (unique.length <= 2) return unique.join(", ")
  return `${unique.slice(0, 2).join(", ")} +${unique.length - 2}`
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "0%"
  return `${value.toFixed(2)}%`
}
