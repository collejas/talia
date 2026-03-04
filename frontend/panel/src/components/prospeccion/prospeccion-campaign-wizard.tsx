"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { IconAlertTriangle, IconChevronLeft, IconChevronRight, IconTargetArrow } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import {
  contactarProspectos,
  createCrmCampaign,
  listContactoTemplates,
  listCrmCampaigns,
  listProspeccionListas,
  updateProspeccionCampana,
  type CrmCampaign,
  type ContactarProspectosPayload,
  type ContactoTemplate,
  type ProspeccionLista,
  type ProspeccionCanalConfigInput,
  type ProspeccionOmitido,
  type ProspectoFiltroInput,
  type ProspectoContactoResumen,
} from "@/lib/prospeccion/prospectos-client"
import { cn } from "@/lib/utils"

type WizardSource = "selected" | "lista" | "filters"

const CHANNEL_OPTIONS: Array<{ key: "correo" | "whatsapp" | "llamada"; label: string; description: string }> = [
  { key: "correo", label: "Correo", description: "Envía correo SMTP usando la plantilla seleccionada." },
  { key: "whatsapp", label: "WhatsApp", description: "Mensajes vía API Twilio WhatsApp al número verificado." },
  { key: "llamada", label: "Llamada", description: "Dispara una llamada automatizada con mensaje sintetizado." },
]

const STAGES = [
  { value: "__all__", label: "Cualquiera" },
  { value: "discover", label: "Discover" },
  { value: "enrich", label: "Enrich" },
  { value: "prepare", label: "Prepare" },
  { value: "launch", label: "Launch" },
  { value: "evaluate", label: "Evaluate" },
]

const EMAIL_LOGO_IMG_STYLE = "display:block;max-width:83.333%;height:auto;margin:12px 0;"
const MAIL_VARIABLE_TOKENS = ["{{nombre}}", "{{empresa}}", "{{email}}", "{{telefono}}", "{{segmento}}", "{{logo_url}}"]
const LOGO_PLACEHOLDER_REGEX = /{{\s*logo_url\s*}}/i

type LogoAsset = {
  id: string
  nombre: string
  file_url: string
}

function normalizeLogoUrl(input: string): string {
  const value = input.trim()
  if (!value) return ""
  if (/^https?:\/\//i.test(value)) return value
  return `https://${value}`
}

function hasEmailLogoPlaceholder(input: string): boolean {
  return LOGO_PLACEHOLDER_REGEX.test(input || "")
}

type ChannelState = Record<
  "correo" | "whatsapp" | "llamada",
  {
    enabled: boolean
    templateSlug?: string
    subject?: string
    body?: string
    bodyHtml?: string
    message?: string
    schedule?: string
  }
>

const DEFAULT_CHANNEL_STATE: ChannelState = {
  correo: { enabled: true, subject: "", body: "", bodyHtml: "" },
  whatsapp: { enabled: false, body: "" },
  llamada: { enabled: false, message: "" },
}

type ChannelOverrides = Partial<Record<keyof ChannelState, Partial<ChannelState["correo"]>>>

function buildChannelState(overrides?: ChannelOverrides): ChannelState {
  const base: ChannelState = {
    correo: { ...DEFAULT_CHANNEL_STATE.correo },
    whatsapp: { ...DEFAULT_CHANNEL_STATE.whatsapp },
    llamada: { ...DEFAULT_CHANNEL_STATE.llamada },
  }
  if (overrides) {
    ;(Object.keys(overrides) as Array<keyof ChannelState>).forEach((canal) => {
      const override = overrides[canal]
      if (!override) return
      base[canal] = { ...base[canal], ...override }
    })
  }
  return base
}

export type ProspeccionWizardPreset = {
  source?: WizardSource
  listaId?: string | null
  filtros?: ProspectoFiltroInput
  canales?: ChannelOverrides
  titulo?: string | null
  campanaId?: string | null
  campanaNombre?: string | null
  separacionSegundos?: number | null
}

function sanitizeFilters(filters: ProspectoFiltroInput): ProspectoFiltroInput {
  const clean: ProspectoFiltroInput = {}
  if (filters.search?.trim()) clean.search = filters.search.trim()
  if (filters.fuente) clean.fuente = filters.fuente
  if (filters.lookup_status?.trim()) clean.lookup_status = filters.lookup_status.trim()
  if (filters.segmento?.trim()) clean.segmento = filters.segmento.trim()
  if (filters.carrier_type) clean.carrier_type = filters.carrier_type
  if (filters.stage) clean.stage = filters.stage
  if (typeof filters.whatsapp_permitido === "boolean") clean.whatsapp_permitido = filters.whatsapp_permitido
  if (typeof filters.llamada_permitida === "boolean") clean.llamada_permitida = filters.llamada_permitida
  return clean
}

type ProspeccionCampaignWizardProps = {
  open: boolean
  onClose: () => void
  selectedIds: string[]
  defaultFilters?: ProspectoFiltroInput
  preset?: ProspeccionWizardPreset | null
  editCampanaId?: string | null
  onCompleted?: (result: {
    batchId?: string | null
    total?: number
    contactos?: ProspectoContactoResumen[]
    omitidos?: ProspeccionOmitido[]
  }) => void
}

export function ProspeccionCampaignWizard({
  open,
  onClose,
  selectedIds,
  defaultFilters,
  preset,
  editCampanaId,
  onCompleted,
}: ProspeccionCampaignWizardProps) {
  const defaultSource: WizardSource = selectedIds.length > 0 ? "selected" : "filters"
  const [step, setStep] = useState(0)
  const [source, setSource] = useState<WizardSource>(defaultSource)
  const [presetApplied, setPresetApplied] = useState(false)
  const [listas, setListas] = useState<ProspeccionLista[]>([])
  const [listasLoading, setListasLoading] = useState(false)
  const [selectedListaId, setSelectedListaId] = useState<string | null>(null)
  const [filters, setFilters] = useState<ProspectoFiltroInput>(defaultFilters ?? {})
  const [templates, setTemplates] = useState<ContactoTemplate[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [campanas, setCampanas] = useState<CrmCampaign[]>([])
  const [campanasLoading, setCampanasLoading] = useState(false)
  const [campanaId, setCampanaId] = useState<string | null>(null)
  const [campanaNombre, setCampanaNombre] = useState("")
  const [newCampaignOpen, setNewCampaignOpen] = useState(false)
  const [newCampaignName, setNewCampaignName] = useState("")
  const [newCampaignSaving, setNewCampaignSaving] = useState(false)
  const [separacionSegundos, setSeparacionSegundos] = useState<string>("5")
  const correoAsuntoRef = useRef<HTMLInputElement | null>(null)
  const correoCuerpoRef = useRef<HTMLTextAreaElement | null>(null)
  const correoHtmlRef = useRef<HTMLTextAreaElement | null>(null)
  const [titulo, setTitulo] = useState("")
  const [channelState, setChannelState] = useState<ChannelState>(() => buildChannelState())
  const [logos, setLogos] = useState<LogoAsset[]>([])
  const [logosLoading, setLogosLoading] = useState(false)
  const [selectedLogoUrl, setSelectedLogoUrl] = useState<string>("")
  const [quoteLogoUrl, setQuoteLogoUrl] = useState<string>("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const selectedList = useMemo(() => listas.find((lista) => lista.id === selectedListaId), [listas, selectedListaId])

  const resetState = useCallback(() => {
    setStep(0)
    setSource(defaultSource)
    setSelectedListaId(null)
    setFilters(defaultFilters ?? {})
    setCampanaId(null)
    setCampanaNombre("")
    setTitulo("")
    setChannelState(buildChannelState())
    setLogos([])
    setSelectedLogoUrl("")
    setQuoteLogoUrl("")
    setNewCampaignOpen(false)
    setNewCampaignName("")
    setSeparacionSegundos("5")
    setError(null)
    setPresetApplied(false)
  }, [defaultFilters, defaultSource])

  useEffect(() => {
    if (!open) {
      resetState()
      return
    }
    setError(null)
    setListasLoading(true)
    setCampanasLoading(true)
    void Promise.all([
      listProspeccionListas({ limit: 50 }),
      listCrmCampaigns(),
    ])
      .then(([listasResponse, campanasResponse]) => {
        if (listasResponse?.items) {
          setListas(listasResponse.items)
          if (!listasResponse.items.length) {
            setSource((prev) => (prev === "lista" ? "filters" : prev))
          }
          setSelectedListaId((prev) => {
            if (prev) return prev
            if (preset?.listaId) return preset.listaId
            if (presetApplied) return prev
            const firstLista = listasResponse.items[0]
            return firstLista ? firstLista.id : prev
          })
        }
        if (Array.isArray(campanasResponse)) {
          setCampanas(campanasResponse)
          setCampanaId((prev) => {
            if (prev) return prev
            return campanasResponse[0]?.id ?? null
          })
          if (campanasResponse[0]?.nombre) {
            setCampanaNombre((prev) => (prev.trim() ? prev : campanasResponse[0].nombre ?? ""))
          }
        }
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : "No se pudo cargar la información del wizard."
        setError(message)
      })
      .finally(() => {
        setListasLoading(false)
        setCampanasLoading(false)
      })
  }, [open, preset, presetApplied, resetState])

  useEffect(() => {
    if (!open) return
    setTemplatesLoading(true)
    void listContactoTemplates(campanaId ? { campana_id: campanaId } : {})
      .then((response) => {
        setTemplates(Array.isArray(response?.items) ? response.items : [])
      })
      .catch(() => {
        setTemplates([])
      })
      .finally(() => {
        setTemplatesLoading(false)
      })
  }, [open, campanaId])

  useEffect(() => {
    if (!campanaId) return
    const selected = campanas.find((item) => item.id === campanaId)
    if (selected?.nombre) {
      setCampanaNombre(selected.nombre)
    }
  }, [campanaId, campanas])

  useEffect(() => {
    if (!open || !preset || presetApplied) return
    if (preset.source) {
      setSource(preset.source)
    } else if (preset.listaId) {
      setSource("lista")
    } else if (preset.filtros && Object.keys(sanitizeFilters(preset.filtros)).length) {
      setSource("filters")
    }
    if ("listaId" in preset) {
      setSelectedListaId(preset.listaId ?? null)
    }
    if (preset.filtros) {
      setFilters(preset.filtros)
    }
    if ("campanaId" in preset) {
      setCampanaId(preset.campanaId ?? null)
    }
    if ("campanaNombre" in preset) {
      setCampanaNombre(preset.campanaNombre ?? "")
    }
    if ("titulo" in preset) {
      setTitulo(preset.titulo ?? "")
    }
    if ("separacionSegundos" in preset) {
      const safe = Math.max(5, Number(preset.separacionSegundos ?? 5))
      setSeparacionSegundos(String(safe))
    }
    if (preset.canales) {
      setChannelState(buildChannelState(preset.canales))
    }
    setPresetApplied(true)
  }, [open, preset, presetApplied])

  const handleTemplateSelect = (canal: "correo" | "whatsapp" | "llamada", slug: string) => {
    const template = templates.find((tpl) => tpl.slug === slug)
    if (!template) return
    const metadata = template.metadata && typeof template.metadata === "object" ? template.metadata : null
    const twilioSid =
      metadata && typeof metadata["twilio_content_sid"] === "string"
        ? metadata["twilio_content_sid"].trim()
        : ""
    setChannelState((prev) => {
      const next = { ...prev }
      const current = next[canal] ?? { enabled: false }
      next[canal] = {
        ...current,
        templateSlug: slug,
        enabled: true,
      }
      if (canal === "correo") {
        next[canal].subject = template.asunto ?? current.subject
        next[canal].body = template.cuerpo_texto ?? current.body
        next[canal].bodyHtml = template.cuerpo_html ?? current.bodyHtml
      } else if (canal === "whatsapp") {
        next[canal].body = twilioSid ? "" : template.cuerpo_texto ?? current.body
      } else if (canal === "llamada") {
        next[canal].message = template.cuerpo_texto ?? template.descripcion ?? current.message
      }
      return next
    })
  }

  const handleChannelToggle = (canal: "correo" | "whatsapp" | "llamada", enabled: boolean) => {
    setChannelState((prev) => ({
      ...prev,
      [canal]: {
        ...prev[canal],
        enabled,
      },
    }))
  }

  const canContinueStepOne = useMemo(() => {
    if (source === "selected") {
      return selectedIds.length > 0
    }
    if (source === "lista") {
      return Boolean(selectedListaId)
    }
    const cleanFilters = sanitizeFilters(filters)
    return Object.keys(cleanFilters).length > 0
  }, [filters, selectedIds.length, selectedListaId, source])

  const activeChannels = useMemo(
    () => CHANNEL_OPTIONS.filter((option) => channelState[option.key].enabled),
    [channelState]
  )

  const canContinueStepTwo = activeChannels.length > 0

  const campanaOptions = useMemo(() => {
    const options: Array<{ value: string; label: string }> = []
    campanas.forEach((group) => {
      if (group.id) {
        options.push({
          value: group.id,
          label: group.nombre ?? `Campaña ${group.id.slice(0, 8)}`,
        })
      }
    })
    return options
  }, [campanas])

  const handleCreateCampaign = useCallback(async () => {
    const nombre = newCampaignName.trim()
    if (!nombre) {
      setError("Escribe el nombre de la campaña CRM.")
      return
    }
    setNewCampaignSaving(true)
    setError(null)
    try {
      const preferredCanal = (activeChannels[0]?.key ?? "whatsapp") as "correo" | "whatsapp" | "llamada"
      const created = await createCrmCampaign({ nombre, canal: preferredCanal, tipo: "prospeccion" })
      setCampanas((prev) => [created, ...prev])
      setCampanaId(created.id)
      setNewCampaignName("")
      setNewCampaignOpen(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo crear la campaña CRM."
      setError(message)
    } finally {
      setNewCampaignSaving(false)
    }
  }, [activeChannels, newCampaignName])

  const resolvePreferredLogo = useCallback(async (): Promise<string> => {
    if (quoteLogoUrl.trim()) return quoteLogoUrl.trim()
    try {
      const response = await fetch("/api/crm/settings/quote-template", { cache: "no-store" })
      const payload = await response.json().catch(() => ({}))
      if (response.ok) {
        const fromConfig =
          payload && typeof payload === "object" && payload.config && typeof payload.config === "object"
            ? String((payload.config as Record<string, unknown>).logoUrl ?? "").trim()
            : ""
        if (fromConfig) {
          setQuoteLogoUrl(fromConfig)
          return fromConfig
        }
      }
    } catch {
      // fallback below
    }
    try {
      const response = await fetch("/api/settings/logos", { cache: "no-store" })
      const payload = await response.json().catch(() => ({}))
      if (response.ok && Array.isArray(payload?.logos) && payload.logos.length) {
        const first = payload.logos.find(
          (item: unknown) =>
            item &&
            typeof item === "object" &&
            typeof (item as Record<string, unknown>).file_url === "string" &&
            String((item as Record<string, unknown>).file_url).trim().length,
        ) as Record<string, unknown> | undefined
        const fileUrl = first ? String(first.file_url).trim() : ""
        if (fileUrl) return fileUrl
      }
    } catch {
      // fallback below
    }
    if (typeof window !== "undefined") return `${window.location.origin}/assets/logos/Logo8.png`
    return "https://talia.mx/assets/logos/Logo8.png"
  }, [quoteLogoUrl])

  const appendCorreoToken = useCallback(
    (field: "subject" | "body" | "bodyHtml", token: string) => {
      const fieldRef =
        field === "subject" ? correoAsuntoRef.current : field === "body" ? correoCuerpoRef.current : correoHtmlRef.current
      setChannelState((prev) => {
        const current = prev.correo[field] ?? ""
        if (!fieldRef) {
          const separator = field === "subject" ? (current && !/\s$/.test(current) ? " " : "") : current && !current.endsWith("\n") ? "\n" : ""
          return {
            ...prev,
            correo: { ...prev.correo, [field]: `${current}${separator}${token}` },
          }
        }
        const start = fieldRef.selectionStart ?? current.length
        const end = fieldRef.selectionEnd ?? current.length
        const prefix = current.slice(0, start)
        const suffix = current.slice(end)
        const needsLeading = field === "subject" && prefix.length > 0 && !/\s$/.test(prefix) ? " " : ""
        const nextValue = `${prefix}${needsLeading}${token}${suffix}`
        const caret = prefix.length + needsLeading.length + token.length
        window.requestAnimationFrame(() => {
          fieldRef.focus()
          fieldRef.setSelectionRange(caret, caret)
        })
        return {
          ...prev,
          correo: { ...prev.correo, [field]: nextValue },
        }
      })
    },
    [],
  )

  const insertCorreoLogo = useCallback(
    (logoUrl: string) => {
      const url = normalizeLogoUrl(logoUrl)
      if (!url) return
      setSelectedLogoUrl(url)
      appendCorreoToken("body", "{{logo_url}}")
      const htmlFocused = typeof document !== "undefined" && document.activeElement === correoHtmlRef.current
      const hasHtmlContent = Boolean((channelState.correo.bodyHtml ?? "").trim())
      if (htmlFocused || hasHtmlContent) {
        appendCorreoToken("bodyHtml", `<img src="{{logo_url}}" alt="Logo" style="${EMAIL_LOGO_IMG_STYLE}" />`)
      }
    },
    [appendCorreoToken, channelState.correo.bodyHtml],
  )

  const handleInsertQuoteLogo = useCallback(async () => {
    try {
      const logo = await resolvePreferredLogo()
      insertCorreoLogo(logo)
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo insertar el logo."
      setError(message)
    }
  }, [insertCorreoLogo, resolvePreferredLogo])

  const loadLogos = useCallback(async () => {
    if (logosLoading) return
    setLogosLoading(true)
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
      setError(message)
    } finally {
      setLogosLoading(false)
    }
  }, [logosLoading])

  const handleSubmit = async () => {
    setError(null)
    if (!campanaId) {
      setError("Selecciona una campaña para registrar el envío.")
      setStep(2)
      return
    }
    if (!canContinueStepTwo) {
      setError("Selecciona al menos un canal para la campaña.")
      setStep(1)
      return
    }
    const separacionParsed = Number.parseInt(separacionSegundos || "5", 10)
    if (Number.isNaN(separacionParsed) || separacionParsed < 5 || separacionParsed > 3600) {
      setError("La separación entre envíos debe estar entre 5 y 3600 segundos.")
      setStep(2)
      return
    }
    let resolvedLogoUrl = normalizeLogoUrl(selectedLogoUrl.trim() || quoteLogoUrl.trim())
    const correoConfig = channelState.correo
    const correoNeedsLogo =
      correoConfig.enabled &&
      (hasEmailLogoPlaceholder(correoConfig.subject ?? "") ||
        hasEmailLogoPlaceholder(correoConfig.body ?? "") ||
        hasEmailLogoPlaceholder(correoConfig.bodyHtml ?? ""))
    if (!resolvedLogoUrl && correoNeedsLogo) {
      resolvedLogoUrl = normalizeLogoUrl(await resolvePreferredLogo())
      if (resolvedLogoUrl) {
        setSelectedLogoUrl(resolvedLogoUrl)
      }
    }
    const payload: ContactarProspectosPayload = {
      canales: activeChannels.map(({ key }) => {
        const config = channelState[key]
        const template =
          config.templateSlug && templates.length
            ? templates.find((tpl) => tpl.slug === config.templateSlug && tpl.canal === key)
            : null
        const channelPayload: ProspeccionCanalConfigInput = {
          canal: key,
          template_id: template?.id,
          subject: config.subject,
          body: config.body,
          body_html: config.bodyHtml,
          message: config.message,
          programado_en: config.schedule ? new Date(config.schedule).toISOString() : undefined,
        }
        if (key === "correo") {
          const requiresLogo =
            hasEmailLogoPlaceholder(config.subject ?? "") ||
            hasEmailLogoPlaceholder(config.body ?? "") ||
            hasEmailLogoPlaceholder(config.bodyHtml ?? "")
          if (requiresLogo) {
            if (resolvedLogoUrl) {
              channelPayload.metadata = { ...(channelPayload.metadata ?? {}), logo_url: resolvedLogoUrl }
            }
          }
        }
        return channelPayload
      }),
      campana_id: campanaId,
      batch_titulo: titulo.trim() || undefined,
      separacion_segundos: separacionParsed,
    }
    if (source === "selected") {
      payload.prospecto_ids = selectedIds
    } else if (source === "lista") {
      if (!selectedListaId) {
        setError("Selecciona una lista para continuar.")
        return
      }
      payload.lista_id = selectedListaId
    } else {
      const cleaned = sanitizeFilters(filters)
      if (!Object.keys(cleaned).length) {
        setError("Configura al menos un filtro para lanzar la campaña.")
        return
      }
      payload.filtros = cleaned
    }

    setSubmitting(true)
    try {
      const response = editCampanaId
        ? await updateProspeccionCampana(editCampanaId, {
            campana_nombre: campanaNombre.trim() || undefined,
            batch_titulo: payload.batch_titulo,
            lista_id: payload.lista_id ?? null,
            filtros: payload.filtros,
            canales: payload.canales,
            separacion_segundos: separacionParsed,
          })
        : await contactarProspectos(payload)
      onCompleted?.({
        batchId: response.batch_id,
        total: response.contactos?.length,
        contactos: response.contactos ?? [],
        omitidos: response.omitidos,
      })
      onClose()
    } catch (err) {
      const message = err instanceof Error ? err.message : editCampanaId ? "No se pudo editar la campaña." : "No se pudo crear la campaña."
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  const renderStepAudience = () => (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <button
          type="button"
          className={cn(
            "rounded-lg border p-4 text-left transition hover:border-primary",
            source === "selected" ? "border-primary bg-primary/5" : "border-border"
          )}
          onClick={() => setSource("selected")}
        >
          <p className="text-sm font-semibold">Selección manual</p>
          <p className="text-xs text-muted-foreground">{selectedIds.length} prospectos seleccionados.</p>
        </button>
        <button
          type="button"
          className={cn(
            "rounded-lg border p-4 text-left transition hover:border-primary",
            source === "lista" ? "border-primary bg-primary/5" : "border-border"
          )}
          onClick={() => setSource("lista")}
        >
          <p className="text-sm font-semibold">Lista guardada</p>
          <p className="text-xs text-muted-foreground">Reutiliza filtros inteligentes.</p>
        </button>
        <button
          type="button"
          className={cn(
            "rounded-lg border p-4 text-left transition hover:border-primary",
            source === "filters" ? "border-primary bg-primary/5" : "border-border"
          )}
          onClick={() => setSource("filters")}
        >
          <p className="text-sm font-semibold">Filtros rápidos</p>
          <p className="text-xs text-muted-foreground">Define segmento al vuelo.</p>
        </button>
      </div>
      {source === "lista" ? (
        <div className="space-y-1">
          <Label>Selecciona una lista</Label>
          <Select
            value={selectedListaId ?? ""}
            onValueChange={(value) => setSelectedListaId(value || null)}
            disabled={listasLoading || !listas.length}
          >
            <SelectTrigger>
              <SelectValue placeholder={listasLoading ? "Cargando..." : "Selecciona una lista"} />
            </SelectTrigger>
            <SelectContent>
              {listas.map((lista) => (
                <SelectItem key={lista.id} value={lista.id}>
                  {lista.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedList?.descripcion ? (
            <p className="text-xs text-muted-foreground">{selectedList.descripcion}</p>
          ) : null}
        </div>
      ) : null}
      {source === "filters" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <Label>Fuente</Label>
            <Select
              value={filters.fuente ?? "__all__"}
              onValueChange={(value) =>
                setFilters((prev) => ({
                  ...prev,
                  fuente: value === "__all__" ? "" : (value as ProspectoFiltroInput["fuente"]),
                }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Todas las fuentes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas</SelectItem>
                <SelectItem value="google_places">Google</SelectItem>
                <SelectItem value="denue">DENUE</SelectItem>
                <SelectItem value="usuario">Manual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Segmento</Label>
            <Input
              value={filters.segmento ?? ""}
              onChange={(event) => setFilters((prev) => ({ ...prev, segmento: event.target.value }))}
              placeholder="Ej. escuelas privadas"
            />
          </div>
          <div className="space-y-1">
            <Label>Stage</Label>
            <Select
              value={filters.stage ?? "__all__"}
              onValueChange={(value) =>
                setFilters((prev) => ({
                  ...prev,
                  stage: value === "__all__" ? "" : (value as ProspectoFiltroInput["stage"]),
                }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Cualquiera" />
              </SelectTrigger>
              <SelectContent>
                {STAGES.map((stage) => (
                  <SelectItem key={stage.value} value={stage.value}>
                    {stage.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Filtro rápido</Label>
            <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <div>
                <p className="font-medium">WhatsApp verificado</p>
                <p className="text-xs text-muted-foreground">Sólo números móviles.</p>
              </div>
              <Checkbox
                checked={filters.whatsapp_permitido ?? false}
                onCheckedChange={(checked) =>
                  setFilters((prev) => ({ ...prev, whatsapp_permitido: checked === true }))
                }
              />
            </div>
            <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <div>
                <p className="font-medium">Permite llamadas</p>
                <p className="text-xs text-muted-foreground">Líneas móviles o fijas.</p>
              </div>
              <Checkbox
                checked={filters.llamada_permitida ?? false}
                onCheckedChange={(checked) =>
                  setFilters((prev) => ({ ...prev, llamada_permitida: checked === true }))
                }
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )

  const renderStepChannels = () => (
    <div className="space-y-4">
      {CHANNEL_OPTIONS.map((option) => {
        const state = channelState[option.key]
        return (
          <div key={option.key} className="rounded-lg border p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{option.label}</p>
                <p className="text-xs text-muted-foreground">{option.description}</p>
              </div>
              <Checkbox
                checked={state.enabled}
                onCheckedChange={(checked) => handleChannelToggle(option.key, checked === true)}
              />
            </div>
            {state.enabled ? (
              <div className="mt-3 space-y-3">
                <div className="space-y-1">
                  <Label>Plantilla</Label>
                  <Select
                    value={state.templateSlug ?? ""}
                    onValueChange={(value) => handleTemplateSelect(option.key, value)}
                    disabled={templatesLoading || !templates.length}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={templatesLoading ? "Cargando..." : "Selecciona plantilla"} />
                    </SelectTrigger>
                    <SelectContent>
                      {templates
                        .filter((tpl) => tpl.canal === option.key)
                        .map((tpl) => (
                          <SelectItem key={tpl.slug} value={tpl.slug}>
                            {tpl.nombre}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                {option.key === "correo" ? (
                  <>
                    <div className="space-y-1">
                      <Label>Asunto</Label>
                      <Input
                        ref={correoAsuntoRef}
                        value={state.subject ?? ""}
                        onChange={(event) =>
                          setChannelState((prev) => ({
                            ...prev,
                            correo: { ...prev.correo, subject: event.target.value },
                          }))
                        }
                      />
                      <div className="flex flex-wrap gap-1">
                        {MAIL_VARIABLE_TOKENS.map((token) => (
                          <Button
                            key={`wizard-asunto-${token}`}
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => appendCorreoToken("subject", token)}
                          >
                            {token}
                          </Button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label>Cuerpo</Label>
                      <Textarea
                        ref={correoCuerpoRef}
                        rows={4}
                        value={state.body ?? ""}
                        onChange={(event) =>
                          setChannelState((prev) => ({
                            ...prev,
                            correo: { ...prev.correo, body: event.target.value },
                          }))
                        }
                      />
                      <div className="flex flex-wrap gap-1">
                        {MAIL_VARIABLE_TOKENS.map((token) => (
                          <Button
                            key={`wizard-cuerpo-${token}`}
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => appendCorreoToken("body", token)}
                          >
                            {token}
                          </Button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label>HTML (opcional)</Label>
                      <Textarea
                        ref={correoHtmlRef}
                        rows={6}
                        value={state.bodyHtml ?? ""}
                        onChange={(event) =>
                          setChannelState((prev) => ({
                            ...prev,
                            correo: { ...prev.correo, bodyHtml: event.target.value },
                          }))
                        }
                        placeholder={'<p>Hola {{nombre}}</p><p><img src="https://..." alt="Banner" /></p>'}
                      />
                      <div className="flex flex-wrap gap-1">
                        {MAIL_VARIABLE_TOKENS.map((token) => (
                          <Button
                            key={`wizard-html-${token}`}
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => appendCorreoToken("bodyHtml", token)}
                          >
                            {token}
                          </Button>
                        ))}
                      </div>
                      <div className="space-y-2 rounded-md border border-dashed p-2">
                        <Label className="text-xs">Logo para correo</Label>
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => void handleInsertQuoteLogo()}>
                            Insertar logo
                          </Button>
                          <Button type="button" variant="outline" size="sm" onClick={() => void loadLogos()} disabled={logosLoading}>
                            {logosLoading ? "Cargando..." : "Cargar galería"}
                          </Button>
                        </div>
                        {logos.length ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <Select value={selectedLogoUrl} onValueChange={setSelectedLogoUrl}>
                              <SelectTrigger className="w-[280px]">
                                <SelectValue placeholder="Selecciona un logo" />
                              </SelectTrigger>
                              <SelectContent>
                                {logos.map((logo) => (
                                  <SelectItem key={logo.id} value={logo.file_url}>
                                    {logo.nombre}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={!selectedLogoUrl}
                              onClick={() => insertCorreoLogo(selectedLogoUrl)}
                            >
                              Insertar seleccionado
                            </Button>
                          </div>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Usa URL pública para imágenes. Variables soportadas: {"{{nombre}}, {{empresa}}, {{email}}, {{telefono}}, {{segmento}}, {{logo_url}}"}.
                      </p>
                    </div>
                  </>
                ) : null}
                {option.key === "whatsapp" ? (
                  <div className="space-y-1">
                    <Label>Mensaje de WhatsApp</Label>
                    <Textarea
                      rows={4}
                      value={state.body ?? ""}
                      onChange={(event) =>
                        setChannelState((prev) => ({
                          ...prev,
                          whatsapp: { ...prev.whatsapp, body: event.target.value },
                        }))
                      }
                    />
                  </div>
                ) : null}
                {option.key === "llamada" ? (
                  <div className="space-y-1">
                    <Label>Mensaje de llamada</Label>
                    <Textarea
                      rows={3}
                      value={state.message ?? ""}
                      onChange={(event) =>
                        setChannelState((prev) => ({
                          ...prev,
                          llamada: { ...prev.llamada, message: event.target.value },
                        }))
                      }
                    />
                  </div>
                ) : null}
                <div className="space-y-1">
                  <Label>Programar canal (opcional)</Label>
                  <Input
                    type="datetime-local"
                    value={state.schedule ?? ""}
                    onChange={(event) =>
                      setChannelState((prev) => ({
                        ...prev,
                        [option.key]: { ...prev[option.key], schedule: event.target.value },
                      }))
                    }
                  />
                </div>
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )

  const renderStepSchedule = () => (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {editCampanaId ? (
          <div className="space-y-1">
            <Label>Nombre de campaña CRM</Label>
            <Input
              value={campanaNombre}
              onChange={(event) => setCampanaNombre(event.target.value)}
              placeholder="Ej. Prospección inmobiliarias Q1"
            />
          </div>
        ) : null}
        <div className="space-y-1">
          <Label>Nombre interno del lote</Label>
          <Input value={titulo} onChange={(event) => setTitulo(event.target.value)} placeholder="Ej. Follow up semana 42" />
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <Label>Campaña CRM</Label>
            <Button type="button" variant="ghost" size="sm" onClick={() => setNewCampaignOpen((prev) => !prev)}>
              {newCampaignOpen ? "Cancelar" : "Nueva campaña CRM"}
            </Button>
          </div>
          <Select
            value={campanaId ?? ""}
            onValueChange={setCampanaId}
            disabled={campanasLoading || !campanaOptions.length}
          >
            <SelectTrigger>
              <SelectValue placeholder={campanasLoading ? "Cargando..." : "Selecciona campaña"} />
            </SelectTrigger>
            <SelectContent>
              {campanaOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {newCampaignOpen ? (
            <div className="mt-2 flex flex-col gap-2 rounded-md border bg-muted/30 p-2 md:flex-row">
              <Input
                value={newCampaignName}
                onChange={(event) => setNewCampaignName(event.target.value)}
                placeholder="Ej. Prospección inmobiliarias Q1"
              />
              <Button type="button" onClick={() => void handleCreateCampaign()} disabled={newCampaignSaving}>
                {newCampaignSaving ? "Guardando..." : "Guardar"}
              </Button>
            </div>
          ) : null}
        </div>
        <div className="space-y-1">
          <Label>Separación entre envíos (segundos)</Label>
          <Input
            type="number"
            min={5}
            max={3600}
            step={1}
            value={separacionSegundos}
            onChange={(event) => setSeparacionSegundos(event.target.value)}
            placeholder="5"
          />
          <p className="text-xs text-muted-foreground">
            Mínimo `5` segundos. Ejemplo: `30` programa un envío cada 30 segundos.
          </p>
        </div>
      </div>
      <Separator />
      <div className="space-y-2 rounded-lg border p-4 text-sm">
        <p className="font-semibold">Resumen</p>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>
            Audiencia:{" "}
            {source === "selected"
              ? `${selectedIds.length} seleccionados`
              : source === "lista"
                ? selectedList?.nombre ?? "Lista seleccionada"
                : "Filtros personalizados"}
          </li>
          <li>
            Canales:{" "}
            {activeChannels.length
              ? activeChannels.map((channel) => channel.label).join(", ")
              : "Ninguno"}
          </li>
          <li>
            Campaña:{" "}
            {campanaOptions.find((option) => option.value === campanaId)?.label ?? "No seleccionada"}
          </li>
          <li>Separación: {Math.max(5, Number.parseInt(separacionSegundos || "5", 10) || 5)} segundos</li>
        </ul>
      </div>
    </div>
  )

  const renderStep = () => {
    if (step === 0) {
      return renderStepAudience()
    }
    if (step === 1) {
      return renderStepChannels()
    }
    return renderStepSchedule()
  }

  const handleNext = () => {
    if (step === 0 && !canContinueStepOne) {
      setError("Selecciona una fuente para la audiencia.")
      return
    }
    if (step === 1 && !canContinueStepTwo) {
      setError("Activa al menos un canal.")
      return
    }
    setError(null)
    setStep((prev) => Math.min(prev + 1, 2))
  }

  const handlePrev = () => {
    setError(null)
    setStep((prev) => Math.max(prev - 1, 0))
  }

  return (
    <Dialog open={open} onOpenChange={(value) => (!value ? onClose() : null)}>
      <DialogContent className="w-[96vw] max-w-6xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <IconTargetArrow className="size-5 text-primary" />
            {editCampanaId ? "Editar campaña" : "Lanzar nueva campaña"}
          </DialogTitle>
          <DialogDescription>
            {editCampanaId
              ? "Ajusta audiencia, contenido y programación del lote principal de esta campaña."
              : "Sigue el flujo Descubre → Enriquecer → Preparar → Lanzar para crear un lote multicanal listo para ejecutar."}
          </DialogDescription>
          {preset?.campanaNombre ? (
            <div className="rounded-md border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-xs font-medium text-primary">
              Duplicando campaña {preset.campanaNombre}
            </div>
          ) : null}
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Flujo de ejecución</p>
            <ol className="mt-1 list-decimal space-y-1 pl-4">
              <li>Se seleccionan prospectos.</li>
              <li>Se elige campaña.</li>
              <li>Se elige plantilla filtrada por campaña.</li>
              <li>Se configura programación y separación entre envíos.</li>
              <li>Se ejecuta lote.</li>
            </ol>
          </div>
          <ol className="flex flex-wrap items-center gap-3 text-sm">
            {["Audiencia", "Canales", "Programación"].map((label, index) => (
              <li key={label} className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex size-7 items-center justify-center rounded-full border text-xs font-semibold",
                    step === index
                      ? "border-primary bg-primary text-primary-foreground"
                      : step > index
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : "border-muted-foreground text-muted-foreground"
                  )}
                >
                  {index + 1}
                </span>
                <span className={cn(step === index ? "font-semibold" : "text-muted-foreground")}>{label}</span>
              </li>
            ))}
          </ol>

          <div className="max-h-[62vh] overflow-y-auto rounded-lg border bg-muted/10 p-4 pr-2">{renderStep()}</div>

          {error ? (
            <div className="flex items-center gap-2 rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <IconAlertTriangle className="size-4" />
              <span>{error}</span>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="outline" onClick={step === 0 ? onClose : handlePrev} disabled={submitting}>
              {step === 0 ? "Cancelar" : (
                <>
                  <IconChevronLeft className="mr-1 h-4 w-4" />
                  Atrás
                </>
              )}
            </Button>
            <div className="flex gap-2">
              {step < 2 ? (
                <Button onClick={handleNext}>
                  Siguiente
                  <IconChevronRight className="ml-1 h-4 w-4" />
                </Button>
              ) : (
                <Button onClick={() => void handleSubmit()} disabled={submitting}>
                {submitting ? (editCampanaId ? "Guardando..." : "Creando...") : (editCampanaId ? "Guardar cambios" : "Lanzar campaña")}
              </Button>
            )}
          </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
