"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Image from "next/image"
import { IconAlertTriangle, IconChevronLeft, IconChevronRight, IconTargetArrow } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
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
import { PROSPECCION_SOURCE_LABELS } from "@/lib/prospeccion/source-labels"

type WizardSource = "selected" | "lista" | "filters"

const CHANNEL_OPTIONS: Array<{ key: "correo" | "whatsapp" | "llamada"; label: string; description: string }> = [
  { key: "correo", label: "Correo", description: "Envía correo SMTP usando la plantilla seleccionada." },
  { key: "whatsapp", label: "WhatsApp", description: "Mensajes con plantilla aprobada en Meta al número verificado." },
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

const PREVIEW_VALUES: Record<string, string> = {
  display_name: "Empresa de ejemplo",
  nombre: "Empresa de ejemplo",
  titulo: "Empresa de ejemplo",
  primer_apellido: "",
  segundo_apellido: "",
  empresa: "Empresa de ejemplo",
  email: "contacto@ejemplo.com",
  telefono: "+52 444 000 0000",
  segmento: "Prospectos",
  canal_origen: "Prospección",
  tracking_url: "https://talia.mx/",
  website_url: "https://talia.mx/",
  booking_url: "https://talia.mx/demo.html",
  booking_link_text: "Agenda una demostración",
}

function renderTemplatePreviewContent(template: ContactoTemplate, content: string, includeImages: boolean): string {
  if (!content) return ""
  const images = Object.fromEntries(
    (template.imagenes ?? [])
      .filter((image) => image.file_url)
      .map((image) => [image.variable_clave, image.file_url as string]),
  )
  return content.replace(/{{\s*([^{}]+?)\s*}}/g, (_match, rawKey: string) => {
    const key = rawKey.trim()
    if (key in images) return includeImages ? images[key] : ""
    return PREVIEW_VALUES[key] ?? ""
  })
}

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
  canal?: "correo" | "whatsapp" | "llamada" | null
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
  if (typeof filters.envios_correo_min === "number") clean.envios_correo_min = filters.envios_correo_min
  if (typeof filters.envios_correo_max === "number") clean.envios_correo_max = filters.envios_correo_max
  if (typeof filters.envios_whatsapp_min === "number") clean.envios_whatsapp_min = filters.envios_whatsapp_min
  if (typeof filters.envios_whatsapp_max === "number") clean.envios_whatsapp_max = filters.envios_whatsapp_max
  if (typeof filters.envios_voz_min === "number") clean.envios_voz_min = filters.envios_voz_min
  if (typeof filters.envios_voz_max === "number") clean.envios_voz_max = filters.envios_voz_max
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
  const [titulo, setTitulo] = useState("")
  const [channelState, setChannelState] = useState<ChannelState>(() => buildChannelState())
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
    const presetCanal = preset?.canal ?? null
    setChannelState(
      buildChannelState(
        presetCanal
          ? {
              correo: { enabled: presetCanal === "correo" },
              whatsapp: { enabled: presetCanal === "whatsapp" },
              llamada: { enabled: presetCanal === "llamada" },
            }
          : undefined,
      ),
    )
    setNewCampaignOpen(false)
    setNewCampaignName("")
    setSeparacionSegundos("5")
    setError(null)
    setPresetApplied(false)
  }, [defaultFilters, defaultSource, preset?.canal])

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
    if (preset.canal) {
      setChannelState((prev) => {
        const next = { ...prev }
        ;(Object.keys(next) as Array<keyof ChannelState>).forEach((key) => {
          next[key] = { ...next[key], enabled: key === preset.canal }
        })
        return next
      })
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
    const template = templates.find((tpl) => tpl.slug === slug && tpl.canal === canal)
    if (!template) return
    setChannelState((prev) => {
      const next = { ...prev }
      const current = next[canal] ?? { enabled: false }
      next[canal] = {
        ...current,
        templateSlug: slug,
        enabled: true,
      }
      return next
    })
  }

  const handleChannelToggle = (canal: "correo" | "whatsapp" | "llamada", enabled: boolean) => {
    setChannelState((prev) => {
      const next = { ...prev }
      ;(Object.keys(next) as Array<keyof ChannelState>).forEach((key) => {
        next[key] = { ...next[key], enabled: enabled && key === canal }
      })
      return next
    })
    if (enabled) {
      setCampanaId(null)
      setCampanaNombre("")
    }
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

  const selectedCanal = activeChannels[0]?.key ?? null

  useEffect(() => {
    if (!open || !campanaId) {
      setTemplates([])
      return
    }
    setTemplatesLoading(true)
    void listContactoTemplates(
      selectedCanal
        ? { canal: selectedCanal, campana_id: campanaId }
        : { campana_id: campanaId },
    )
      .then((response) => {
        setTemplates(Array.isArray(response?.items) ? response.items : [])
      })
      .catch(() => {
        setTemplates([])
      })
      .finally(() => {
        setTemplatesLoading(false)
      })
  }, [open, campanaId, selectedCanal])

  const channelCampanas = useMemo(
    () => (selectedCanal ? campanas.filter((campana) => campana.canal === selectedCanal) : campanas),
    [campanas, selectedCanal],
  )

  const availableChannelOptions = useMemo(
    () => CHANNEL_OPTIONS.filter((option) => !preset?.canal || option.key === preset.canal),
    [preset?.canal],
  )

  const canContinueStepTwo = activeChannels.length === 1 && activeChannels.every(({ key }) => Boolean(channelState[key].templateSlug))

  const canContinueCampaignStep = Boolean(selectedCanal && campanaId && channelCampanas.some((campana) => campana.id === campanaId))

  const campanaOptions = useMemo(() => {
    const options: Array<{ value: string; label: string }> = []
    channelCampanas.forEach((group) => {
      if (group.id) {
        options.push({
          value: group.id,
          label: group.nombre?.trim() || "Campaña",
        })
      }
    })
    return options
  }, [channelCampanas])

  useEffect(() => {
    if (!open || !selectedCanal) return
    if (!campanaId || channelCampanas.some((campana) => campana.id === campanaId)) return
    setCampanaId(null)
    setCampanaNombre("")
    setChannelState((prev) => ({
      ...prev,
      [selectedCanal]: { ...prev[selectedCanal], templateSlug: undefined },
    }))
  }, [campanaId, channelCampanas, open, selectedCanal])

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

  const handleSubmit = async () => {
    setError(null)
    if (!campanaId) {
      setError("Selecciona una campaña para registrar el envío.")
      setStep(2)
      return
    }
    if (!canContinueStepTwo) {
      setError("Elige un canal y un contenido guardado para continuar.")
      setStep(1)
      return
    }
    const separacionParsed = Number.parseInt(separacionSegundos || "5", 10)
    if (Number.isNaN(separacionParsed) || separacionParsed < 5 || separacionParsed > 3600) {
      setError("La separación entre envíos debe estar entre 5 y 3600 segundos.")
      setStep(2)
      return
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
          programado_en: config.schedule ? new Date(config.schedule).toISOString() : undefined,
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
                <SelectItem value="denue">{PROSPECCION_SOURCE_LABELS.denue}</SelectItem>
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

  const renderStepCampaign = () => (
    <div className="space-y-4">
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
        {selectedCanal
          ? `Canal seleccionado: ${CHANNEL_OPTIONS.find((option) => option.key === selectedCanal)?.label ?? selectedCanal}. Ahora elige la campaña de este canal.`
          : "Primero elige el canal y después la campaña que quieres utilizar."}
      </div>
      {!preset?.canal ? (
        <div className="grid gap-3 md:grid-cols-3">
          {availableChannelOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              className={cn("rounded-lg border p-4 text-left transition hover:border-primary", selectedCanal === option.key ? "border-primary bg-primary/5" : "border-border")}
              onClick={() => handleChannelToggle(option.key, true)}
            >
              <p className="text-sm font-semibold">{option.label}</p>
              <p className="text-xs text-muted-foreground">{option.description}</p>
            </button>
          ))}
        </div>
      ) : null}
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <Label>Campaña</Label>
          <Button type="button" variant="ghost" size="sm" onClick={() => setNewCampaignOpen((prev) => !prev)} disabled={!selectedCanal}>
            {newCampaignOpen ? "Cancelar" : "Nueva campaña"}
          </Button>
        </div>
        <Select
          value={campanaId ?? ""}
          onValueChange={(value) => {
            setCampanaId(value)
            setChannelState((prev) => ({
              ...prev,
              ...(selectedCanal ? { [selectedCanal]: { ...prev[selectedCanal], templateSlug: undefined } } : {}),
            }))
          }}
          disabled={!selectedCanal || campanasLoading || !campanaOptions.length}
        >
          <SelectTrigger>
            <SelectValue placeholder={campanasLoading ? "Cargando campañas..." : "Selecciona una campaña"} />
          </SelectTrigger>
          <SelectContent>
            {campanaOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!campanasLoading && selectedCanal && !campanaOptions.length ? (
          <p className="text-xs text-muted-foreground">Todavía no hay campañas para este canal. Crea una para continuar.</p>
        ) : null}
        {newCampaignOpen ? (
          <div className="mt-2 flex flex-col gap-2 rounded-md border bg-muted/30 p-2 md:flex-row">
            <Input value={newCampaignName} onChange={(event) => setNewCampaignName(event.target.value)} placeholder="Ej. Prospección inmobiliarias Q1" />
            <Button type="button" onClick={() => void handleCreateCampaign()} disabled={newCampaignSaving || !selectedCanal}>
              {newCampaignSaving ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )

  const renderStepChannels = () => (
    <div className="space-y-4">
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
        Elige la plantilla de la campaña seleccionada. El contenido y sus variables ya están configurados en ella.
      </div>
      {availableChannelOptions.map((option) => {
        const state = channelState[option.key]
        const selectedTemplate = templates.find((tpl) => tpl.slug === state.templateSlug && tpl.canal === option.key)
        return (
          <div key={option.key} className="rounded-lg border p-4">
              <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{option.label}</p>
                <p className="text-xs text-muted-foreground">{option.description}</p>
              </div>
              {!preset?.canal ? (
                <input
                  type="radio"
                  name="prospeccion-canal"
                  checked={state.enabled}
                  onChange={() => handleChannelToggle(option.key, true)}
                  aria-label={`Elegir ${option.label}`}
                />
              ) : null}
            </div>
            {state.enabled ? (
              <div className="mt-3 space-y-3">
                <div className="space-y-1">
                  <Label>{option.key === "correo" ? "Correo" : option.key === "whatsapp" ? "Mensaje" : "Guion"}</Label>
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
                            {option.key === "whatsapp" && tpl.meta_category ? ` · ${tpl.meta_category}` : ""}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                {selectedTemplate ? (
                  <div className="rounded-md border bg-muted/30 p-3 text-sm">
                    <p className="font-medium">{selectedTemplate.nombre}</p>
                    {selectedTemplate.canal === "correo" ? (
                      <div className="mt-2 space-y-2 text-xs">
                        <p><span className="font-medium">Asunto:</span> {selectedTemplate.asunto || "Sin asunto"}</p>
                        {selectedTemplate.cuerpo_html ? (
                          <iframe
                            title={`Vista previa de ${selectedTemplate.nombre}`}
                            sandbox=""
                            srcDoc={renderTemplatePreviewContent(selectedTemplate, selectedTemplate.cuerpo_html, true)}
                            className="h-56 w-full rounded border bg-white"
                          />
                        ) : (
                          <p className="whitespace-pre-wrap rounded border bg-background p-2 text-muted-foreground">
                            {renderTemplatePreviewContent(selectedTemplate, selectedTemplate.cuerpo_texto || selectedTemplate.descripcion || "Sin contenido", false)}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="mt-2 space-y-2">
                        {(() => {
                          const whatsappImage = (selectedTemplate.imagenes ?? [])
                            .filter((image) => image.file_url)
                            .sort((a, b) => {
                              const priority = ["logo_url", "hero_image_url", "product_image_1_url", "warranty_image_url"]
                              return priority.indexOf(a.variable_clave) - priority.indexOf(b.variable_clave)
                            })[0]
                          return (
                            <div className="mx-auto w-full max-w-sm overflow-hidden rounded-lg border bg-background shadow-sm">
                              {whatsappImage?.file_url ? (
                                <Image src={whatsappImage.file_url} alt={whatsappImage.nombre ?? "Imagen de la plantilla"} width={360} height={240} unoptimized className="mx-auto max-h-48 w-full object-contain" />
                              ) : null}
                              <p className="whitespace-pre-wrap px-3 py-2 text-xs leading-5 text-foreground">
                                {renderTemplatePreviewContent(selectedTemplate, selectedTemplate.cuerpo_texto || selectedTemplate.descripcion || "Sin contenido", false)}
                              </p>
                            </div>
                          )
                        })()}
                      </div>
                    )}
                    <p className="mt-2 text-xs text-muted-foreground">El contenido se toma de la plantilla y no se modifica aquí.</p>
                  </div>
                ) : null}
                <div className="space-y-1">
                  <Label>Cuándo usarlo (opcional)</Label>
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
          <Label>Nombre de este envío (opcional)</Label>
          <Input value={titulo} onChange={(event) => setTitulo(event.target.value)} placeholder="Ej. Seguimiento semana 42" />
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
            Lista:{" "}
            {source === "selected"
              ? `${selectedIds.length} seleccionados`
              : source === "lista"
                ? selectedList?.nombre ?? "Lista seleccionada"
                : "Filtros personalizados"}
          </li>
          <li>
            Canal:{" "}
            {activeChannels.length
              ? activeChannels[0].label
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
      return renderStepCampaign()
    }
    if (step === 2) {
      return renderStepChannels()
    }
    return renderStepSchedule()
  }

  const handleNext = () => {
    if (step === 0 && !canContinueStepOne) {
      setError("Selecciona una fuente para la audiencia.")
      return
    }
    if (step === 1 && !canContinueCampaignStep) {
      setError("Selecciona una campaña del canal elegido para continuar.")
      return
    }
    if (step === 2 && !canContinueStepTwo) {
      setError("Selecciona una plantilla de la campaña para continuar.")
      return
    }
    setError(null)
    setStep((prev) => Math.min(prev + 1, 3))
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
              ? "Ajusta la lista, el contenido y cuándo quieres contactar."
              : "Elige una lista, un contenido guardado y cuándo quieres contactar."}
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
              <li>Se crea el envío.</li>
            </ol>
          </div>
          <ol className="flex flex-wrap items-center gap-3 text-sm">
            {["Lista", "Campaña", "Plantilla", "Cuándo"].map((label, index) => (
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
              {step < 3 ? (
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
