"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
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
  getProspeccionCampanas,
  listContactoTemplates,
  listProspeccionListas,
  type ContactarProspectosPayload,
  type ContactoTemplate,
  type ProspeccionCampanaGroup,
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
  { value: "", label: "Cualquiera" },
  { value: "discover", label: "Discover" },
  { value: "enrich", label: "Enrich" },
  { value: "prepare", label: "Prepare" },
  { value: "launch", label: "Launch" },
  { value: "evaluate", label: "Evaluate" },
]

const CAMPANA_NONE_OPTION = "__none__"

type ChannelState = Record<
  "correo" | "whatsapp" | "llamada",
  { enabled: boolean; templateSlug?: string; subject?: string; body?: string; message?: string; schedule?: string }
>

const DEFAULT_CHANNEL_STATE: ChannelState = {
  correo: { enabled: true, subject: "", body: "" },
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
  onCompleted,
}: ProspeccionCampaignWizardProps) {
  const [step, setStep] = useState(0)
  const [source, setSource] = useState<WizardSource>("selected")
  const [presetApplied, setPresetApplied] = useState(false)
  const [listas, setListas] = useState<ProspeccionLista[]>([])
  const [listasLoading, setListasLoading] = useState(false)
  const [selectedListaId, setSelectedListaId] = useState<string | null>(null)
  const [filters, setFilters] = useState<ProspectoFiltroInput>(defaultFilters ?? {})
  const [templates, setTemplates] = useState<ContactoTemplate[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [campanas, setCampanas] = useState<ProspeccionCampanaGroup[]>([])
  const [campanasLoading, setCampanasLoading] = useState(false)
  const [campanaId, setCampanaId] = useState<string | null>(null)
  const [titulo, setTitulo] = useState("")
  const [channelState, setChannelState] = useState<ChannelState>(() => buildChannelState())
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const selectedList = useMemo(() => listas.find((lista) => lista.id === selectedListaId), [listas, selectedListaId])

  const resetState = useCallback(() => {
    setStep(0)
    setSource("selected")
    setSelectedListaId(null)
    setFilters(defaultFilters ?? {})
    setCampanaId(null)
    setTitulo("")
    setChannelState(buildChannelState())
    setError(null)
    setPresetApplied(false)
  }, [defaultFilters])

  useEffect(() => {
    if (!open) {
      resetState()
      return
    }
    setError(null)
    setListasLoading(true)
    setTemplatesLoading(true)
    setCampanasLoading(true)
    void Promise.all([
      listProspeccionListas({ limit: 50 }),
      listContactoTemplates(),
      getProspeccionCampanas(25),
    ])
      .then(([listasResponse, templatesResponse, campanasResponse]) => {
        if (listasResponse?.items) {
          setListas(listasResponse.items)
          setSelectedListaId((prev) => {
            if (prev) return prev
            if (preset?.listaId) return preset.listaId
            if (presetApplied) return prev
            const firstLista = listasResponse.items[0]
            return firstLista ? firstLista.id : prev
          })
        }
        if (templatesResponse?.items) {
          setTemplates(templatesResponse.items)
        }
        if (campanasResponse?.items) {
          setCampanas(campanasResponse.items)
        }
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : "No se pudo cargar la información del wizard."
        setError(message)
      })
      .finally(() => {
        setListasLoading(false)
        setTemplatesLoading(false)
        setCampanasLoading(false)
      })
  }, [open, preset, presetApplied, resetState])

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
    if ("titulo" in preset) {
      setTitulo(preset.titulo ?? "")
    }
    if (preset.canales) {
      setChannelState(buildChannelState(preset.canales))
    }
    setPresetApplied(true)
  }, [open, preset, presetApplied])

  const handleTemplateSelect = (canal: "correo" | "whatsapp" | "llamada", slug: string) => {
    const template = templates.find((tpl) => tpl.slug === slug)
    if (!template) return
    setChannelState((prev) => {
      const next = { ...prev }
      const current = next[canal] ?? { enabled: false }
      next[canal] = {
        ...current,
        templateSlug: slug,
        subject: template.asunto ?? current.subject,
        body: template.cuerpo_texto ?? current.body,
        message: template.descripcion ?? current.message,
        enabled: true,
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
    const options: Array<{ value: string; label: string }> = [{ value: CAMPANA_NONE_OPTION, label: "Sin campaña" }]
    campanas.forEach((group) => {
      if (group.campana_id) {
        options.push({
          value: group.campana_id,
          label: group.campana_nombre ?? `Campaña ${group.campana_id.slice(0, 8)}`,
        })
      }
    })
    return options
  }, [campanas])

  const handleSubmit = async () => {
    setError(null)
    if (!canContinueStepTwo) {
      setError("Selecciona al menos un canal para la campaña.")
      setStep(1)
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
          subject: config.subject,
          body: config.body,
          message: config.message,
          programado_en: config.schedule ? new Date(config.schedule).toISOString() : undefined,
        }
        return channelPayload
      }),
      campana_id: campanaId || undefined,
      batch_titulo: titulo.trim() || undefined,
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
      const response = await contactarProspectos(payload)
      onCompleted?.({
        batchId: response.batch_id,
        total: response.contactos?.length,
        contactos: response.contactos ?? [],
        omitidos: response.omitidos,
      })
      onClose()
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo crear la campaña."
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
              value={filters.fuente ?? ""}
              onValueChange={(value) => setFilters((prev) => ({ ...prev, fuente: value as ProspectoFiltroInput["fuente"] }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Todas las fuentes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Todas</SelectItem>
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
              value={filters.stage ?? ""}
              onValueChange={(value) => setFilters((prev) => ({ ...prev, stage: value as ProspectoFiltroInput["stage"] }))}
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
                        value={state.subject ?? ""}
                        onChange={(event) =>
                          setChannelState((prev) => ({
                            ...prev,
                            correo: { ...prev.correo, subject: event.target.value },
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Cuerpo</Label>
                      <Textarea
                        rows={4}
                        value={state.body ?? ""}
                        onChange={(event) =>
                          setChannelState((prev) => ({
                            ...prev,
                            correo: { ...prev.correo, body: event.target.value },
                          }))
                        }
                      />
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
        <div className="space-y-1">
          <Label>Nombre interno del lote</Label>
          <Input value={titulo} onChange={(event) => setTitulo(event.target.value)} placeholder="Ej. Follow up semana 42" />
        </div>
        <div className="space-y-1">
          <Label>Campaña CRM</Label>
          <Select
            value={campanaId ?? CAMPANA_NONE_OPTION}
            onValueChange={(value) => setCampanaId(value === CAMPANA_NONE_OPTION ? null : value)}
          >
            <SelectTrigger>
              <SelectValue placeholder={campanasLoading ? "Cargando..." : "Sin campaña"} />
            </SelectTrigger>
            <SelectContent>
              {campanaOptions.map((option) => (
                <SelectItem key={option.value || "none"} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
            {
              campanaOptions.find(
                (option) => option.value === (campanaId ?? CAMPANA_NONE_OPTION)
              )?.label
            }
          </li>
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
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <IconTargetArrow className="size-5 text-primary" />
            Lanzar nueva campaña
          </DialogTitle>
          <DialogDescription>
            Sigue el flujo Descubre → Enriquecer → Preparar → Lanzar para crear un lote multicanal listo para ejecutar.
          </DialogDescription>
          {preset?.campanaNombre ? (
            <div className="rounded-md border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-xs font-medium text-primary">
              Duplicando campaña {preset.campanaNombre}
            </div>
          ) : null}
        </DialogHeader>

        <div className="space-y-4">
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

          <div className="rounded-lg border bg-muted/10 p-4">{renderStep()}</div>

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
                  {submitting ? "Creando..." : "Lanzar campaña"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
