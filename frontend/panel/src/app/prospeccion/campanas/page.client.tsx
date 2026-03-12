"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  IconAlertTriangle,
  IconChevronDown,
  IconChevronRight,
  IconLoader,
  IconPencil,
  IconRefresh,
  IconTargetArrow,
  IconX,
} from "@tabler/icons-react"
import Image from "next/image"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import {
  createCrmCampaign,
  createContactoTemplate,
  deleteContactoTemplate,
  deleteProspeccionCampana,
  getProspeccionCampanaAtribucion,
  importBrevoContactoTemplate,
  listWhatsAppAtribucionReglas,
  listContactoEnvios,
  listContactoLogs,
  listBrevoCatalogTemplates,
  listContactoTemplates,
  listCrmCampaigns,
  listProspectos,
  updateContactoTemplate,
  updateProspeccionCampana,
  getProspeccionCampanas,
  type BrevoCatalogTemplate,
  type CrmCampaign,
  type ContactoTemplate,
  type ContactoEnvio,
  type ContactoLog,
  type WhatsAppAtribucionRule,
  type ProspeccionCampanaAtribucionItem,
  type ProspeccionCampanaGroup,
  type ProspectoItem,
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
const EMAIL_TEMPLATE_PLACEHOLDER_PATTERN = /{{\s*([\w.-]+)\s*}}/g
const EMAIL_TEMPLATE_VARIABLES: Array<{ token: string; label: string }> = [
  { token: "{{nombre}}", label: "Nombre" },
  { token: "{{empresa}}", label: "Empresa" },
  { token: "{{email}}", label: "Correo" },
  { token: "{{telefono}}", label: "Teléfono" },
  { token: "{{segmento}}", label: "Segmento" },
  { token: "{{canal_origen}}", label: "Canal origen" },
  { token: "{{logo_url}}", label: "Logo URL" },
  { token: "{{tracking_url}}", label: "Tracking URL" },
  { token: "{{website_url}}", label: "Website URL" },
]

type HierarchyTemplateNode = {
  key: string
  template_id?: string | null
  template_slug?: string | null
  template_nombre?: string | null
  canal?: string | null
  metrics: ProspeccionCampanaAtribucionItem
  batches: ProspeccionCampanaGroup["batches"]
}

type HierarchyCampaignNode = {
  key: string
  campana_id?: string | null
  campana_nombre: string
  metrics: ProspeccionCampanaAtribucionItem
  templates: HierarchyTemplateNode[]
}

type BatchDetailState = {
  loading: boolean
  error: string | null
  envios: ContactoEnvio[]
  logs: ContactoLog[]
}

type CorreoTemplateField = "asunto" | "cuerpoTexto" | "cuerpoHtml"

export function CampanasMetricsClient() {
  const [campanas, setCampanas] = useState<ProspeccionCampanaGroup[]>([])
  const [campanasLoading, setCampanasLoading] = useState(false)
  const [campanasError, setCampanasError] = useState<string | null>(null)
  const [atribucionItems, setAtribucionItems] = useState<ProspeccionCampanaAtribucionItem[]>([])
  const [atribucionLoading, setAtribucionLoading] = useState(false)
  const [atribucionError, setAtribucionError] = useState<string | null>(null)
  const [expandedCampaigns, setExpandedCampaigns] = useState<Record<string, boolean>>({})
  const [expandedTemplates, setExpandedTemplates] = useState<Record<string, boolean>>({})
  const [expandedBatches, setExpandedBatches] = useState<Record<string, boolean>>({})
  const [batchDetails, setBatchDetails] = useState<Record<string, BatchDetailState>>({})
  const [metricCanalFilter, setMetricCanalFilter] = useState<"todos" | "correo" | "whatsapp" | "llamada">("todos")
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
  const [templateCountByCampaign, setTemplateCountByCampaign] = useState<Record<string, number>>({})
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [templateSaving, setTemplateSaving] = useState(false)
  const [templateDeletingId, setTemplateDeletingId] = useState<string | null>(null)
  const [templateError, setTemplateError] = useState<string | null>(null)
  const [brevoCatalog, setBrevoCatalog] = useState<BrevoCatalogTemplate[]>([])
  const [brevoLoading, setBrevoLoading] = useState(false)
  const [brevoImportingId, setBrevoImportingId] = useState<number | null>(null)
  const [waRules, setWaRules] = useState<WhatsAppAtribucionRule[]>([])
  const [waRulesLoading, setWaRulesLoading] = useState(false)
  const [tenantBaseUrl, setTenantBaseUrl] = useState<string>("")
  const [tenantPhone, setTenantPhone] = useState<string>("")
  const [logos, setLogos] = useState<LogoAsset[]>([])
  const [logosLoading, setLogosLoading] = useState(false)
  const [logoUploading, setLogoUploading] = useState(false)
  const [selectedLogoUrl, setSelectedLogoUrl] = useState<string>("")
  const [previewProspecto, setPreviewProspecto] = useState<ProspectoItem | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const logoFileInputRef = useRef<HTMLInputElement | null>(null)
  const correoAsuntoRef = useRef<HTMLInputElement | null>(null)
  const correoTextoRef = useRef<HTMLTextAreaElement | null>(null)
  const correoHtmlRef = useRef<HTMLTextAreaElement | null>(null)
  const lastFocusedCorreoFieldRef = useRef<CorreoTemplateField | null>(null)
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
    twilioVariable6: "",
    nombreIa: "",
    nombreEmpresa: "",
    ctaBaseUrl: "https://talia.mx/",
    waRuleId: "",
    waPhrase: "",
    waLinkLabel: "",
  })
  const [banner, setBanner] = useState<{ type: "success" | "error"; message: string } | null>(null)

  const fetchCampanas = useCallback(async () => {
    setCampanasLoading(true)
    setCampanasError(null)
    try {
      const [resumen, campaignList, templatesResponse] = await Promise.all([
        getProspeccionCampanas(25),
        listCrmCampaigns(),
        listContactoTemplates(),
      ])
      const campaignMap = new Map<string, ProspeccionCampanaGroup>()
      ;(resumen.items ?? []).forEach((item) => {
        if (item.campana_id) {
          campaignMap.set(item.campana_id, item)
        }
      })
      const nextTemplateCounts: Record<string, number> = {}
      ;(templatesResponse.items ?? []).forEach((template) => {
        const metadata = template?.metadata && typeof template.metadata === "object" ? template.metadata : {}
        const campanaId = typeof metadata["campana_id"] === "string" ? metadata["campana_id"].trim() : ""
        if (!campanaId) return
        nextTemplateCounts[campanaId] = (nextTemplateCounts[campanaId] ?? 0) + 1
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
      setTemplateCountByCampaign(nextTemplateCounts)
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

  const loadBatchDetails = useCallback(async (batchId: string) => {
    const existing = batchDetails[batchId]
    if (existing?.loading || existing?.envios?.length || existing?.error) return
    setBatchDetails((prev) => ({
      ...prev,
      [batchId]: {
        loading: true,
        error: null,
        envios: [],
        logs: [],
      },
    }))
    try {
      const [enviosResp, logsResp] = await Promise.all([
        listContactoEnvios({ batch_id: batchId, limit: 500 }),
        listContactoLogs({ batch_id: batchId, limit: 500 }),
      ])
      setBatchDetails((prev) => ({
        ...prev,
        [batchId]: {
          loading: false,
          error: null,
          envios: enviosResp.items ?? [],
          logs: logsResp.items ?? [],
        },
      }))
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo cargar el detalle del envío."
      setBatchDetails((prev) => ({
        ...prev,
        [batchId]: {
          loading: false,
          error: message,
          envios: [],
          logs: [],
        },
      }))
    }
  }, [batchDetails])

  const toggleCampaign = useCallback((campaignKey: string) => {
    setExpandedCampaigns((prev) => ({ ...prev, [campaignKey]: !prev[campaignKey] }))
  }, [])

  const toggleTemplate = useCallback((templateNodeKey: string) => {
    setExpandedTemplates((prev) => ({ ...prev, [templateNodeKey]: !prev[templateNodeKey] }))
  }, [])

  const toggleBatch = useCallback((batchId: string) => {
    setExpandedBatches((prev) => {
      const next = !prev[batchId]
      if (next) {
        void loadBatchDetails(batchId)
      }
      return { ...prev, [batchId]: next }
    })
  }, [loadBatchDetails])

  const hierarchyCampaigns = useMemo<HierarchyCampaignNode[]>(() => {
    const campaignMap = new Map<string, HierarchyCampaignNode>()
    const campaignNameFallback = new Map<string, string>()
    crmCampaigns.forEach((campaign) => {
      campaignNameFallback.set(campaign.id, campaign.nombre || `Campaña ${campaign.id.slice(0, 8)}`)
    })
    campanas.forEach((group, index) => {
      const key = group.campana_id || `sin-campana-${index}`
      const baseMetrics = createEmptyAtribucionMetric({
        campana_id: group.campana_id,
        campana_nombre: group.campana_nombre || campaignNameFallback.get(group.campana_id || "") || "Sin campaña",
      })
      campaignMap.set(key, {
        key,
        campana_id: group.campana_id,
        campana_nombre: baseMetrics.campana_nombre || "Sin campaña",
        metrics: baseMetrics,
        templates: [],
      })
    })

    const templateMetricsMap = new Map<string, HierarchyTemplateNode>()
    atribucionItems.forEach((item, index) => {
      const campaignKey = item.campana_id || `sin-campana-atr-${index}`
      if (!campaignMap.has(campaignKey)) {
        campaignMap.set(campaignKey, {
          key: campaignKey,
          campana_id: item.campana_id,
          campana_nombre: item.campana_nombre || campaignNameFallback.get(item.campana_id || "") || "Sin campaña",
          metrics: createEmptyAtribucionMetric({
            campana_id: item.campana_id,
            campana_nombre: item.campana_nombre || campaignNameFallback.get(item.campana_id || "") || "Sin campaña",
          }),
          templates: [],
        })
      }
      const campaignNode = campaignMap.get(campaignKey)
      if (!campaignNode) return
      campaignNode.metrics = sumAtribucionMetrics(campaignNode.metrics, item)
      const templateKey = buildTemplateKey(item)
      const templateNodeKey = `${campaignKey}::${templateKey}`
      templateMetricsMap.set(templateNodeKey, {
        key: templateNodeKey,
        template_id: item.template_id,
        template_slug: item.template_slug,
        template_nombre: item.template_nombre,
        canal: item.canal,
        metrics: item,
        batches: [],
      })
    })

    campanas.forEach((group) => {
      const campaignKey = group.campana_id || "sin-campana"
      const campaignNode = campaignMap.get(campaignKey)
      if (!campaignNode) return
      const buckets = new Map<string, ProspeccionCampanaGroup["batches"]>()
      group.batches.forEach((batch) => {
        const identity = extractBatchTemplateIdentity(batch)
        const templateKey = buildTemplateKey({
          template_id: identity.templateId,
          template_slug: identity.templateSlug,
          canal: identity.canal,
        })
        const list = buckets.get(templateKey) ?? []
        list.push(batch)
        buckets.set(templateKey, list)
      })
      campaignNode.templates = Array.from(templateMetricsMap.values())
        .filter((templateNode) => templateNode.key.startsWith(`${campaignKey}::`))
        .map((templateNode) => ({
          ...templateNode,
          batches: buckets.get(buildTemplateKey(templateNode)) ?? [],
        }))
        .sort((a, b) => b.metrics.envios_totales - a.metrics.envios_totales)
    })

    return Array.from(campaignMap.values())
      .map((campaignNode) => {
        if (campaignNode.templates.length) return campaignNode
        const group = campanas.find((item) => item.campana_id === campaignNode.campana_id)
        if (!group?.batches?.length) return campaignNode
        const fallbackTemplate = createEmptyAtribucionMetric({
          campana_id: campaignNode.campana_id,
          campana_nombre: campaignNode.campana_nombre,
          template_nombre: "Sin plantilla",
          canal: inferCampaignCanal(group.batches),
        })
        return {
          ...campaignNode,
          templates: [
            {
              key: `${campaignNode.key}::fallback`,
              template_nombre: "Sin plantilla",
              canal: fallbackTemplate.canal,
              metrics: fallbackTemplate,
              batches: group.batches,
            },
          ],
        }
      })
      .sort((a, b) => b.metrics.envios_totales - a.metrics.envios_totales)
  }, [atribucionItems, campanas, crmCampaigns])

  const filteredHierarchyCampaigns = useMemo(() => {
    if (metricCanalFilter === "todos") return hierarchyCampaigns
    return hierarchyCampaigns.filter((campaignNode) => {
      const campaignCanal = resolveCampaignCanal(campaignNode)
      if (campaignCanal === metricCanalFilter) return true
      return campaignNode.templates.some((templateNode) => normalizeMetricCanal(templateNode.canal) === metricCanalFilter)
    })
  }, [hierarchyCampaigns, metricCanalFilter])

  useEffect(() => {
    const pendingBatchIds: string[] = []
    hierarchyCampaigns.forEach((campaignNode) => {
      campaignNode.templates.forEach((templateNode) => {
        if (!expandedTemplates[templateNode.key]) return
        templateNode.batches.forEach((batch) => {
          const existing = batchDetails[batch.id]
          if (existing?.loading || existing?.envios?.length || existing?.error) return
          pendingBatchIds.push(batch.id)
        })
      })
    })
    if (!pendingBatchIds.length) return
    pendingBatchIds.forEach((batchId) => {
      void loadBatchDetails(batchId)
    })
  }, [batchDetails, expandedTemplates, hierarchyCampaigns, loadBatchDetails])

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

  const normalizeWaPhone = useCallback((value: string | null | undefined) => {
    const raw = (value || "").trim()
    if (!raw) return ""
    const digits = raw.replace(/\D+/g, "")
    return digits
  }, [])

  const resolvePreviewCanalOrigen = useCallback((prospecto: ProspectoItem | null): string => {
    if (!prospecto) return ""
    const metadata = prospecto.metadata && typeof prospecto.metadata === "object" ? prospecto.metadata : null
    const metadataCanal =
      metadata && typeof metadata["prospeccion_canal"] === "string" ? String(metadata["prospeccion_canal"]).trim() : ""
    const raw = metadataCanal || (prospecto.fuente_busqueda || "").trim() || (prospecto.fuente || "").trim()
    const key = raw.toLowerCase()
    const labels: Record<string, string> = {
      google_places: "Google",
      denue: "Denue",
      buscador: "Web",
      manual: "Manual",
      usuario: "Usuario",
      correo: "Correo",
      whatsapp: "WhatsApp",
      llamada: "Llamada",
      otro: "Otro",
    }
    return labels[key] ?? raw
  }, [])

  const loadPreviewProspecto = useCallback(async () => {
    if (previewLoading) return
    setPreviewLoading(true)
    setPreviewError(null)
    try {
      const response = await listProspectos({
        limit: 1,
        offset: 0,
        order: "creado",
      })
      const item = Array.isArray(response?.items) ? response.items[0] : null
      if (!item) {
        setPreviewProspecto(null)
        setPreviewError("No hay prospectos para generar vista previa.")
        return
      }
      setPreviewProspecto(item)
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo cargar el prospecto de vista previa."
      setPreviewError(message)
      setPreviewProspecto(null)
    } finally {
      setPreviewLoading(false)
    }
  }, [previewLoading])

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
        const telefono =
          typeof (payload as Record<string, unknown>).telefono === "string"
            ? ((payload as Record<string, unknown>).telefono as string).trim()
            : ""
        const resolved = sitioWeb || dominio || ""
        setTenantBaseUrl(resolved)
        setTenantPhone(telefono)
        setTemplateForm((prev) => ({
          ...prev,
          ctaBaseUrl: resolved || prev.ctaBaseUrl,
        }))
      } catch {
        // keep fallback
      }
    })()
  }, [normalizeWebBaseUrl, templatesDialogOpen])

  useEffect(() => {
    if (!templatesDialogOpen) {
      setPreviewProspecto(null)
      setPreviewError(null)
      return
    }
    if (templateForm.canal !== "correo") return
    if (previewProspecto || previewLoading) return
    void loadPreviewProspecto()
  }, [loadPreviewProspecto, previewLoading, previewProspecto, templateForm.canal, templatesDialogOpen])

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
      twilioVariable6: "",
      nombreIa: "",
      nombreEmpresa: "",
      ctaBaseUrl: "https://talia.mx/",
      waRuleId: "",
      waPhrase: "",
      waLinkLabel: "",
    })
  }, [templatesCampanaCanal])

  const appendTemplateToken = useCallback((field: CorreoTemplateField, token: string) => {
    const fieldRef =
      field === "asunto" ? correoAsuntoRef.current : field === "cuerpoTexto" ? correoTextoRef.current : correoHtmlRef.current
    setTemplateForm((prev) => {
      const current = prev[field] ?? ""
      if (!fieldRef) {
        if (field === "asunto") {
          return { ...prev, [field]: `${current}${token}` }
        }
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

  const insertEmailVariable = useCallback(
    (token: string) => {
      const targetField = lastFocusedCorreoFieldRef.current ?? "cuerpoTexto"
      appendTemplateToken(targetField, token)
    },
    [appendTemplateToken]
  )

  const wrapTemplateSelection = useCallback(
    (
      field: "cuerpoTexto" | "cuerpoHtml",
      openTag: string,
      closeTag: string,
      placeholder = "texto",
    ) => {
      const fieldRef = field === "cuerpoTexto" ? correoTextoRef.current : correoHtmlRef.current
      setTemplateForm((prev) => {
        const current = prev[field] ?? ""
        if (!fieldRef) {
          const separator = current && !current.endsWith("\n") ? "\n" : ""
          return { ...prev, [field]: `${current}${separator}${openTag}${placeholder}${closeTag}` }
        }
        const start = fieldRef.selectionStart ?? current.length
        const end = fieldRef.selectionEnd ?? current.length
        const selected = current.slice(start, end) || placeholder
        const replacement = `${openTag}${selected}${closeTag}`
        const nextValue = `${current.slice(0, start)}${replacement}${current.slice(end)}`
        const caretStart = start + openTag.length
        const caretEnd = caretStart + selected.length
        window.requestAnimationFrame(() => {
          fieldRef.focus()
          fieldRef.setSelectionRange(caretStart, caretEnd)
        })
        return { ...prev, [field]: nextValue }
      })
    },
    []
  )

  const insertCorreoLogo = useCallback(
    (logoUrl: string) => {
      const normalized = normalizeLogoUrl(logoUrl)
      if (!normalized) return
      setSelectedLogoUrl(normalized)
      const textFocused = lastFocusedCorreoFieldRef.current === "cuerpoTexto"
      const htmlFocused = lastFocusedCorreoFieldRef.current === "cuerpoHtml"
      const hasHtmlContent = Boolean((templateForm.cuerpoHtml ?? "").trim())
      if (textFocused) {
        appendTemplateToken("cuerpoTexto", "{{logo_url}}")
      }
      if (htmlFocused || hasHtmlContent) {
        appendTemplateToken("cuerpoHtml", `<img src="{{logo_url}}" alt="Logo" style="${EMAIL_LOGO_IMG_STYLE}" />`)
      }
    },
    [appendTemplateToken, normalizeLogoUrl, templateForm.cuerpoHtml]
  )

  const insertCorreoTrackedLink = useCallback(() => {
    const htmlToken =
      '<a href="{{tracking_url}}" target="_blank" rel="noopener noreferrer">Visitar Sitio {{website_url}}</a>'
    appendTemplateToken("cuerpoHtml", htmlToken)
  }, [appendTemplateToken])

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
    const base = (templateForm.ctaBaseUrl || tenantBaseUrl || "").trim()
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

  const waMeUrl = useMemo(() => {
    const phoneDigits = normalizeWaPhone(tenantPhone)
    const selectedWaRule = waRules.find((rule) => rule.id === templateForm.waRuleId)
    const phrase = (templateForm.waPhrase || selectedWaRule?.frase_objetivo || "").trim()
    if (!phoneDigits || !phrase) return ""
    return `https://wa.me/${phoneDigits}?text=${encodeURIComponent(phrase)}`
  }, [normalizeWaPhone, templateForm.waPhrase, templateForm.waRuleId, tenantPhone, waRules])

  const waMeLinkLabel = useMemo(() => {
    const label = (templateForm.waLinkLabel || "").trim()
    return label || "Escríbenos por WhatsApp"
  }, [templateForm.waLinkLabel])

  const insertCorreoWaMeLink = useCallback(() => {
    if (!waMeUrl) {
      setTemplateError("Selecciona una frase de WhatsApp para insertar el enlace.")
      return
    }
    appendTemplateToken(
      "cuerpoHtml",
      `<a href="${waMeUrl}" target="_blank" rel="noopener noreferrer">${waMeLinkLabel}</a>`
    )
  }, [appendTemplateToken, waMeLinkLabel, waMeUrl])

  const previewTemplateContext = useMemo(() => {
    if (!previewProspecto) return null
    const nombre = (previewProspecto.display_name || "").trim()
    const segmento = (previewProspecto.segmento || "").trim()
    const empresa = (templateForm.nombreEmpresa || "").trim() || segmento
    const email = (previewProspecto.email || "").trim()
    const telefono = (previewProspecto.phone_e164 || previewProspecto.phone || "").trim()
    const canalOrigen = resolvePreviewCanalOrigen(previewProspecto)
    const websiteUrl =
      normalizeWebBaseUrl(templateForm.ctaBaseUrl || tenantBaseUrl || "https://talia.mx/") || "https://talia.mx/"
    const kw = (templateForm.slug || segmento || "general").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-")
    let trackingUrl = websiteUrl
    try {
      const url = new URL(websiteUrl)
      url.searchParams.set("utm_source", "prospeccion")
      url.searchParams.set("utm_medium", "email")
      url.searchParams.set("utm_campaign", "cold_outreach")
      url.searchParams.set("utm_content", "image")
      url.searchParams.set("kw", kw || "general")
      trackingUrl = url.toString()
    } catch {
      trackingUrl = websiteUrl
    }
    return {
      nombre,
      empresa,
      email,
      telefono,
      segmento,
      canal_origen: canalOrigen,
      logo_url: normalizeLogoUrl(selectedLogoUrl),
      tracking_url: trackingUrl,
      website_url: websiteUrl,
    }
  }, [
    normalizeLogoUrl,
    normalizeWebBaseUrl,
    previewProspecto,
    resolvePreviewCanalOrigen,
    selectedLogoUrl,
    templateForm.ctaBaseUrl,
    templateForm.nombreEmpresa,
    templateForm.slug,
    tenantBaseUrl,
  ])

  const renderWithPreviewContext = useCallback(
    (template: string) => {
      if (!template) return ""
      if (!previewTemplateContext) return template
      return template.replace(EMAIL_TEMPLATE_PLACEHOLDER_PATTERN, (_match, key: string) => {
        const value = previewTemplateContext[key as keyof typeof previewTemplateContext]
        return value == null ? "" : String(value)
      })
    },
    [previewTemplateContext]
  )

  const previewSubject = useMemo(
    () => renderWithPreviewContext((templateForm.asunto || "").trim()),
    [renderWithPreviewContext, templateForm.asunto]
  )
  const previewBodyText = useMemo(
    () => renderWithPreviewContext(templateForm.cuerpoTexto || ""),
    [renderWithPreviewContext, templateForm.cuerpoTexto]
  )
  const previewBodyHtml = useMemo(
    () => renderWithPreviewContext(templateForm.cuerpoHtml || ""),
    [renderWithPreviewContext, templateForm.cuerpoHtml]
  )

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

  const loadWaRules = useCallback(async () => {
    setWaRulesLoading(true)
    try {
      const response = await listWhatsAppAtribucionReglas({ limit: 500, activo: true })
      setWaRules(Array.isArray(response?.items) ? response.items : [])
    } catch {
      setWaRules([])
    } finally {
      setWaRulesLoading(false)
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
        twilioVariable6: "",
        nombreIa: "",
        nombreEmpresa: "",
        ctaBaseUrl: "https://talia.mx/",
        waRuleId: "",
        waPhrase: "",
        waLinkLabel: "",
      })
      setTemplatesDialogOpen(true)
      await loadWaRules()
      await loadCampaignTemplates(campanaId)
      if (canal === "correo") {
        await loadBrevoCatalog(canal)
      } else {
        setBrevoCatalog([])
      }
    },
    [crmCampaigns, loadBrevoCatalog, loadCampaignTemplates, loadWaRules]
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
      twilioVariable6:
        metadata["twilio_variables"] && typeof metadata["twilio_variables"] === "object"
          ? String((metadata["twilio_variables"] as Record<string, unknown>)["6"] ?? "")
          : "",
      nombreIa:
        (typeof metadata["nombre_ia"] === "string" ? metadata["nombre_ia"] : "") ||
        (typeof metadata["assistant_name"] === "string" ? metadata["assistant_name"] : ""),
      nombreEmpresa:
        (typeof metadata["organizacion_nombre"] === "string" ? metadata["organizacion_nombre"] : "") ||
        (typeof metadata["brand_name"] === "string" ? metadata["brand_name"] : "") ||
        (typeof metadata["empresa"] === "string" ? metadata["empresa"] : ""),
      ctaBaseUrl:
        (typeof metadata["tracking_base_url"] === "string" && metadata["tracking_base_url"].trim()) || "https://talia.mx/",
      waRuleId: (typeof metadata["wa_rule_id"] === "string" && metadata["wa_rule_id"].trim()) || "",
      waPhrase: (typeof metadata["wa_me_text"] === "string" && metadata["wa_me_text"].trim()) || "",
      waLinkLabel: (typeof metadata["wa_me_label"] === "string" && metadata["wa_me_label"].trim()) || "",
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
    if (templateForm.twilioVariable6.trim()) {
      metadata["twilio_variables"] = { "6": templateForm.twilioVariable6.trim() }
    }
    const normalizedLogoUrl = normalizeLogoUrl(selectedLogoUrl)
    if (templateForm.canal === "correo" && normalizedLogoUrl) {
      metadata["logo_url"] = normalizedLogoUrl
    }
    const normalizedWaPhone = normalizeWaPhone(tenantPhone)
    const selectedWaRule = waRules.find((rule) => rule.id === templateForm.waRuleId)
    const waPhrase = (templateForm.waPhrase || selectedWaRule?.frase_objetivo || "").trim()
    if (normalizedWaPhone) metadata["wa_me_phone"] = normalizedWaPhone
    if (waPhrase) metadata["wa_me_text"] = waPhrase
    if ((templateForm.waLinkLabel || "").trim()) metadata["wa_me_label"] = templateForm.waLinkLabel.trim()
    if (selectedWaRule?.id) {
      metadata["wa_rule_id"] = selectedWaRule.id
      metadata["wa_rule_name"] = selectedWaRule.nombre_regla ?? null
    }
    if (waMeUrl) metadata["wa_me_url"] = waMeUrl
    if (templateForm.canal === "whatsapp" && normalizedLogoUrl) {
      metadata["media_url_base"] = normalizedLogoUrl
      if (whatsappMediaUrl) metadata["media_url_tracked"] = whatsappMediaUrl
    }
    if (templateForm.canal === "correo" || templateForm.canal === "whatsapp") {
      metadata["tracking_base_url"] = (templateForm.ctaBaseUrl || tenantBaseUrl || "").trim() || null
    }
    if (templateForm.canal === "whatsapp") {
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
  }, [loadCampaignTemplates, normalizeLogoUrl, normalizeWaPhone, resetTemplateForm, selectedLogoUrl, slugify, templateForm, templatesCampanaCanal, templatesCampanaId, tenantBaseUrl, tenantPhone, waMeUrl, waRules, whatsappCtaUrl, whatsappMediaUrl])

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
              {(() => {
                const lotesCompletados = group.batches.reduce((sum, batch) => {
                  return sum + ((String(batch.estado || "").trim().toLowerCase() === "completado") ? 1 : 0)
                }, 0)
                const entregados = toNumber((group.totales as Record<string, unknown>)?.entregado)
                const totalPlantillas = group.campana_id ? (templateCountByCampaign[group.campana_id] ?? 0) : 0
                return (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{group.campana_nombre ?? "Sin campaña"}</p>
                  <p className="text-xs text-muted-foreground">Total de plantillas: {totalPlantillas}</p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="outline">Entregados: {entregados}</Badge>
                  <Badge variant="outline">Lotes completados: {lotesCompletados}</Badge>
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
                )
              })()}
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
            <CardTitle className="text-base font-semibold">Métricas jerárquicas de campaña</CardTitle>
            <p className="text-sm text-muted-foreground">Campaña → plantilla → envío/lote → contacto/prospecto.</p>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={metricCanalFilter}
              onValueChange={(value) => setMetricCanalFilter(value as "todos" | "correo" | "whatsapp" | "llamada")}
            >
              <SelectTrigger className="h-8 w-[170px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Canal: Todos</SelectItem>
                <SelectItem value="correo">Canal: Correo</SelectItem>
                <SelectItem value="whatsapp">Canal: WhatsApp</SelectItem>
                <SelectItem value="llamada">Canal: Llamada</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => void fetchAtribucion()} disabled={atribucionLoading}>
              <IconRefresh className={cn("mr-2 size-4", atribucionLoading && "animate-spin")} />
              Actualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {atribucionError ? (
            <div className="mb-3 flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <IconAlertTriangle className="size-4" />
              <span>{atribucionError}</span>
            </div>
          ) : null}
          <TooltipProvider delayDuration={120}>
            {!filteredHierarchyCampaigns.length && !atribucionLoading ? (
              <p className="text-sm text-muted-foreground">Aún no hay datos de métricas para campañas.</p>
            ) : null}
            {filteredHierarchyCampaigns.length ? (
              <div className="space-y-3">
              {filteredHierarchyCampaigns.map((campaignNode) => {
                const campaignOpen = Boolean(expandedCampaigns[campaignNode.key])
                const campaignCanal = resolveCampaignCanal(campaignNode)
                const campaignIsEmail = isEmailCanal(campaignCanal)
                const campaignDeliveredLabel = deliveryMetricLabel(campaignCanal)
                const campaignKpis = buildAtribucionKpis(campaignNode.metrics)
                return (
                  <div key={campaignNode.key} className="rounded-md border">
                    <button
                      type="button"
                      className="w-full p-3 text-left hover:bg-muted/40"
                      onClick={() => toggleCampaign(campaignNode.key)}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {campaignOpen ? <IconChevronDown className="size-4" /> : <IconChevronRight className="size-4" />}
                          <p className="text-sm font-semibold">{campaignNode.campana_nombre || "Sin campaña"}</p>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs">
                          <MetricBadgeTip label="Totales" value={campaignNode.metrics.envios_totales} help="Cantidad total de contactos incluidos en este nivel." />
                          <MetricBadgeTip label="Enviados" value={campaignNode.metrics.envios_enviados} help="Mensajes que sí se intentaron enviar." />
                          <MetricBadgeTip label={campaignDeliveredLabel} value={campaignNode.metrics.envios_entregados} help="Mensajes que sí llegaron al destinatario." />
                          <MetricBadgeTip label="Respondidos" value={campaignNode.metrics.envios_respondidos} help="Contactos que respondieron." />
                          <MetricBadgeTip label="Fallidos" value={campaignNode.metrics.envios_fallidos} help="Mensajes que no se pudieron entregar." />
                          <MetricBadgeTip label="Omitidos" value={campaignNode.metrics.envios_omitidos} help="Contactos que se saltaron por reglas o filtros." />
                          {campaignIsEmail ? (
                            <>
                              <MetricBadgeTip label="Aperturas" value={campaignNode.metrics.brevo_aperturas} help="Correos que fueron abiertos." />
                              <MetricBadgeTip label="Clics" value={campaignNode.metrics.brevo_clicks} help="Correos donde se hizo clic en un enlace." />
                              <MetricBadgeTip label="Visitas al sitio" value={campaignNode.metrics.sesiones_utm} help="Visitas a tu sitio originadas desde el correo." />
                            </>
                          ) : null}
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <MetricInlineTip label="Entrega" value={formatPercent(campaignKpis.entrega)} help="Porcentaje de contactos a los que sí les llegó el mensaje." />
                        <MetricInlineTip label="Respuesta" value={formatPercent(campaignKpis.respuesta)} help="Porcentaje de contactos que respondieron el mensaje." />
                        {campaignIsEmail ? (
                          <>
                            <MetricInlineTip label="Clic/Total" value={formatPercent(campaignKpis.clickTotal)} help="Porcentaje de enviados que hicieron clic en el correo." />
                            <MetricInlineTip label="Sesiones/Clic" value={formatPercent(campaignKpis.sesionesPorClick)} help="De quienes hicieron clic, cuántos iniciaron sesión en la web." />
                          </>
                        ) : null}
                      </div>
                    </button>

                    {campaignOpen ? (
                      <div className="space-y-2 border-t p-3">
                        {campaignNode.templates.length ? (
                          campaignNode.templates.map((templateNode) => {
                            const templateOpen = Boolean(expandedTemplates[templateNode.key])
                            const templateCanal = normalizeMetricCanal(templateNode.canal)
                            const templateIsEmail = isEmailCanal(templateCanal)
                            const templateDeliveredLabel = deliveryMetricLabel(templateCanal)
                            const templateKpis = buildAtribucionKpis(templateNode.metrics)
                            return (
                              <div key={templateNode.key} className="rounded border bg-muted/20">
                                <button
                                  type="button"
                                  className="w-full p-3 text-left hover:bg-muted/30"
                                  onClick={() => toggleTemplate(templateNode.key)}
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                      {templateOpen ? <IconChevronDown className="size-4" /> : <IconChevronRight className="size-4" />}
                                      <p className="text-sm font-medium">
                                        Plantilla: {templateNode.template_nombre || templateNode.template_slug || "Sin nombre"}
                                      </p>
                                    </div>
                                    <div className="flex flex-wrap gap-2 text-xs">
                                      <MetricBadgeTip label="Totales" value={templateNode.metrics.envios_totales} help="Cantidad total de contactos incluidos en este nivel." />
                                      <MetricBadgeTip label="Enviados" value={templateNode.metrics.envios_enviados} help="Mensajes que sí se intentaron enviar." />
                                      <MetricBadgeTip label={templateDeliveredLabel} value={templateNode.metrics.envios_entregados} help="Mensajes que sí llegaron al destinatario." />
                                      <MetricBadgeTip label="Respondidos" value={templateNode.metrics.envios_respondidos} help="Contactos que respondieron." />
                                      <MetricBadgeTip label="Fallidos" value={templateNode.metrics.envios_fallidos} help="Mensajes que no se pudieron entregar." />
                                      <MetricBadgeTip label="Omitidos" value={templateNode.metrics.envios_omitidos} help="Contactos que se saltaron por reglas o filtros." />
                                      {templateIsEmail ? (
                                        <>
                                          <MetricBadgeTip label="Aperturas" value={templateNode.metrics.brevo_aperturas} help="Correos que fueron abiertos." />
                                          <MetricBadgeTip label="Clics" value={templateNode.metrics.brevo_clicks} help="Correos donde se hizo clic en un enlace." />
                                          <MetricBadgeTip label="Visitas al sitio" value={templateNode.metrics.sesiones_utm} help="Visitas a tu sitio originadas desde el correo." />
                                        </>
                                      ) : null}
                                    </div>
                                  </div>
                                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                                    <span>Canal: {canalLabel[templateNode.canal || ""] || templateNode.canal || "—"}</span>
                                    <span>Lotes: {templateNode.batches.length}</span>
                                    <MetricInlineTip label="Entrega" value={formatPercent(templateKpis.entrega)} help="Porcentaje de contactos a los que sí les llegó el mensaje." />
                                    <MetricInlineTip label="Respuesta" value={formatPercent(templateKpis.respuesta)} help="Porcentaje de contactos que respondieron el mensaje." />
                                    {templateIsEmail ? (
                                      <>
                                        <MetricInlineTip label="Clic/Total" value={formatPercent(templateKpis.clickTotal)} help="Porcentaje de enviados que hicieron clic en el correo." />
                                        <MetricInlineTip label="Sesiones/Clic" value={formatPercent(templateKpis.sesionesPorClick)} help="De quienes hicieron clic, cuántos iniciaron sesión en la web." />
                                      </>
                                    ) : null}
                                  </div>
                                </button>

                                {templateOpen ? (
                                  <div className="space-y-2 border-t p-3">
                                    {templateNode.batches.length ? (
                                      templateNode.batches.map((batch, batchIndex) => {
                                        const batchOpen = Boolean(expandedBatches[batch.id])
                                        const detail = batchDetails[batch.id]
                                        const batchMetrics = buildBatchMetrics(batch, detail)
                                        const batchCanal = normalizeMetricCanal(batchMetrics.canal)
                                        const batchIsEmail = isEmailCanal(batchCanal)
                                        const batchDeliveredLabel = deliveryMetricLabel(batchCanal)
                                        return (
                                          <div key={batch.id} className="rounded border bg-background">
                                            <button
                                              type="button"
                                              className="w-full p-3 text-left hover:bg-muted/20"
                                              onClick={() => toggleBatch(batch.id)}
                                            >
                                              <div className="flex flex-wrap items-center justify-between gap-2">
                                                <div className="flex items-center gap-2">
                                                  {batchOpen ? <IconChevronDown className="size-4" /> : <IconChevronRight className="size-4" />}
                                                  <p className="text-sm font-medium">
                                                    {resolveBatchDisplayTitle(batchIndex)}
                                                  </p>
                                                </div>
                                                <div className="flex flex-wrap gap-2 text-xs">
                                                  <MetricBadgeTip label="Totales" value={batchMetrics.totales} help="Cantidad total de contactos incluidos en este nivel." />
                                                  <MetricBadgeTip label="Enviados" value={batchMetrics.enviados} help="Mensajes que sí se intentaron enviar." />
                                                  <MetricBadgeTip label={batchDeliveredLabel} value={batchMetrics.entregados} help="Mensajes que sí llegaron al destinatario." />
                                                  <MetricBadgeTip label="Respondidos" value={batchMetrics.respondidos} help="Contactos que respondieron." />
                                                  <MetricBadgeTip label="Fallidos" value={batchMetrics.fallidos} help="Mensajes que no se pudieron entregar." />
                                                  <MetricBadgeTip label="Omitidos" value={batchMetrics.omitidos} help="Contactos que se saltaron por reglas o filtros." />
                                                  {batchIsEmail ? (
                                                    <>
                                                      <MetricBadgeTip label="Aperturas" value={batchMetrics.aperturas} help="Correos que fueron abiertos." />
                                                      <MetricBadgeTip label="Clics" value={batchMetrics.clicks} help="Correos donde se hizo clic en un enlace." />
                                                      <MetricBadgeTip label="Visitas al sitio" value={batchMetrics.sesionesUtm} help="Visitas a tu sitio originadas desde el correo." />
                                                    </>
                                                  ) : (
                                                    <MetricBadgeTip label="Leídos" value={batchMetrics.leidos} help="Mensajes vistos por el contacto." />
                                                  )}
                                                </div>
                                              </div>
                                              <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                                                <MetricInlineTip label="Entrega" value={formatPercent(batchMetrics.tasaEntrega)} help="Porcentaje de contactos a los que sí les llegó el mensaje." />
                                                <MetricInlineTip label="Respuesta" value={formatPercent(batchMetrics.tasaRespuesta)} help="Porcentaje de contactos que respondieron el mensaje." />
                                                {batchIsEmail ? (
                                                  <>
                                                    <MetricInlineTip label="Clic/Total" value={formatPercent(batchMetrics.clickTotal)} help="Porcentaje de enviados que hicieron clic en el correo." />
                                                    <MetricInlineTip label="Sesiones/Clic" value={formatPercent(batchMetrics.sesionesPorClick)} help="De quienes hicieron clic, cuántos iniciaron sesión en la web." />
                                                  </>
                                                ) : null}
                                              </div>
                                            </button>

                                            {batchOpen ? (
                                              <div className="border-t p-3">
                                                {detail?.loading ? (
                                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                    <IconLoader className="size-4 animate-spin" /> Cargando detalle del envío...
                                                  </div>
                                                ) : detail?.error ? (
                                                  <p className="text-xs text-destructive">{detail.error}</p>
                                                ) : detail?.envios?.length ? (
                                                  <div className="space-y-1">
                                                    {detail.envios.map((envio) => {
                                                      const envioMetrics = buildEnvioMetrics(envio, detail.logs)
                                                      const envioIsEmail = isEmailCanal(envio.canal)
                                                      return (
                                                        <div key={envio.id} className="rounded border bg-muted/10 p-2">
                                                          <div className="flex flex-wrap items-center justify-between gap-2">
                                                            <p className="text-xs font-medium">
                                                              Prospecto: {resolveEnvioProspectLabel(envio)}
                                                            </p>
                                                            <div className="flex flex-wrap gap-2 text-[11px]">
                                                              <Badge variant="outline">{envio.estado}</Badge>
                                                              {envioIsEmail ? (
                                                                <>
                                                                  <MetricBadgeTip label="Aperturas" value={envioMetrics.aperturas} help="Si este correo fue abierto." />
                                                                  <MetricBadgeTip label="Clics" value={envioMetrics.clicks} help="Si este correo recibió clic en enlace." />
                                                                  <MetricBadgeTip label="Visita al sitio" value={envioMetrics.sesionUtm ? "Sí" : "No"} help="Si este clic terminó en una visita al sitio." />
                                                                </>
                                                              ) : (
                                                                <>
                                                                  <MetricBadgeTip label="Respondido" value={envioMetrics.respondido ? "Sí" : "No"} help="Si este contacto respondió el mensaje." />
                                                                  <MetricBadgeTip label="Leído" value={envioMetrics.leido ? "Sí" : "No"} help="Si este contacto vio el mensaje." />
                                                                </>
                                                              )}
                                                            </div>
                                                          </div>
                                                          <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                                                            <span>Segmento: {resolveEnvioSegmentoLabel(envio)}</span>
                                                            <span>Procesado: {formatDateTime(envio.procesado_en || envio.programado_en)}</span>
                                                            <MetricInlineTip label="Entrega" value={formatPercent(envioMetrics.tasaEntrega)} help="Si este contacto recibió el mensaje." />
                                                            <MetricInlineTip label="Respuesta" value={formatPercent(envioMetrics.tasaRespuesta)} help="Si este contacto respondió el mensaje." />
                                                            {envioIsEmail ? (
                                                              <>
                                                                <MetricInlineTip label="Clic/Total" value={formatPercent(envioMetrics.clickTotal)} help="Si este contacto hizo clic en el correo." />
                                                                <MetricInlineTip label="Sesiones/Clic" value={formatPercent(envioMetrics.sesionesPorClick)} help="Si el clic de este contacto llegó a sesión en la web." />
                                                              </>
                                                            ) : null}
                                                          </div>
                                                        </div>
                                                      )
                                                    })}
                                                  </div>
                                                ) : (
                                                  <p className="text-xs text-muted-foreground">Sin envíos registrados para este lote.</p>
                                                )}
                                              </div>
                                            ) : null}
                                          </div>
                                        )
                                      })
                                    ) : (
                                      <p className="text-xs text-muted-foreground">No hay lotes asociados a esta plantilla.</p>
                                    )}
                                  </div>
                                ) : null}
                              </div>
                            )
                          })
                        ) : (
                          <p className="text-xs text-muted-foreground">No hay plantillas con métricas para esta campaña.</p>
                        )}
                      </div>
                    ) : null}
                  </div>
                )
              })}
              </div>
            ) : null}
          </TooltipProvider>
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
                  <div className="space-y-1">
                    <Label>Web destino</Label>
                    <Input
                      value={templateForm.ctaBaseUrl}
                      onChange={(event) => setTemplateForm((prev) => ({ ...prev, ctaBaseUrl: event.target.value }))}
                      placeholder="https://tu-dominio.com"
                    />
                    <p className="text-xs text-muted-foreground">
                      Se usa para redireccionar clics del correo con seguimiento en segundo plano.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1 sm:col-span-2">
                      <Label>Frase de WhatsApp para captación</Label>
                      <Select
                        value={templateForm.waRuleId || "__none__"}
                        onValueChange={(value) => {
                          if (value === "__none__") {
                            setTemplateForm((prev) => ({ ...prev, waRuleId: "", waPhrase: "" }))
                            return
                          }
                          const selected = waRules.find((rule) => rule.id === value)
                          setTemplateForm((prev) => ({
                            ...prev,
                            waRuleId: value,
                            waPhrase: selected?.frase_objetivo ?? prev.waPhrase,
                          }))
                        }}
                      >
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
                      <p className="text-xs text-muted-foreground">
                        Selecciona una frase y el enlace de WhatsApp se genera automáticamente al insertar.
                      </p>
                      {templateForm.waPhrase ? (
                        <p className="rounded border bg-muted/30 px-2 py-1 text-xs text-foreground">{templateForm.waPhrase}</p>
                      ) : null}
                      <div className="space-y-1">
                        <Label>Texto del link de WhatsApp</Label>
                        <Input
                          value={templateForm.waLinkLabel}
                          onChange={(event) => setTemplateForm((prev) => ({ ...prev, waLinkLabel: event.target.value }))}
                          placeholder="Escríbenos por WhatsApp"
                        />
                        <p className="text-xs text-muted-foreground">
                          Se usa como texto visible al insertar el enlace wa.me en el correo.
                        </p>
                      </div>
                      {!normalizeWaPhone(tenantPhone) ? (
                        <p className="text-xs text-amber-700 dark:text-amber-300">
                          Falta teléfono del tenant para generar el enlace de WhatsApp.
                        </p>
                      ) : null}
                    </div>
                  </div>
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
                      ref={correoAsuntoRef}
                      value={templateForm.asunto}
                      onChange={(event) => setTemplateForm((prev) => ({ ...prev, asunto: event.target.value }))}
                      onFocus={() => {
                        lastFocusedCorreoFieldRef.current = "asunto"
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Variables disponibles</Label>
                    <div className="flex flex-wrap gap-2">
                      {EMAIL_TEMPLATE_VARIABLES.map((variable) => (
                        <Button
                          key={variable.token}
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => insertEmailVariable(variable.token)}
                        >
                          {variable.label}
                        </Button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Haz clic en una variable para insertarla donde tengas el cursor (Asunto, Texto o HTML).
                    </p>
                  </div>
                  <div className="space-y-2 rounded-md border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Label>Vista previa con dato real</Label>
                      <Button type="button" variant="outline" size="sm" onClick={() => void loadPreviewProspecto()} disabled={previewLoading}>
                        {previewLoading ? "Cargando..." : "Recargar prospecto"}
                      </Button>
                    </div>
                    {previewProspecto ? (
                      <p className="text-xs text-muted-foreground">
                        Prospecto: {(previewProspecto.display_name || "Sin nombre").trim()} · Segmento:{" "}
                        {(previewProspecto.segmento || "Sin segmento").trim() || "Sin segmento"} · Origen:{" "}
                        {resolvePreviewCanalOrigen(previewProspecto) || "Sin origen"}
                      </p>
                    ) : null}
                    {previewError ? <p className="text-xs text-destructive">{previewError}</p> : null}
                    <div className="grid gap-2 md:grid-cols-2">
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">Asunto renderizado</p>
                        <div className="rounded border bg-muted/30 px-2 py-1 text-sm">{previewSubject || "Sin asunto"}</div>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">Texto renderizado</p>
                        <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded border bg-muted/30 p-2 text-xs">
                          {previewBodyText || "Sin contenido"}
                        </pre>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">HTML renderizado</p>
                      <div className="max-h-40 overflow-auto rounded border bg-white p-2 text-xs">
                        {previewBodyHtml ? (
                          <div dangerouslySetInnerHTML={{ __html: previewBodyHtml }} />
                        ) : (
                          <span className="text-muted-foreground">Sin contenido HTML</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>Cuerpo (texto)</Label>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => appendTemplateToken("cuerpoTexto", "\n")}>
                        Salto de línea
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => appendTemplateToken("cuerpoTexto", "\n--------------------\n")}
                      >
                        Separador
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => appendTemplateToken("cuerpoTexto", "\n- Punto 1\n- Punto 2\n")}
                      >
                        Viñetas
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          appendTemplateToken(
                            "cuerpoTexto",
                            "\n¿Te parece si agendamos una llamada esta semana?\n"
                          )
                        }
                      >
                        CTA rápida
                      </Button>
                    </div>
                    <Textarea
                      ref={correoTextoRef}
                      rows={4}
                      value={templateForm.cuerpoTexto}
                      onChange={(event) => setTemplateForm((prev) => ({ ...prev, cuerpoTexto: event.target.value }))}
                      onFocus={() => {
                        lastFocusedCorreoFieldRef.current = "cuerpoTexto"
                      }}
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
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => wrapTemplateSelection("cuerpoHtml", "<strong>", "</strong>")}
                      >
                        Negrita
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => wrapTemplateSelection("cuerpoHtml", "<em>", "</em>")}
                      >
                        Cursiva
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => wrapTemplateSelection("cuerpoHtml", "<h3>", "</h3>", "Subtítulo")}
                      >
                        Subtítulo
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          appendTemplateToken("cuerpoHtml", "<ul><li>Punto 1</li><li>Punto 2</li></ul>")
                        }
                      >
                        Lista
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => insertCorreoTrackedLink()}>
                        Insertar enlace web
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => insertCorreoWaMeLink()}>
                        Insertar enlace WhatsApp
                      </Button>
                    </div>
                    <Textarea
                      ref={correoHtmlRef}
                      rows={5}
                      value={templateForm.cuerpoHtml}
                      onChange={(event) => setTemplateForm((prev) => ({ ...prev, cuerpoHtml: event.target.value }))}
                      onFocus={() => {
                        lastFocusedCorreoFieldRef.current = "cuerpoHtml"
                      }}
                    />
                    <p className="text-xs text-muted-foreground">
                      Variables: {"{{nombre}}, {{empresa}}, {{email}}, {{telefono}}, {{segmento}}, {{canal_origen}}, {{logo_url}}, {{tracking_url}}, {{website_url}}"}.
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
                      <Label>Texto libre variable 6</Label>
                      <Input
                        value={templateForm.twilioVariable6}
                        onChange={(event) =>
                          setTemplateForm((prev) => ({ ...prev, twilioVariable6: event.target.value }))
                        }
                        placeholder="Texto que se inyecta en {{6}}"
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

function resolveBatchDisplayTitle(batchIndex: number): string {
  return `Lote ${batchIndex + 1}`
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "0%"
  return `${value.toFixed(2)}%`
}

function MetricInlineTip({ label, value, help }: { label: string; value: string; help: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help underline decoration-dotted underline-offset-2">
          {label}: {value}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs leading-snug">
        {help}
      </TooltipContent>
    </Tooltip>
  )
}

function MetricBadgeTip({ label, value, help }: { label: string; value: string | number; help: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className="cursor-help">
          {label}: {value}
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs leading-snug">
        {help}
      </TooltipContent>
    </Tooltip>
  )
}

function formatDateTime(value?: string | null): string {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}

function normalizeMetricCanal(value: string | null | undefined): "correo" | "whatsapp" | "llamada" | "multi" | "otro" {
  const normalized = String(value || "").trim().toLowerCase()
  if (normalized === "correo") return "correo"
  if (normalized === "whatsapp") return "whatsapp"
  if (normalized === "llamada") return "llamada"
  if (normalized === "multi") return "multi"
  return "otro"
}

function isEmailCanal(value: string | null | undefined): boolean {
  return normalizeMetricCanal(value) === "correo"
}

function deliveryMetricLabel(value: string | null | undefined): string {
  const canal = normalizeMetricCanal(value)
  if (canal === "whatsapp") return "Recibidos"
  return "Entregados"
}

function resolveCampaignCanal(node: HierarchyCampaignNode): "correo" | "whatsapp" | "llamada" | "multi" | "otro" {
  const canales = new Set<string>()
  node.templates.forEach((template) => {
    const channel = normalizeMetricCanal(template.canal)
    if (channel !== "otro") canales.add(channel)
  })
  if (canales.size === 1) return normalizeMetricCanal(Array.from(canales)[0])
  if (canales.size > 1) return "multi"
  return normalizeMetricCanal(node.metrics.canal)
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function createEmptyAtribucionMetric(seed: Partial<ProspeccionCampanaAtribucionItem> = {}): ProspeccionCampanaAtribucionItem {
  return {
    campana_id: seed.campana_id ?? null,
    campana_nombre: seed.campana_nombre ?? null,
    canal: seed.canal ?? null,
    template_id: seed.template_id ?? null,
    template_slug: seed.template_slug ?? null,
    template_nombre: seed.template_nombre ?? null,
    envios_totales: 0,
    envios_enviados: 0,
    envios_entregados: 0,
    envios_fallidos: 0,
    envios_omitidos: 0,
    envios_respondidos: 0,
    brevo_aperturas: 0,
    brevo_clicks: 0,
    sesiones_utm: 0,
    tasa_entrega_pct: 0,
    tasa_respuesta_pct: 0,
    click_to_session_pct: 0,
  }
}

function sumAtribucionMetrics(
  current: ProspeccionCampanaAtribucionItem,
  next: ProspeccionCampanaAtribucionItem,
): ProspeccionCampanaAtribucionItem {
  const totals = {
    envios_totales: toNumber(current.envios_totales) + toNumber(next.envios_totales),
    envios_enviados: toNumber(current.envios_enviados) + toNumber(next.envios_enviados),
    envios_entregados: toNumber(current.envios_entregados) + toNumber(next.envios_entregados),
    envios_fallidos: toNumber(current.envios_fallidos) + toNumber(next.envios_fallidos),
    envios_omitidos: toNumber(current.envios_omitidos) + toNumber(next.envios_omitidos),
    envios_respondidos: toNumber(current.envios_respondidos) + toNumber(next.envios_respondidos),
    brevo_aperturas: toNumber(current.brevo_aperturas) + toNumber(next.brevo_aperturas),
    brevo_clicks: toNumber(current.brevo_clicks) + toNumber(next.brevo_clicks),
    sesiones_utm: toNumber(current.sesiones_utm) + toNumber(next.sesiones_utm),
  }
  const tasaEntrega = totals.envios_totales ? (totals.envios_entregados * 100) / totals.envios_totales : 0
  const tasaRespuesta = totals.envios_totales ? (totals.envios_respondidos * 100) / totals.envios_totales : 0
  const clickSesion = totals.sesiones_utm ? (totals.brevo_clicks * 100) / totals.sesiones_utm : 0
  return {
    ...current,
    canal: current.canal || next.canal || null,
    ...totals,
    tasa_entrega_pct: tasaEntrega,
    tasa_respuesta_pct: tasaRespuesta,
    click_to_session_pct: clickSesion,
  }
}

function buildAtribucionKpis(metric: ProspeccionCampanaAtribucionItem): {
  entrega: number
  respuesta: number
  clickTotal: number
  sesionesPorClick: number
} {
  const totales = toNumber(metric.envios_totales)
  const entregados = toNumber(metric.envios_entregados)
  const respondidos = toNumber(metric.envios_respondidos)
  const clicks = toNumber(metric.brevo_clicks)
  const sesiones = toNumber(metric.sesiones_utm)
  return {
    entrega: totales ? (entregados * 100) / totales : 0,
    respuesta: totales ? (respondidos * 100) / totales : 0,
    clickTotal: totales ? (clicks * 100) / totales : 0,
    sesionesPorClick: clicks ? (sesiones * 100) / clicks : 0,
  }
}

function buildTemplateKey(item: {
  template_id?: string | null
  template_slug?: string | null
  canal?: string | null
}): string {
  const templateId = (item.template_id || "").trim().toLowerCase()
  const templateSlug = (item.template_slug || "").trim().toLowerCase()
  const canal = (item.canal || "").trim().toLowerCase()
  return `${canal}::${templateId || "sin-id"}::${templateSlug || "sin-slug"}`
}

function inferCampaignCanal(batches: ProspeccionCampanaGroup["batches"]): string | null {
  for (const batch of batches) {
    if (Array.isArray(batch.canales) && batch.canales.length) return String(batch.canales[0] || "")
  }
  return null
}

function extractBatchTemplateIdentity(batch: ProspeccionCampanaGroup["batches"][number]): {
  canal: string | null
  templateId: string | null
  templateSlug: string | null
} {
  const canal = Array.isArray(batch.canales) && batch.canales.length ? String(batch.canales[0] || "").trim() : ""
  const metadata = isRecord(batch.metadata) ? batch.metadata : {}
  const canalesConfig = isRecord(metadata["canales_config"]) ? (metadata["canales_config"] as Record<string, unknown>) : {}
  const canalConfig = canal && isRecord(canalesConfig[canal]) ? (canalesConfig[canal] as Record<string, unknown>) : {}
  const canalMeta = isRecord(canalConfig["metadata"]) ? (canalConfig["metadata"] as Record<string, unknown>) : {}
  const templateId =
    (typeof canalConfig["template_id"] === "string" && canalConfig["template_id"].trim()) ||
    (typeof canalMeta["template_id"] === "string" && canalMeta["template_id"].trim()) ||
    null
  const templateSlug =
    (typeof canalConfig["template_slug"] === "string" && canalConfig["template_slug"].trim()) ||
    (typeof canalMeta["template_slug"] === "string" && canalMeta["template_slug"].trim()) ||
    null
  return {
    canal: canal || null,
    templateId,
    templateSlug,
  }
}

function resolveBrevoEventName(log: ContactoLog): string {
  if (!isRecord(log.detalle)) return ""
  const detail = log.detalle as Record<string, unknown>
  const root = typeof detail["event"] === "string" ? detail["event"].trim().toLowerCase() : ""
  if (root) return root
  const brevo = isRecord(detail["brevo"]) ? (detail["brevo"] as Record<string, unknown>) : {}
  const nested = typeof brevo["event"] === "string" ? brevo["event"].trim().toLowerCase() : ""
  return nested
}

function pickUniqueMetricCount(
  rawTotals: Record<string, unknown> | undefined,
  uniqueKeys: string[],
  totalKeys: string[],
): number {
  if (!rawTotals) return 0
  const uniqueCount = uniqueKeys.reduce((sum, key) => sum + toNumber(rawTotals[key]), 0)
  if (uniqueCount > 0) return uniqueCount
  return totalKeys.reduce((sum, key) => sum + toNumber(rawTotals[key]), 0)
}

function buildLogMetricsByEnvio(logs: ContactoLog[]): Record<string, { opened: boolean; clicked: boolean }> {
  const byEnvio: Record<string, { opened: boolean; clicked: boolean }> = {}
  const sawUniqueOpened = new Set<string>()
  const sawOpened = new Set<string>()
  const sawUniqueClicked = new Set<string>()
  const sawClicked = new Set<string>()

  logs.forEach((log) => {
    const envioId = (log.envio_id || "").trim()
    if (!envioId) return
    const eventName = resolveBrevoEventName(log)
    if (eventName === "unique_opened") sawUniqueOpened.add(envioId)
    if (eventName === "opened") sawOpened.add(envioId)
    if (eventName === "unique_click") sawUniqueClicked.add(envioId)
    if (eventName === "click") sawClicked.add(envioId)
  })

  const envioIds = new Set<string>([
    ...Array.from(sawUniqueOpened),
    ...Array.from(sawOpened),
    ...Array.from(sawUniqueClicked),
    ...Array.from(sawClicked),
  ])

  envioIds.forEach((envioId) => {
    byEnvio[envioId] = {
      // Regla comercial: usar únicos cuando existen; fallback a total.
      opened: sawUniqueOpened.has(envioId) || (!sawUniqueOpened.has(envioId) && sawOpened.has(envioId)),
      clicked: sawUniqueClicked.has(envioId) || (!sawUniqueClicked.has(envioId) && sawClicked.has(envioId)),
    }
  })

  return byEnvio
}

function buildBatchMetrics(batch: ProspeccionCampanaGroup["batches"][number], detail?: BatchDetailState) {
  const canal =
    Array.isArray(batch.canales) && batch.canales.length ? String(batch.canales[0] || "").trim().toLowerCase() : ""
  const rawTotals = (batch.totales || {}) as Record<string, unknown>
  const totales = Object.values(batch.totales || {}).reduce((sum, value) => sum + toNumber(value), 0)
  const entregados = toNumber(batch.totales?.entregado)
  const respondidos = toNumber(batch.totales?.respondido)
  const leidos = toNumber(batch.totales?.leido) + toNumber((batch.totales as Record<string, number> | undefined)?.read)
  const sesionesUtm = (detail?.envios ?? []).reduce((sum, envio) => sum + toNumber(envio.sesiones_utm), 0)
  const enviados = toNumber(batch.totales?.enviado) + entregados
  const fallidos = toNumber(batch.totales?.fallido) + toNumber(batch.totales?.error)
  const omitidos = toNumber(batch.totales?.omitido)
  let aperturas = pickUniqueMetricCount(rawTotals, ["unique_opened", "brevo_unique_opened"], ["opened", "brevo_opened"])
  let clicks = pickUniqueMetricCount(rawTotals, ["unique_click", "brevo_unique_click"], ["click", "brevo_click"])
  if (detail?.logs?.length) {
    const byEnvio = buildLogMetricsByEnvio(detail.logs)
    aperturas = Object.values(byEnvio).reduce((sum, item) => sum + (item.opened ? 1 : 0), 0)
    clicks = Object.values(byEnvio).reduce((sum, item) => sum + (item.clicked ? 1 : 0), 0)
  }
  const tasaEntrega = totales ? (entregados * 100) / totales : 0
  const tasaRespuesta = totales ? (respondidos * 100) / totales : 0
  const clickTotal = totales ? (clicks * 100) / totales : 0
  const sesionesPorClick = clicks ? (sesionesUtm * 100) / clicks : 0
  return {
    totales,
    entregados,
    respondidos,
    leidos,
    sesionesUtm,
    enviados,
    fallidos,
    omitidos,
    aperturas,
    clicks,
    tasaEntrega,
    tasaRespuesta,
    clickTotal,
    sesionesPorClick,
    canal,
  }
}

function buildEnvioMetrics(envio: ContactoEnvio, logs: ContactoLog[]) {
  let aperturas = 0
  let clicks = 0
  const sesionesUtm = toNumber(envio.sesiones_utm)
  const sesionUtm = sesionesUtm > 0
  let respondido = envio.estado === "respondido"
  let leido = envio.estado === "leido" || envio.estado === "read"
  const estadoNormalizado = (envio.estado || "").toLowerCase()
  let entregado = ["entregado", "delivered", "leido", "read", "respondido"].includes(estadoNormalizado)
  const scopedLogs = logs.filter((log) => log.envio_id === envio.id)
  const byEnvio = buildLogMetricsByEnvio(scopedLogs)
  if (byEnvio[envio.id]?.opened) aperturas = 1
  if (byEnvio[envio.id]?.clicked) clicks = 1
  scopedLogs.forEach((log) => {
    const action = (log.accion || "").toLowerCase()
    const status = (log.estado || "").toLowerCase()
    const direction = isRecord(log.detalle) && typeof log.detalle?.direction === "string" ? String(log.detalle.direction).toLowerCase() : ""
    if (status === "entregado" || status === "delivered") {
      entregado = true
    }
    if (action === "reply_inbound" || status === "respondido" || direction === "inbound") {
      respondido = true
    }
    if (status === "leido" || status === "read") {
      leido = true
    }
  })
  const tasaEntrega = entregado ? 100 : 0
  const tasaRespuesta = respondido ? 100 : 0
  const clickTotal = clicks > 0 ? 100 : 0
  const sesionesPorClick = clicks > 0 ? (sesionesUtm * 100) / clicks : 0
  return { aperturas, clicks, respondido, leido, sesionesUtm, sesionUtm, tasaEntrega, tasaRespuesta, clickTotal, sesionesPorClick }
}

function resolveEnvioProspectLabel(envio: ContactoEnvio): string {
  if (isRecord(envio.detalle)) {
    const detail = envio.detalle as Record<string, unknown>
    const displayName = typeof detail["display_name"] === "string" ? detail["display_name"].trim() : ""
    if (displayName) return displayName
    const email = typeof detail["email"] === "string" ? detail["email"].trim() : ""
    if (email) return email
    const phone = typeof detail["phone"] === "string" ? detail["phone"].trim() : ""
    if (phone) return phone
  }
  return "Prospecto sin nombre"
}

function resolveEnvioSegmentoLabel(envio: ContactoEnvio): string {
  if (isRecord(envio.detalle)) {
    const detail = envio.detalle as Record<string, unknown>
    const segmento = typeof detail["segmento"] === "string" ? detail["segmento"].trim() : ""
    if (segmento) return segmento
  }
  return "Sin segmento"
}
