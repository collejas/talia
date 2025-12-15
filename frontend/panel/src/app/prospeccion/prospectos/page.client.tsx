"use client"

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react"
import {
  IconAlertTriangle,
  IconBolt,
  IconCircleCheck,
  IconDotsVertical,
  IconHistory,
  IconLoader,
  IconNotebook,
  IconPencil,
  IconPhoneCheck,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSparkles,
  IconSend2,
  IconTrash,
  IconMail,
  IconTargetArrow,
  IconPhone,
  IconBrandWhatsapp,
  IconUsersGroup,
} from "@tabler/icons-react"

import { ProspeccionViewLayout } from "@/components/layouts/prospeccion-view-layout"
import { ProspeccionCampaignWizard, type ProspeccionWizardPreset } from "@/components/prospeccion/prospeccion-campaign-wizard"
import { ProspeccionContactDrawer, type ProspeccionContactResult } from "@/components/prospeccion/prospeccion-contact-drawer"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { canalLabel, contactHistoryDetail, contactStatusLabel, contactStatusVariant } from "@/lib/prospeccion/contact-utils"
import {
  actualizarProspecto,
  crearProspectoManual,
  contactarProspectos,
  eliminarProspecto,
  convertirProspectoAContacto,
  type ConvertirProspectoPayload,
  listProspectos,
  listContactoEnviosPorProspecto,
  listContactoTemplates,
  listProspectoAudit,
  ejecutarChecklistLookup,
  ejecutarChecklistScraper,
  type ProspectoItem,
  type ProspectoManualInput,
  type ProspectoAuditEntry,
  type ContactoEnvio,
  type ContactoTemplate,
  type ProspeccionOmitido,
  verificarProspectos,
} from "@/lib/prospeccion/prospectos-client"

type FuenteFilter = "" | "google_places" | "denue" | "usuario"
type LookupFilter = "" | "pendiente" | "verificado" | "sin_numero" | "error"
type OrderOption = "creado" | "nombre"

type Filters = {
  search: string
  fuente: FuenteFilter
  lookupStatus: LookupFilter
  segmento: string
  order: OrderOption
  carrierType: "" | "mobile" | "landline" | "voip"
}

type BannerState = {
  type: "success" | "error"
  message: string
}

type PlannerMode = "quick" | "campaign"

type ContactDrawerData = {
  batchId?: string | null
  results: ProspeccionContactResult[]
  omitidos?: ProspeccionOmitido[]
}
type ChecklistSummary = {
  telefonos_pendientes: number
  sin_email: number
  datos_incompletos: number
}

const initialFilters: Filters = {
  search: "",
  fuente: "",
  lookupStatus: "",
  segmento: "",
  order: "creado",
  carrierType: "",
}

const initialContactForm = {
  correoAsunto: "",
  correoCuerpo: "",
  whatsappMensaje: "",
  llamadaNotas: "",
}

type ProspectoFormState = {
  displayName: string
  actividad: string
  phone: string
  email: string
  website: string
  address: string
  segmento: string
  notas: string
}

const initialProspectoForm: ProspectoFormState = {
  displayName: "",
  actividad: "",
  phone: "",
  email: "",
  website: "",
  address: "",
  segmento: "",
  notas: "",
}

type ProspeccionStage = "discover" | "enrich" | "prepare" | "launch" | "evaluate"
type ProspeccionCanal = "correo" | "whatsapp" | "llamada" | "otro"

const STAGE_LABELS: Record<ProspeccionStage, string> = {
  discover: "Discover",
  enrich: "Enrich",
  prepare: "Prepare",
  launch: "Launch",
  evaluate: "Evaluate",
}

const stageOptions: Array<{ value: ProspeccionStage; label: string }> = (Object.entries(
  STAGE_LABELS
) as Array<[ProspeccionStage, string]>).map(([value, label]) => ({
  value,
  label,
}))

const CANAL_LABELS: Record<ProspeccionCanal, string> = {
  correo: "Correo",
  whatsapp: "WhatsApp",
  llamada: "Llamada/voz",
  otro: "Otro",
}

const LOOKUP_STATUS_LABELS: Record<string, string> = {
  pendiente: "Pendiente",
  verificado: "Verificado",
  sin_numero: "Sin número",
  error: "Error",
}

const LOOKUP_STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pendiente: "secondary",
  verificado: "default",
  sin_numero: "outline",
  error: "destructive",
}

const FUENTE_LABELS: Record<string, string> = {
  google_places: "Google Places",
  denue: "DENUE",
  usuario: "Usuario",
}

const FUENTE_BUSQUEDA_LABELS: Record<string, string> = {
  buscador: "Búsqueda web",
  manual: "Captura manual",
  denue: "Importado DENUE",
  google_places: "Importado Google",
}

const PAGE_SIZE_OPTIONS = [10, 25, 50] as const
const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Mexico_City",
})

export default function ProspectosClientPage() {
  return (
    <ProspeccionViewLayout title="Prospección · Prospectos">
      <ProspectosView />
    </ProspeccionViewLayout>
  )
}

function ProspectosView() {
  const [filters, setFilters] = useState<Filters>(initialFilters)
  const [searchInput, setSearchInput] = useState(initialFilters.search)
  const [items, setItems] = useState<ProspectoItem[]>([])
  const [total, setTotal] = useState(0)
  const [limit, setLimit] = useState<number>(25)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [banner, setBanner] = useState<BannerState | null>(null)
  const [action, setAction] = useState<"lookup" | "contact" | null>(null)
  const [contactDialogOpen, setContactDialogOpen] = useState(false)
  const [contactForm, setContactForm] = useState(initialContactForm)
  const [contactError, setContactError] = useState<string | null>(null)
  const [formDialogOpen, setFormDialogOpen] = useState(false)
  const [formMode, setFormMode] = useState<"create" | "edit">("create")
  const [formValues, setFormValues] = useState<ProspectoFormState>(initialProspectoForm)
  const [formError, setFormError] = useState<string | null>(null)
  const [formSubmitting, setFormSubmitting] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [metadataBase, setMetadataBase] = useState<Record<string, unknown>>({})
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ProspectoItem | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [contactDrawerOpen, setContactDrawerOpen] = useState(false)
  const [contactDrawerData, setContactDrawerData] = useState<ContactDrawerData | null>(null)
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false)
  const [historyProspect, setHistoryProspect] = useState<ProspectoItem | null>(null)
  const [historyEntries, setHistoryEntries] = useState<ContactoEnvio[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [auditEntries, setAuditEntries] = useState<ProspectoAuditEntry[]>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditError, setAuditError] = useState<string | null>(null)
  const [historyTab, setHistoryTab] = useState<"contact" | "audit">("contact")
  const [templates, setTemplates] = useState<ContactoTemplate[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [selectedTemplates, setSelectedTemplates] = useState<Record<string, string>>({})
  const [checklist, setChecklist] = useState<ChecklistSummary | null>(null)
  const [checklistLoading, setChecklistLoading] = useState(false)
  const [checklistAction, setChecklistAction] = useState<"lookup" | "scraper" | null>(null)
  const [campaignWizardOpen, setCampaignWizardOpen] = useState(false)
  const [plannerOpen, setPlannerOpen] = useState(false)
  const [plannerMode, setPlannerMode] = useState<PlannerMode>("campaign")
  const [plannerName, setPlannerName] = useState("")
  const [plannerError, setPlannerError] = useState<string | null>(null)
  const [campaignWizardPreset, setCampaignWizardPreset] = useState<ProspeccionWizardPreset | null>(null)
  const [convertDialogOpen, setConvertDialogOpen] = useState(false)
  const [convertProspect, setConvertProspect] = useState<ProspectoItem | null>(null)
  const [convertForm, setConvertForm] = useState<{
    nombre: string
    correo: string
    telefono: string
    company: string
    notas: string
    stage: ProspeccionStage
    canal: ProspeccionCanal
  }>({
    nombre: "",
    correo: "",
    telefono: "",
    company: "",
    notas: "",
    stage: "evaluate",
    canal: "correo",
  })
  const [convertError, setConvertError] = useState<string | null>(null)
  const [convertSubmitting, setConvertSubmitting] = useState(false)

  const fetchProspectos = useCallback(
    async (nextOffset = 0) => {
      setLoading(true)
      setError(null)
      try {
        const response = await listProspectos({
          limit,
          offset: nextOffset,
          search: filters.search || undefined,
          fuente: filters.fuente || undefined,
          lookupStatus: filters.lookupStatus || undefined,
          segmento: filters.segmento || undefined,
          carrierType: filters.carrierType || undefined,
          order: filters.order,
        })
        const rows = response.items ?? []
        setItems(rows)
        setTotal(typeof response.total === "number" ? response.total : rows.length)
        setOffset(nextOffset)
        setSelected((prev) => {
          if (!rows.length) return new Set<string>()
          const allowed = new Set<string>()
          rows.forEach((row) => {
            if (row.id && prev.has(row.id)) {
              allowed.add(row.id)
            }
          })
          return allowed
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : "No se pudieron cargar los prospectos."
        setError(message)
      } finally {
        setLoading(false)
      }
    },
    [filters, limit]
  )

  useEffect(() => {
    void fetchProspectos(0)
  }, [fetchProspectos])

  const refreshChecklist = useCallback(async () => {
    setChecklistLoading(true)
    try {
      const response = await fetch("/api/prospeccion/prospectos/checklist", { cache: "no-store" })
      if (!response.ok) {
        throw new Error("checklist_error")
      }
      const data = (await response.json()) as { checklist?: ChecklistSummary }
      setChecklist(data?.checklist ?? null)
    } catch {
      setChecklist(null)
    } finally {
      setChecklistLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshChecklist()
  }, [refreshChecklist])

  useEffect(() => {
    if (!contactDialogOpen) {
      setContactError(null)
      setContactForm(initialContactForm)
    }
  }, [contactDialogOpen])

  useEffect(() => {
    if (!contactDialogOpen) {
      return
    }
    let active = true
    setTemplatesLoading(true)
    ;(async () => {
      try {
        const response = await listContactoTemplates()
        if (!active) return
        setTemplates(response.items ?? [])
      } catch {
        if (active) setTemplates([])
      } finally {
        if (active) setTemplatesLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [contactDialogOpen])

  useEffect(() => {
    if (!formDialogOpen) {
      setFormValues(initialProspectoForm)
      setFormError(null)
      setFormMode("create")
      setEditingId(null)
      setMetadataBase({})
      setFormSubmitting(false)
    }
  }, [formDialogOpen])

  const handleChecklistLookup = useCallback(async () => {
    setChecklistAction("lookup")
    setBanner(null)
    const pending = checklist?.telefonos_pendientes ?? 0
    const targetLimit = pending > 0 ? Math.min(200, pending) : 200
    try {
      const response = await ejecutarChecklistLookup({
        limit: targetLimit,
        reintentar: true,
      })
      if (!response.procesados) {
        setBanner({ type: "success", message: "No hay teléfonos pendientes de validar." })
      } else {
        setBanner({ type: "success", message: `Se validaron ${response.procesados} prospectos.` })
        await fetchProspectos(offset)
      }
      await refreshChecklist()
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "No se pudo ejecutar la verificación automática de teléfonos."
      setBanner({ type: "error", message })
    } finally {
      setChecklistAction(null)
    }
  }, [checklist, fetchProspectos, offset, refreshChecklist])

  const handleChecklistScraper = useCallback(async () => {
    setChecklistAction("scraper")
    setBanner(null)
    const pending = checklist?.sin_email ?? 0
    if (pending <= 0) {
      setBanner({ type: "success", message: "No hay prospectos pendientes de correo." })
      setChecklistAction(null)
      return
    }
    try {
      const response = await ejecutarChecklistScraper({
        limit: Math.max(1, Math.min(5, pending)),
        mode: "auto",
      })
      if (!response.programados) {
        setBanner({
          type: "error",
          message: "No encontramos sitios web válidos para lanzar el scraper automático.",
        })
      } else {
        setBanner({
          type: "success",
          message: `Se lanzaron ${response.programados} scrapers. Puedes revisar el progreso en el historial del buscador.`,
        })
      }
      await refreshChecklist()
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo lanzar el scraper."
      setBanner({ type: "error", message })
    } finally {
      setChecklistAction(null)
    }
  }, [checklist, refreshChecklist])

  const handleChecklistManual = useCallback(() => {
    setFormMode("create")
    setFormDialogOpen(true)
    setEditingId(null)
    setMetadataBase({})
    setFormValues(initialProspectoForm)
  }, [])

  useEffect(() => {
    if (!deleteDialogOpen) {
      setDeleteTarget(null)
      setDeleteError(null)
      setDeleteLoading(false)
    }
  }, [deleteDialogOpen])

  useEffect(() => {
    if (!historyDialogOpen) {
      setHistoryEntries([])
      setHistoryProspect(null)
      setHistoryError(null)
      setHistoryLoading(false)
      setAuditEntries([])
      setAuditError(null)
      setAuditLoading(false)
      setHistoryTab("contact")
    }
  }, [historyDialogOpen])

  useEffect(() => {
    if (!campaignWizardOpen) {
      setCampaignWizardPreset(null)
    }
  }, [campaignWizardOpen])

  const openContactDrawer = useCallback((data: ContactDrawerData) => {
    if (!data.results?.length) {
      setContactDrawerData(null)
      setContactDrawerOpen(false)
      return
    }
    setContactDrawerData(data)
    setContactDrawerOpen(true)
  }, [])

  const handleContactDrawerOpenChange = useCallback((open: boolean) => {
    setContactDrawerOpen(open)
    if (!open) {
      setContactDrawerData(null)
    }
  }, [])

  const handleTemplateSelect = (canal: "correo" | "whatsapp" | "llamada", slug: string) => {
    setSelectedTemplates((prev) => ({ ...prev, [canal]: slug }))
    const template = templates.find((item) => item.slug === slug && item.canal === canal)
    if (!template) return
    if (canal === "correo") {
      setContactForm((prev) => ({
        ...prev,
        correoAsunto: template.asunto ?? prev.correoAsunto,
        correoCuerpo: template.cuerpo_texto ?? prev.correoCuerpo,
      }))
    } else if (canal === "whatsapp") {
      setContactForm((prev) => ({
        ...prev,
        whatsappMensaje: template.cuerpo_texto ?? prev.whatsappMensaje,
      }))
    } else if (canal === "llamada") {
      setContactForm((prev) => ({
        ...prev,
        llamadaNotas: template.cuerpo_texto ?? prev.llamadaNotas,
      }))
    }
  }

  const selectedIds = useMemo(() => Array.from(selected.values()), [selected])
  const selectedCount = selectedIds.length
  const canUseQuickPlan = selectedCount > 0
  const selectionChips = useMemo(() => {
    const chips: string[] = []
    if (filters.fuente) {
      chips.push(`Fuente: ${FUENTE_LABELS[filters.fuente] ?? filters.fuente}`)
    }
    if (filters.segmento.trim()) {
      chips.push(`Segmento: ${filters.segmento.trim()}`)
    }
    if (filters.lookupStatus) {
      chips.push(`Verificación: ${LOOKUP_STATUS_LABELS[filters.lookupStatus] ?? filters.lookupStatus}`)
    }
    if (filters.carrierType) {
      const label = carrierLabel(filters.carrierType)
      chips.push(`Línea: ${label || filters.carrierType}`)
    }
    return chips
  }, [filters])
  const currentIds = useMemo(() => items.map((item) => item.id).filter(Boolean) as string[], [items])
  const allSelected = currentIds.length > 0 && currentIds.every((id) => selected.has(id))
  const showingFrom = items.length ? offset + 1 : 0
  const showingTo = items.length ? offset + items.length : 0
  const pageCount = limit ? Math.ceil(total / limit) : 1
  const currentPage = limit ? Math.floor(offset / limit) + 1 : 1

  const handleToggleRow = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) {
        next.add(id)
      } else {
        next.delete(id)
      }
      return next
    })
  }

  const handleToggleAll = (checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) {
        currentIds.forEach((id) => {
          if (id) next.add(id)
        })
      } else {
        currentIds.forEach((id) => {
          if (id) next.delete(id)
        })
      }
      return next
    })
  }
  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFilters((prev) => ({ ...prev, search: searchInput.trim() }))
  }

  const handleClearFilters = () => {
    setFilters(initialFilters)
    setSearchInput(initialFilters.search)
  }

  const handleLimitChange = (value: string) => {
    const parsed = Number(value) || PAGE_SIZE_OPTIONS[0]
    setLimit(parsed)
  }

  const handleVerify = useCallback(async () => {
    if (!selectedIds.length) return
    setAction("lookup")
    setBanner(null)
    try {
      const response = await verificarProspectos({
        prospecto_ids: selectedIds,
      })
      setBanner({
        type: "success",
        message: `Se actualizaron ${response.procesados} prospectos.`,
      })
      await fetchProspectos(offset)
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo verificar los teléfonos."
      setBanner({ type: "error", message })
    } finally {
      setAction(null)
    }
  }, [fetchProspectos, offset, selectedIds])

  const handleContactSubmit = useCallback(async () => {
    if (!selectedIds.length) {
      setContactError("Selecciona al menos un prospecto.")
      return
    }
    const payload: {
      prospecto_ids: string[]
      correo_asunto?: string
      correo_cuerpo?: string
      whatsapp_mensaje?: string
      llamada_notas?: string
    } = { prospecto_ids: selectedIds }

    if (contactForm.correoAsunto.trim() && contactForm.correoCuerpo.trim()) {
      payload.correo_asunto = contactForm.correoAsunto.trim()
      payload.correo_cuerpo = contactForm.correoCuerpo.trim()
    }
    if (contactForm.whatsappMensaje.trim()) {
      payload.whatsapp_mensaje = contactForm.whatsappMensaje.trim()
    }
    if (contactForm.llamadaNotas.trim()) {
      payload.llamada_notas = contactForm.llamadaNotas.trim()
    }

    if (Object.keys(payload).length === 1) {
      setContactError("Define al menos un canal (correo, WhatsApp o llamada).")
      return
    }

    setAction("contact")
    setContactError(null)
    try {
      const response = await contactarProspectos(payload)
      const nameMap = new Map(items.map((item) => [item.id, item.display_name]))
      const enrichedResults = (response.contactos ?? []).map((resumen) => ({
        ...resumen,
        display_name: nameMap.get(resumen.prospecto_id) ?? resumen.display_name ?? null,
      }))
      if (enrichedResults.length) {
        openContactDrawer({
          batchId: response.batch_id ?? null,
          results: enrichedResults,
          omitidos: response.omitidos,
        })
      }
      const totalAcciones = enrichedResults.length || payload.prospecto_ids?.length || 0
      const omitidosTotal =
        response.omitidos?.reduce((acc, item) => acc + (item.total ?? item.prospecto_ids.length ?? 0), 0) ?? 0
      const omitidosMensaje =
        omitidosTotal > 0 ? ` (${omitidosTotal} prospectos convertidos se omitieron automáticamente).` : ""
      setBanner({
        type: "success",
        message: response.batch_id
          ? `Se creó el lote ${response.batch_id} con ${totalAcciones} acciones.${omitidosMensaje}`
          : `Se registraron ${totalAcciones} acciones de contacto.${omitidosMensaje}`,
      })
      setContactDialogOpen(false)
      await fetchProspectos(offset)
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo programar el contacto."
      setContactError(message)
    } finally {
      setAction(null)
    }
  }, [contactForm, fetchProspectos, items, offset, openContactDrawer, selectedIds])

  const handlePlannerOpen = useCallback(() => {
    setPlannerMode(selectedCount ? "quick" : "campaign")
    setPlannerName("")
    setPlannerError(null)
    setPlannerOpen(true)
  }, [selectedCount])

  const handlePlannerOpenChange = useCallback(
    (open: boolean) => {
      setPlannerOpen(open)
      if (!open) {
        setPlannerError(null)
        setPlannerName("")
        setPlannerMode(selectedCount ? "quick" : "campaign")
      }
    },
    [selectedCount]
  )

  const handlePlannerModeSelect = useCallback(
    (mode: PlannerMode) => {
      if (mode === "quick" && !canUseQuickPlan) {
        setPlannerError("Selecciona al menos un prospecto para usar esta opción.")
        return
      }
      setPlannerMode(mode)
      setPlannerError(null)
    },
    [canUseQuickPlan]
  )

  const handlePlannerContinue = useCallback(() => {
    setPlannerError(null)
    if (plannerMode === "quick") {
      if (!canUseQuickPlan) {
        setPlannerError("Selecciona al menos un prospecto para programar el contacto.")
        return
      }
      handlePlannerOpenChange(false)
      setContactDialogOpen(true)
      return
    }
    const trimmedName = plannerName.trim()
    if (!trimmedName) {
      setPlannerError("Asigna un nombre interno a la campaña.")
      return
    }
    setCampaignWizardPreset({
      titulo: trimmedName,
      source: canUseQuickPlan ? "selected" : "filters",
    })
    handlePlannerOpenChange(false)
    setCampaignWizardOpen(true)
  }, [canUseQuickPlan, handlePlannerOpenChange, plannerMode, plannerName])

  const handleOpenConvertDialog = useCallback((prospecto: ProspectoItem) => {
    if (!prospecto.id) return
    const metadataRecord = isRecord(prospecto.metadata) ? prospecto.metadata : {}
    const rawStage = typeof metadataRecord["stage"] === "string" ? metadataRecord["stage"] : null
    const stageValue =
      rawStage && stageOptions.some((option) => option.value === rawStage)
        ? (rawStage as ProspeccionStage)
        : "evaluate"
    setConvertProspect(prospecto)
    let canal: ProspeccionCanal = "otro"
    if (prospecto.email) {
      canal = "correo"
    } else if (prospecto.whatsapp_permitido) {
      canal = "whatsapp"
    } else if (prospecto.phone || prospecto.phone_e164) {
      canal = "llamada"
    }
    setConvertForm({
      nombre: prospecto.display_name ?? "",
      correo: prospecto.email ?? "",
      telefono: prospecto.phone_e164 ?? prospecto.phone ?? "",
      company: prospecto.segmento ?? "",
      notas: "",
      stage: stageValue,
      canal,
    })
    setConvertError(null)
    setConvertDialogOpen(true)
  }, [])

  const handlePromoteFromDrawer = useCallback(
    (result: ProspeccionContactResult) => {
      const existing = items.find((item) => item.id === result.prospecto_id)
      if (existing) {
        handleOpenConvertDialog(existing)
        return
      }
      const pseudo: ProspectoItem = {
        id: result.prospecto_id,
        display_name: result.display_name ?? result.prospecto_id,
        actividad: null,
        phone: result.telefono ?? null,
        phone_e164: result.telefono ?? null,
        email: result.email ?? null,
        website: null,
        address: null,
        fuente: "usuario",
        fuente_busqueda: null,
        segmento: result.segmento ?? null,
        lookup_status: null,
        whatsapp_permitido: null,
        llamada_permitida: null,
        carrier_type: null,
        rating: null,
        distancia_m: null,
        metadata: result.stage ? { stage: result.stage } : {},
      }
      handleOpenConvertDialog(pseudo)
    },
    [handleOpenConvertDialog, items]
  )

  const handleConvertSubmit = useCallback(async () => {
    if (!convertProspect?.id) return
    const payload: ConvertirProspectoPayload = {}
    const assign = (value: string, key: string) => {
      const trimmed = value.trim()
      if (trimmed) {
        ;(payload as Record<string, string>)[key] = trimmed
      }
    }
    assign(convertForm.nombre, "nombre")
    assign(convertForm.correo, "correo")
    assign(convertForm.telefono, "telefono")
    assign(convertForm.company, "company_name")
    assign(convertForm.notas, "notas")
    if (convertForm.stage) {
      payload.stage = convertForm.stage
    }
    if (convertForm.canal) {
      payload.canal_origen = convertForm.canal
    }

    setConvertSubmitting(true)
    setConvertError(null)
    try {
      await convertirProspectoAContacto(convertProspect.id, payload)
      setBanner({
        type: "success",
        message: `${convertForm.nombre || convertProspect.display_name || "El prospecto"} fue convertido a contacto.`,
      })
      setConvertDialogOpen(false)
      await fetchProspectos(offset)
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo convertir el prospecto."
      setConvertError(message)
    } finally {
      setConvertSubmitting(false)
    }
  }, [convertForm, convertProspect, fetchProspectos, offset])

  const handleWizardCompleted = useCallback(
    (result: { batchId?: string | null; contactos?: ProspeccionContactResult[]; omitidos?: ProspeccionOmitido[] }) => {
      if (result.contactos?.length) {
        openContactDrawer({
          batchId: result.batchId ?? null,
          results: result.contactos,
          omitidos: result.omitidos,
        })
      }
      const omitidosTotal =
        result.omitidos?.reduce((acc, item) => acc + (item.total ?? item.prospecto_ids.length ?? 0), 0) ?? 0
      const omitidosMensaje =
        omitidosTotal > 0 ? ` (${omitidosTotal} prospectos convertidos se omitieron automáticamente).` : ""
      const totalAcciones = result.contactos?.length ?? 0
      setBanner({
        type: "success",
        message: result.batchId
          ? `Campaña programada. Lote ${result.batchId} con ${totalAcciones} acciones.${omitidosMensaje}`
          : `Se programó la campaña correctamente.${omitidosMensaje}`,
      })
      void fetchProspectos(offset)
    },
    [fetchProspectos, offset, openContactDrawer]
  )

  const handleOpenCreateDialog = () => {
    setFormMode("create")
    setFormValues(initialProspectoForm)
    setMetadataBase({})
    setFormDialogOpen(true)
  }

  const handleOpenEditDialog = (prospecto: ProspectoItem) => {
    if (!prospecto.id) return
    const metadataRecord = isRecord(prospecto.metadata) ? { ...prospecto.metadata } : {}
    setFormMode("edit")
    setEditingId(prospecto.id)
    setMetadataBase(metadataRecord)
    const notaValue = metadataRecord["notas"]
    setFormValues({
      displayName: prospecto.display_name ?? "",
      actividad: prospecto.actividad ?? "",
      phone: prospecto.phone ?? prospecto.phone_e164 ?? "",
      email: prospecto.email ?? "",
      website: prospecto.website ?? "",
      address: prospecto.address ?? "",
      segmento: prospecto.segmento ?? "",
      notas: typeof notaValue === "string" ? notaValue : "",
    })
    setFormDialogOpen(true)
  }

  const handleOpenDeleteDialog = (prospecto: ProspectoItem) => {
    if (!prospecto.id) return
    setDeleteTarget(prospecto)
    setDeleteDialogOpen(true)
  }

  const handleOpenHistoryDialog = async (prospecto: ProspectoItem) => {
    if (!prospecto.id) return
    setHistoryProspect(prospecto)
    setHistoryDialogOpen(true)
    setHistoryTab("contact")
    setHistoryLoading(true)
    setHistoryError(null)
    setAuditLoading(true)
    setAuditError(null)
    const [contactResult, auditResult] = await Promise.allSettled([
      listContactoEnviosPorProspecto(prospecto.id, { limit: 50 }),
      listProspectoAudit(prospecto.id, { limit: 100 }),
    ])
    if (contactResult.status === "fulfilled") {
      setHistoryEntries(contactResult.value.items ?? [])
    } else {
      const reason = contactResult.reason
      const message = reason instanceof Error ? reason.message : "No se pudo cargar el historial."
      setHistoryError(message)
      setHistoryEntries([])
    }
    if (auditResult.status === "fulfilled") {
      setAuditEntries(auditResult.value.items ?? [])
    } else {
      const reason = auditResult.reason
      const message = reason instanceof Error ? reason.message : "No se pudo obtener la bitácora."
      setAuditError(message)
      setAuditEntries([])
    }
    setHistoryLoading(false)
    setAuditLoading(false)
  }

  const handleFormSubmit = useCallback(async () => {
    const trimmedName = formValues.displayName.trim()
    if (!trimmedName) {
      setFormError("El nombre es obligatorio.")
      return
    }
    const payload: Record<string, unknown> = {
      display_name: trimmedName,
    }
    const assignField = (value: string, key: string) => {
      const trimmed = value.trim()
      if (trimmed) {
        payload[key] = trimmed
      } else if (formMode === "edit") {
        payload[key] = null
      }
    }
    assignField(formValues.actividad, "actividad")
    assignField(formValues.phone, "phone")
    assignField(formValues.email, "email")
    assignField(formValues.website, "website")
    assignField(formValues.address, "address")
    assignField(formValues.segmento, "segmento")

    const notasValue = formValues.notas.trim()
    if (formMode === "create") {
      if (notasValue) {
        payload.metadata = { notas: notasValue }
      }
    } else {
      const baseMetadata: Record<string, unknown> = { ...metadataBase }
      const previousValue = baseMetadata["notas"]
      const previousNotas = typeof previousValue === "string" ? previousValue : ""
      if (notasValue !== previousNotas) {
        if (notasValue) {
          baseMetadata["notas"] = notasValue
        } else if ("notas" in baseMetadata) {
          delete baseMetadata["notas"]
        }
        payload.metadata = baseMetadata
      }
    }

    setFormSubmitting(true)
    setFormError(null)
    try {
      if (formMode === "create") {
        await crearProspectoManual(payload as ProspectoManualInput)
        setBanner({
          type: "success",
          message: "Se creó el prospecto manual.",
        })
        await fetchProspectos(0)
      } else {
        if (!editingId) {
          throw new Error("prospecto_missing_id")
        }
        await actualizarProspecto(editingId, payload)
        setBanner({
          type: "success",
          message: "Se actualizó el prospecto.",
        })
        await fetchProspectos(offset)
      }
      setFormDialogOpen(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo guardar el prospecto."
      setFormError(message)
    } finally {
      setFormSubmitting(false)
    }
  }, [fetchProspectos, formMode, formValues, metadataBase, editingId, offset])

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget?.id) return
    setDeleteLoading(true)
    setDeleteError(null)
    try {
      await eliminarProspecto(deleteTarget.id)
      setBanner({
        type: "success",
        message: `${deleteTarget.display_name ?? "El prospecto"} fue eliminado.`,
      })
      const shouldGoBack = offset >= limit && items.length <= 1
      const nextOffset = shouldGoBack ? Math.max(0, offset - limit) : offset
      await fetchProspectos(nextOffset)
      setDeleteDialogOpen(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo eliminar el prospecto."
      setDeleteError(message)
    } finally {
      setDeleteLoading(false)
    }
  }, [deleteTarget, fetchProspectos, items.length, limit, offset])

  return (
    <div className="space-y-4">
      {banner ? (
        <div
          className={cn(
            "flex items-start gap-3 rounded-lg border px-4 py-3 text-sm",
            banner.type === "success"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "border-destructive/40 bg-destructive/10 text-destructive"
          )}
        >
          {banner.type === "success" ? (
            <IconCircleCheck className="mt-0.5 size-4 shrink-0" />
          ) : (
            <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
          )}
          <div className="flex-1">{banner.message}</div>
          <Button variant="ghost" size="sm" onClick={() => setBanner(null)}>
            Ocultar
          </Button>
        </div>
      ) : null}

      <EnrichmentChecklist
        data={checklist}
        loading={checklistLoading}
        actionInProgress={checklistAction}
        onRefresh={refreshChecklist}
        onVerifyPhones={handleChecklistLookup}
        onOpenScraper={handleChecklistScraper}
        onOpenManual={handleChecklistManual}
      />

      <section className="rounded-lg border bg-card p-4 shadow-sm sm:p-6">
        <form onSubmit={handleSearchSubmit} className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex flex-1 items-center gap-2">
              <Input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Buscar por nombre, actividad, teléfono o email"
              />
              <Button type="submit" variant="secondary" size="sm">
                <IconSearch className="mr-2 size-4" />
                Buscar
              </Button>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={handleClearFilters}>
              Limpiar filtros
            </Button>
          </div>
          <div className="flex flex-wrap gap-4">
            <div className="space-y-1">
              <Label>Fuente</Label>
              <Select
                value={filters.fuente || "all"}
                onValueChange={(value) =>
                  setFilters((prev) => ({
                    ...prev,
                    fuente: value === "all" ? "" : (value as FuenteFilter),
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todas las fuentes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="google_places">Google Places</SelectItem>
                  <SelectItem value="denue">DENUE</SelectItem>
                  <SelectItem value="usuario">Usuario</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Estado de verificación</Label>
              <Select
                value={filters.lookupStatus || "all"}
                onValueChange={(value) =>
                  setFilters((prev) => ({
                    ...prev,
                    lookupStatus: value === "all" ? "" : (value as LookupFilter),
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos los estados" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="pendiente">Pendiente</SelectItem>
                  <SelectItem value="verificado">Verificado</SelectItem>
                  <SelectItem value="sin_numero">Sin número</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Tipo de línea</Label>
              <Select
                value={filters.carrierType || "all"}
                onValueChange={(value) =>
                  setFilters((prev) => ({
                    ...prev,
                    carrierType: value === "all" ? "" : (value as "mobile" | "landline" | "voip"),
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="mobile">Móvil</SelectItem>
                  <SelectItem value="landline">Línea fija</SelectItem>
                  <SelectItem value="voip">VoIP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Segmento</Label>
              <Input
                value={filters.segmento}
                onChange={(event) => setFilters((prev) => ({ ...prev, segmento: event.target.value }))}
                className="w-[180px]"
                placeholder="Ej. Hoteles CDMX"
              />
            </div>
            <div className="space-y-1">
              <Label>Ordenar por</Label>
              <Select
                value={filters.order}
                onValueChange={(value) =>
                  setFilters((prev) => ({
                    ...prev,
                    order: (value as OrderOption) || "creado",
                  }))
                }
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Orden" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="creado">Más recientes</SelectItem>
                  <SelectItem value="nombre">Nombre (A-Z)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </form>
      </section>

      <Drawer open={plannerOpen} onOpenChange={handlePlannerOpenChange} direction="right">
        <DrawerContent className="flex flex-col data-[vaul-drawer-direction=right]:h-screen data-[vaul-drawer-direction=right]:max-h-screen data-[vaul-drawer-direction=right]:max-w-3xl data-[vaul-drawer-direction=right]:overflow-hidden">
          <DrawerHeader className="items-start space-y-2">
            <DrawerTitle>Elige cómo lanzar tu contacto</DrawerTitle>
            <DrawerDescription>
              Define si quieres un envío rápido con la selección actual o abrir el wizard completo para convertirlo en
              campaña.
            </DrawerDescription>
          </DrawerHeader>
          <div className="flex-1 overflow-y-auto px-6 pb-8">
            <div className="rounded-2xl border bg-muted/30 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <IconUsersGroup className="size-5" />
                </span>
                <div>
                  <p className="text-sm font-medium">Audiencia base</p>
                  <p className="text-xs text-muted-foreground">
                    {selectedCount
                      ? `${selectedCount} prospecto${selectedCount === 1 ? "" : "s"} seleccionados`
                      : "Aún no seleccionas prospectos; puedes usar listas o filtros en el wizard."}
                  </p>
                </div>
              </div>
              {selectionChips.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectionChips.map((chip) => (
                    <Badge key={chip} variant="outline" className="text-xs">
                      {chip}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Card
                role="button"
                tabIndex={canUseQuickPlan ? 0 : -1}
                aria-pressed={plannerMode === "quick"}
                aria-disabled={!canUseQuickPlan}
                onClick={() => handlePlannerModeSelect("quick")}
                className={cn(
                  "cursor-pointer border-2 transition hover:border-primary/40",
                  plannerMode === "quick" ? "border-primary bg-primary/5 shadow-sm" : "border-border",
                  !canUseQuickPlan && "cursor-not-allowed opacity-60"
                )}
              >
                <CardContent className="space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="rounded-full bg-primary/10 p-2 text-primary">
                      <IconBolt className="size-5" />
                    </span>
                    <div>
                      <p className="font-semibold">Programar ahora</p>
                      <p className="text-sm text-muted-foreground">
                        Abre el editor rápido y define los mensajes por canal para la selección actual.
                      </p>
                    </div>
                  </div>
                  <div className="rounded-lg border border-dashed bg-background/80 p-3 text-sm">
                    <p className="font-medium">Incluye</p>
                    <ul className="mt-1 list-disc space-y-1 pl-4 text-muted-foreground">
                      <li>Asunto y cuerpo de correo</li>
                      <li>Mensaje WhatsApp / guion de llamada</li>
                      <li>Programación puntual por canal</li>
                    </ul>
                  </div>
                  {canUseQuickPlan ? (
                    <p className="text-xs text-muted-foreground">Ideal para recordatorios o outreach inmediato.</p>
                  ) : (
                    <p className="text-xs text-destructive">Selecciona al menos un prospecto para usar esta opción.</p>
                  )}
                </CardContent>
              </Card>
              <Card
                role="button"
                aria-pressed={plannerMode === "campaign"}
                onClick={() => handlePlannerModeSelect("campaign")}
                className={cn(
                  "cursor-pointer border-2 transition hover:border-primary/40",
                  plannerMode === "campaign" ? "border-primary bg-primary/5 shadow-sm" : "border-border"
                )}
              >
                <CardContent className="space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="rounded-full bg-primary/10 p-2 text-primary">
                      <IconNotebook className="size-5" />
                    </span>
                    <div>
                      <p className="font-semibold">Campaña con nombre</p>
                      <p className="text-sm text-muted-foreground">
                        Abre el wizard para reutilizar listas inteligentes, definir canales y registrar un título claro.
                      </p>
                    </div>
                  </div>
                  <div
                    className="space-y-2 rounded-lg border border-dashed bg-background/80 p-3"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <Label className="text-xs font-medium">Nombre interno</Label>
                    <Input
                      value={plannerName}
                      onChange={(event) => setPlannerName(event.target.value)}
                      onFocus={() => handlePlannerModeSelect("campaign")}
                      placeholder="Ej. Seguimiento hoteles Q4"
                    />
                    <p className="text-xs text-muted-foreground">
                      Podrás ajustar filtros, listas y canales antes de confirmar.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
            <div className="mt-6 rounded-2xl border bg-muted/20 p-4 text-sm">
              <p className="font-semibold">¿Qué sucederá después?</p>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-muted-foreground">
                <li>Verás el detalle de cada canal antes de lanzar.</li>
                <li>Se creará un lote con seguimiento en Campañas y Contactos.</li>
              </ul>
            </div>
            {plannerError ? <p className="mt-4 text-sm text-destructive">{plannerError}</p> : null}
          </div>
          <DrawerFooter className="flex flex-wrap items-center justify-between gap-3 border-t border-border/40 bg-background/80">
            <Button variant="outline" onClick={() => handlePlannerOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handlePlannerContinue} disabled={plannerMode === "quick" && !canUseQuickPlan}>
              {plannerMode === "quick" ? (
                <>
                  <IconSend2 className="mr-2 size-4" />
                  Configurar envío rápido
                </>
              ) : (
                <>
                  <IconTargetArrow className="mr-2 size-4" />
                  Abrir wizard de campaña
                </>
              )}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
      <section className="overflow-hidden rounded-lg border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-6">
          <div>
            <p className="text-sm font-medium">Prospectos guardados</p>
            <p className="text-xs text-muted-foreground">
              {showingFrom}-{Math.max(showingFrom, showingTo)} de {total} registros · Página {currentPage} de{" "}
              {Math.max(pageCount, 1)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={handleOpenCreateDialog}>
              <IconPlus className="mr-1.5 size-4" />
              Agregar prospecto
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void fetchProspectos(offset)} disabled={loading}>
              <IconRefresh className={cn("mr-1.5 size-4", loading && "animate-spin")} />
              Actualizar
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleVerify()}
              disabled={!selectedCount || action === "lookup"}
            >
              <IconPhoneCheck className={cn("mr-1.5 size-4", action === "lookup" && "animate-spin")} />
              Verificar teléfonos
            </Button>
            <Button size="sm" onClick={handlePlannerOpen}>
              <IconSparkles className="mr-1.5 size-4" />
              Preparar envíos
              {selectedCount ? (
                <span className="ml-2 inline-flex min-w-[1.75rem] items-center justify-center rounded-full bg-primary/15 px-2 text-[11px] font-semibold text-primary">
                  {selectedCount}
                </span>
              ) : null}
            </Button>
          </div>
        </div>

        {error ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive sm:px-6">
            <IconAlertTriangle className="size-4" />
            <span className="flex-1">{error}</span>
            <Button variant="outline" size="sm" onClick={() => void fetchProspectos(offset)} disabled={loading}>
              Reintentar
            </Button>
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    aria-label="Seleccionar todos los prospectos"
                    checked={allSelected ? true : selected.size ? "indeterminate" : false}
                    onCheckedChange={(value) => handleToggleAll(value === true)}
                    disabled={!items.length}
                  />
                </TableHead>
                <TableHead>Prospecto</TableHead>
                <TableHead>Contacto</TableHead>
                <TableHead>Verificación</TableHead>
                <TableHead>Fuente y contexto</TableHead>
                <TableHead className="text-right">Creado</TableHead>
                <TableHead className="w-14 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                    <IconLoader className="mr-2 inline size-4 animate-spin" />
                    Cargando prospectos...
                  </TableCell>
                </TableRow>
              ) : null}
              {!loading && !items.length ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                    No hay prospectos con los filtros actuales.
                  </TableCell>
                </TableRow>
              ) : null}
              {!loading
                ? items.map((prospecto) => {
                    const notas = extractProspectoNotes(prospecto.metadata)
                    return (
                      <TableRow key={prospecto.id}>
                        <TableCell>
                        <Checkbox
                          aria-label={`Seleccionar ${prospecto.display_name ?? "prospecto"}`}
                          checked={prospecto.id ? selected.has(prospecto.id) : false}
                          onCheckedChange={(value) => {
                            if (!prospecto.id) return
                            handleToggleRow(prospecto.id, value === true)
                          }}
                          disabled={!prospecto.id}
                        />
                        </TableCell>
                        <TableCell>
                        <div className="font-medium">{prospecto.display_name || "Sin nombre"}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          {prospecto.actividad ? <span>{prospecto.actividad}</span> : null}
                          {prospecto.segmento ? (
                            <Badge variant="outline" className="text-[11px]">
                              {prospecto.segmento}
                            </Badge>
                          ) : null}
                        </div>
                        {prospecto.address ? (
                          <p className="mt-1 text-xs text-muted-foreground">{prospecto.address}</p>
                        ) : null}
                        {notas ? (
                          <p className="mt-1 text-xs text-muted-foreground">Notas: {notas}</p>
                        ) : null}
                        </TableCell>
                        <TableCell>
                        <div className="text-sm">{prospecto.phone_e164 || prospecto.phone || "—"}</div>
                        {prospecto.email ? (
                          <div className="text-xs text-muted-foreground">{prospecto.email}</div>
                        ) : null}
                        <ProspectChannelBadges prospecto={prospecto} />
                        </TableCell>
                        <TableCell>
                        <LookupStatusBadge status={prospecto.lookup_status} />
                        {prospecto.carrier_type ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Línea: {carrierLabel(prospecto.carrier_type)}
                          </p>
                        ) : null}
                        </TableCell>
                        <TableCell>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{FUENTE_LABELS[prospecto.fuente] ?? prospecto.fuente}</Badge>
                          {prospecto.fuente_busqueda ? (
                            <Badge variant="secondary">
                              {FUENTE_BUSQUEDA_LABELS[prospecto.fuente_busqueda] ?? prospecto.fuente_busqueda}
                            </Badge>
                          ) : null}
                          {typeof prospecto.rating === "number" ? (
                            <Badge variant="secondary">⭐ {prospecto.rating.toFixed(1)}</Badge>
                          ) : null}
                          {typeof prospecto.distancia_m === "number" ? (
                            <span className="text-xs text-muted-foreground">
                              {formatDistance(prospecto.distancia_m)}
                            </span>
                          ) : null}
                        </div>
                        {prospecto.website ? (
                          <p className="mt-1 text-xs text-muted-foreground">{prospecto.website}</p>
                        ) : null}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                        {formatDate(prospecto.creado_en)}
                        </TableCell>
                        <TableCell className="text-right">
                        {prospecto.id ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="size-8" aria-label="Acciones del prospecto">
                                <IconDotsVertical className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40">
                              <DropdownMenuItem onClick={() => handleOpenEditDialog(prospecto)}>
                                <IconPencil className="size-4" />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => void handleOpenHistoryDialog(prospecto)}>
                                <IconHistory className="size-4" />
                                Historial de contacto
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleOpenConvertDialog(prospecto)}>
                                <IconTargetArrow className="size-4" />
                                Convertir a CRM
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() => handleOpenDeleteDialog(prospecto)}
                              >
                                <IconTrash className="size-4" />
                                Eliminar
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                        </TableCell>
                      </TableRow>
                    )
                  })
                : null}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm text-muted-foreground sm:px-6">
          <div>
            {selectedCount ? (
              <span className="font-medium text-foreground">{selectedCount} seleccionados.</span>
            ) : (
              <span>Sin prospectos seleccionados.</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs">Filas:</span>
              <Select value={String(limit)} onValueChange={handleLimitChange}>
                <SelectTrigger className="h-8 w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((value) => (
                    <SelectItem key={value} value={String(value)}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void fetchProspectos(Math.max(0, offset - limit))}
                disabled={loading || offset === 0}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void fetchProspectos(offset + limit)}
                disabled={loading || offset + limit >= total}
              >
                Siguiente
              </Button>
            </div>
          </div>
        </div>
      </section>

      <Dialog open={contactDialogOpen} onOpenChange={setContactDialogOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Programar contacto</DialogTitle>
            <DialogDescription>
              Define cada canal usando plantillas predefinidas o personaliza el contenido. Sólo se enviarán aquellos
              canales con texto configurado.
            </DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="correo" className="space-y-4">
            <TabsList>
              <TabsTrigger value="correo">Correo</TabsTrigger>
              <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
              <TabsTrigger value="llamada">Llamada</TabsTrigger>
            </TabsList>
            <TabsContent value="correo" className="space-y-3">
              <div className="space-y-1">
                <Label>Plantilla de correo</Label>
                <Select
                  value={selectedTemplates.correo ?? ""}
                  onValueChange={(value) => handleTemplateSelect("correo", value)}
                  disabled={templatesLoading || !templates.length}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={templatesLoading ? "Cargando..." : "Selecciona una plantilla"} />
                  </SelectTrigger>
                  <SelectContent>
                    {templates
                      .filter((template) => template.canal === "correo")
                      .map((template) => (
                        <SelectItem key={template.slug} value={template.slug}>
                          {template.nombre}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {!templatesLoading && !templates.some((tpl) => tpl.canal === "correo") ? (
                  <p className="text-xs text-muted-foreground">Aún no has creado plantillas de correo.</p>
                ) : null}
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>Asunto</Label>
                  <Input
                    value={contactForm.correoAsunto}
                    onChange={(event) => setContactForm((prev) => ({ ...prev, correoAsunto: event.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Previsualización</Label>
                  <Input value={selectedTemplates.correo ?? ""} disabled placeholder="Template seleccionado" />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Cuerpo</Label>
                <Textarea
                  value={contactForm.correoCuerpo}
                  onChange={(event) => setContactForm((prev) => ({ ...prev, correoCuerpo: event.target.value }))}
                  rows={5}
                  placeholder="Hola {{nombre}}, vimos que..."
                />
              </div>
            </TabsContent>
            <TabsContent value="whatsapp" className="space-y-3">
              <div className="space-y-1">
                <Label>Plantilla de WhatsApp</Label>
                <Select
                  value={selectedTemplates.whatsapp ?? ""}
                  onValueChange={(value) => handleTemplateSelect("whatsapp", value)}
                  disabled={templatesLoading || !templates.length}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={templatesLoading ? "Cargando..." : "Selecciona una plantilla"} />
                  </SelectTrigger>
                  <SelectContent>
                    {templates
                      .filter((template) => template.canal === "whatsapp")
                      .map((template) => (
                        <SelectItem key={template.slug} value={template.slug}>
                          {template.nombre}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {!templatesLoading && !templates.some((tpl) => tpl.canal === "whatsapp") ? (
                  <p className="text-xs text-muted-foreground">Aún no has creado plantillas de WhatsApp.</p>
                ) : null}
              </div>
              <div className="space-y-1">
                <Label>Mensaje</Label>
                <Textarea
                  value={contactForm.whatsappMensaje}
                  onChange={(event) => setContactForm((prev) => ({ ...prev, whatsappMensaje: event.target.value }))}
                  rows={4}
                  placeholder="Hola, soy del equipo Tal-IA..."
                />
              </div>
            </TabsContent>
            <TabsContent value="llamada" className="space-y-3">
              <div className="space-y-1">
                <Label>Plantilla de llamada</Label>
                <Select
                  value={selectedTemplates.llamada ?? ""}
                  onValueChange={(value) => handleTemplateSelect("llamada", value)}
                  disabled={templatesLoading || !templates.length}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={templatesLoading ? "Cargando..." : "Selecciona una plantilla"} />
                  </SelectTrigger>
                  <SelectContent>
                    {templates
                      .filter((template) => template.canal === "llamada")
                      .map((template) => (
                        <SelectItem key={template.slug} value={template.slug}>
                          {template.nombre}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {!templatesLoading && !templates.some((tpl) => tpl.canal === "llamada") ? (
                  <p className="text-xs text-muted-foreground">Aún no has creado plantillas de llamada.</p>
                ) : null}
              </div>
              <div className="space-y-1">
                <Label>Notas o guion</Label>
                <Textarea
                  value={contactForm.llamadaNotas}
                  onChange={(event) => setContactForm((prev) => ({ ...prev, llamadaNotas: event.target.value }))}
                  rows={3}
                  placeholder="Recordatorios o bullets para el equipo de llamadas."
                />
              </div>
            </TabsContent>
          </Tabs>
          {contactError ? (
            <p className="text-sm text-destructive">{contactError}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {selectedCount ? `${selectedCount} prospectos serán procesados al guardar.` : "Selecciona prospectos antes de programar contacto."}
            </p>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setContactDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void handleContactSubmit()} disabled={action === "contact"}>
              {action === "contact" ? (
                <>
                  <IconLoader className="mr-2 size-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <IconSend2 className="mr-2 size-4" />
                  Guardar acciones
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={convertDialogOpen} onOpenChange={setConvertDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Convertir a contacto del CRM</DialogTitle>
            <DialogDescription>
              Crea un contacto oficial y marca el prospecto como convertido para evitar duplicar seguimientos.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label>Nombre</Label>
              <Input
                value={convertForm.nombre}
                onChange={(event) => setConvertForm((prev) => ({ ...prev, nombre: event.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Correo</Label>
              <Input
                type="email"
                value={convertForm.correo}
                onChange={(event) => setConvertForm((prev) => ({ ...prev, correo: event.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Teléfono</Label>
              <Input
                value={convertForm.telefono}
                onChange={(event) => setConvertForm((prev) => ({ ...prev, telefono: event.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Empresa / Segmento</Label>
              <Input
                value={convertForm.company}
                onChange={(event) => setConvertForm((prev) => ({ ...prev, company: event.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Stage en prospección</Label>
              <Select
                value={convertForm.stage}
                onValueChange={(value) => setConvertForm((prev) => ({ ...prev, stage: value as ProspeccionStage }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona stage" />
                </SelectTrigger>
                <SelectContent>
                  {stageOptions.map((stage) => (
                    <SelectItem key={stage.value} value={stage.value}>
                      {stage.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Canal de origen</Label>
              <Select
                value={convertForm.canal}
                onValueChange={(value) => setConvertForm((prev) => ({ ...prev, canal: value as ProspeccionCanal }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Canal" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(CANAL_LABELS) as Array<[ProspeccionCanal, string]>).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Notas internas</Label>
              <Textarea
                rows={3}
                value={convertForm.notas}
                onChange={(event) => setConvertForm((prev) => ({ ...prev, notas: event.target.value }))}
              />
            </div>
          </div>
          {convertError ? (
            <p className="text-sm text-destructive">{convertError}</p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConvertDialogOpen(false)} disabled={convertSubmitting}>
              Cancelar
            </Button>
            <Button onClick={() => void handleConvertSubmit()} disabled={convertSubmitting}>
              {convertSubmitting ? "Convirtiendo..." : "Convertir a contacto"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProspeccionCampaignWizard
        open={campaignWizardOpen}
        onClose={() => setCampaignWizardOpen(false)}
        selectedIds={selectedIds}
        defaultFilters={{
          fuente: filters.fuente || undefined,
          segmento: filters.segmento || undefined,
        }}
        preset={campaignWizardPreset}
        onCompleted={handleWizardCompleted}
      />

      <Dialog open={formDialogOpen} onOpenChange={setFormDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {formMode === "create" ? "Agregar prospecto manual" : "Editar prospecto"}
            </DialogTitle>
            <DialogDescription>
              Completa los campos básicos del prospecto. Todos los registros creados aquí se marcan con la fuente Usuario
              y quedarán listos para verificación o contacto.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Nombre</Label>
              <Input
                value={formValues.displayName}
                onChange={(event) => setFormValues((prev) => ({ ...prev, displayName: event.target.value }))}
                placeholder="Ej. Hotel Centro Histórico"
                required
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Actividad</Label>
                <Input
                  value={formValues.actividad}
                  onChange={(event) => setFormValues((prev) => ({ ...prev, actividad: event.target.value }))}
                  placeholder="Restaurante, Hotel, etc."
                />
              </div>
              <div className="space-y-1">
                <Label>Segmento</Label>
                <Input
                  value={formValues.segmento}
                  onChange={(event) => setFormValues((prev) => ({ ...prev, segmento: event.target.value }))}
                  placeholder="Ej. Hoteles CDMX"
                />
              </div>
              <div className="space-y-1">
                <Label>Teléfono</Label>
                <Input
                  value={formValues.phone}
                  onChange={(event) => setFormValues((prev) => ({ ...prev, phone: event.target.value }))}
                  placeholder="55 1234 5678"
                />
              </div>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input
                  value={formValues.email}
                  onChange={(event) => setFormValues((prev) => ({ ...prev, email: event.target.value }))}
                  type="email"
                  placeholder="contacto@empresa.com"
                />
              </div>
              <div className="space-y-1">
                <Label>Sitio web</Label>
                <Input
                  value={formValues.website}
                  onChange={(event) => setFormValues((prev) => ({ ...prev, website: event.target.value }))}
                  placeholder="https://empresa.com"
                />
              </div>
              <div className="space-y-1">
                <Label>Dirección</Label>
                <Input
                  value={formValues.address}
                  onChange={(event) => setFormValues((prev) => ({ ...prev, address: event.target.value }))}
                  placeholder="Calle, ciudad, estado"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Notas</Label>
              <Textarea
                value={formValues.notas}
                onChange={(event) => setFormValues((prev) => ({ ...prev, notas: event.target.value }))}
                placeholder="Anota contexto adicional, acuerdos o restricciones."
                rows={4}
              />
            </div>
            {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setFormDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void handleFormSubmit()} disabled={formSubmitting}>
              {formSubmitting ? (
                <>
                  <IconLoader className="mr-2 size-4 animate-spin" />
                  Guardando...
                </>
              ) : formMode === "create" ? (
                <>
                  <IconPlus className="mr-2 size-4" />
                  Crear prospecto
                </>
              ) : (
                <>
                  <IconPencil className="mr-2 size-4" />
                  Guardar cambios
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar prospecto</DialogTitle>
            <DialogDescription>
              Esta acción no se puede deshacer. Se eliminará el prospecto seleccionado y todo su historial.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            ¿Deseas eliminar{" "}
            <span className="font-semibold text-foreground">
              {deleteTarget?.display_name ?? "este prospecto"}
            </span>
            ?
          </p>
          {deleteError ? <p className="text-sm text-destructive">{deleteError}</p> : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteDialogOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={() => void handleDeleteConfirm()} disabled={deleteLoading}>
              {deleteLoading ? (
                <>
                  <IconLoader className="mr-2 size-4 animate-spin" />
                  Eliminando...
                </>
              ) : (
                <>
                  <IconTrash className="mr-2 size-4" />
                  Eliminar
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Historial del prospecto</DialogTitle>
            <DialogDescription>
              {historyProspect ? historyProspect.display_name ?? "Prospecto" : "Sin prospecto seleccionado"}
            </DialogDescription>
          </DialogHeader>
          <Tabs value={historyTab} onValueChange={(value) => setHistoryTab(value as "contact" | "audit")} className="mt-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="contact">Envíos recientes</TabsTrigger>
              <TabsTrigger value="audit">Timeline</TabsTrigger>
            </TabsList>
            <TabsContent value="contact" className="mt-4">
              {historyError ? (
                <p className="text-sm text-destructive">{historyError}</p>
              ) : (
                <div className="max-h-[50vh] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Canal</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Detalle</TableHead>
                        <TableHead className="text-right">Procesado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {historyLoading ? (
                        <TableRow>
                          <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                            <IconLoader className="mr-2 inline size-4 animate-spin" />
                            Cargando historial...
                          </TableCell>
                        </TableRow>
                      ) : null}
                      {!historyLoading && !historyEntries.length ? (
                        <TableRow>
                          <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                            No hay envíos registrados para este prospecto.
                          </TableCell>
                        </TableRow>
                      ) : null}
                      {!historyLoading
                        ? historyEntries.map((envio) => (
                            <TableRow key={envio.id}>
                              <TableCell>
                                <Badge variant="outline">{canalLabel(envio.canal)}</Badge>
                              </TableCell>
                              <TableCell>
                                <Badge variant={contactStatusVariant(envio.estado)}>
                                  {contactStatusLabel(envio.estado)}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {contactHistoryDetail(envio)}
                              </TableCell>
                              <TableCell className="text-right text-xs text-muted-foreground">
                                {formatDate(envio.procesado_en || envio.programado_en)}
                              </TableCell>
                            </TableRow>
                          ))
                        : null}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
            <TabsContent value="audit" className="mt-4">
              {auditError ? (
                <p className="text-sm text-destructive">{auditError}</p>
              ) : (
                <div className="max-h-[50vh] space-y-3 overflow-y-auto">
                  {auditLoading ? (
                    <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                      <IconLoader className="size-4 animate-spin" />
                      Cargando timeline...
                    </p>
                  ) : null}
                  {!auditLoading && !auditEntries.length ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      Aún no hay cambios registrados para este prospecto.
                    </p>
                  ) : null}
                  {!auditLoading
                    ? auditEntries.map((entry) => {
                        const changes = extractAuditChanges(entry)
                        return (
                          <div key={entry.id} className="rounded-lg border bg-muted/30 p-3 text-sm shadow-sm">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="font-medium">{auditActionLabel(entry.accion)}</div>
                              <span className="text-xs text-muted-foreground">{formatDate(entry.realizado_en)}</span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Actor: {formatAuditActor(entry.realizado_por)}
                            </p>
                            {changes.length ? (
                              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                                {changes.map((change) => (
                                  <li key={`${entry.id}-${change}`}>{change}</li>
                                ))}
                              </ul>
                            ) : null}
                          </div>
                        )
                      })
                    : null}
                </div>
              )}
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setHistoryDialogOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProspeccionContactDrawer
        open={contactDrawerOpen && Boolean(contactDrawerData)}
        onOpenChange={handleContactDrawerOpenChange}
        data={contactDrawerData}
        onPromote={handlePromoteFromDrawer}
      />
    </div>
  )
}

function LookupStatusBadge({ status }: { status?: string | null }) {
  if (!status) {
    return <Badge variant="secondary">Pendiente</Badge>
  }
  const normalized = status.toLowerCase()
  const label = LOOKUP_STATUS_LABELS[normalized] ?? status
  const variant = LOOKUP_STATUS_VARIANTS[normalized] ?? "secondary"
  return <Badge variant={variant}>{label}</Badge>
}

type ProspectChannelBadgesProps = {
  prospecto: ProspectoItem
}

function ProspectChannelBadges({ prospecto }: ProspectChannelBadgesProps) {
  const rawPhone = (prospecto.phone_e164 || prospecto.phone || "").trim()
  const hasPhone = rawPhone.length > 0
  const carrier = (prospecto.carrier_type || "").toLowerCase()
  const whatsappAllowed = prospecto.whatsapp_permitido === true
  const whatsappDenied = prospecto.whatsapp_permitido === false

  let label = "Pendiente"
  let variantClass = "border border-border text-muted-foreground"
  let icon = <IconPhone className="size-3" />

  if (!hasPhone) {
    label = "Sin teléfono"
    variantClass = "border-destructive/40 bg-destructive/10 text-destructive"
  } else if (whatsappAllowed || carrier === "mobile") {
    label = "Teléfono móvil"
    variantClass = "bg-emerald-100 text-emerald-800"
    icon = <IconBrandWhatsapp className="size-3" />
  } else if (whatsappDenied || carrier === "landline") {
    label = "Teléfono fijo"
    variantClass = "bg-blue-100 text-blue-800"
  }

  return (
    <div className="mt-2 flex flex-wrap gap-2 text-xs">
      <span
        className={cn("flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium", variantClass)}
        title={whatsappAllowed || carrier === "mobile" ? "Probablemente tiene WhatsApp" : undefined}
      >
        {icon}
        {label}
      </span>
    </div>
  )
}

function formatDate(value?: string | null) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return DATE_TIME_FORMATTER.format(date)
}

type EnrichmentChecklistProps = {
  data: ChecklistSummary | null
  loading: boolean
  actionInProgress: "lookup" | "scraper" | null
  onRefresh: () => void
  onVerifyPhones: () => void
  onOpenScraper: () => void
  onOpenManual: () => void
}

function EnrichmentChecklist({
  data,
  loading,
  actionInProgress,
  onRefresh,
  onVerifyPhones,
  onOpenScraper,
  onOpenManual,
}: EnrichmentChecklistProps) {
  const cards = [
    {
      key: "telefonos",
      title: "Verificar teléfonos",
      description: "Confirma el tipo de línea antes de lanzar WhatsApp o voz.",
      count: data?.telefonos_pendientes ?? 0,
      icon: <IconPhoneCheck className="size-4 text-primary" />,
      actionLabel: "Ejecutar lookup",
      actionKey: "lookup" as const,
      onAction: onVerifyPhones,
    },
    {
      key: "correo",
      title: "Buscar datos adicionales",
      description: "Prospectos sin correo confirmado aún.",
      count: data?.sin_email ?? 0,
      icon: <IconMail className="size-4 text-primary" />,
      actionLabel: "Lanzar scraper",
      actionKey: "scraper" as const,
      onAction: onOpenScraper,
    },
    {
      key: "captura",
      title: "Completar fichas",
      description: "Registra emails, puestos o notas manualmente.",
      count: data?.datos_incompletos ?? 0,
      icon: <IconPencil className="size-4 text-primary" />,
      actionLabel: "Nuevo prospecto",
      actionKey: null,
      onAction: onOpenManual,
    },
  ]

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle className="text-base font-semibold">Checklist de enriquecimiento</CardTitle>
          <p className="text-sm text-muted-foreground">
            Prioriza la verificación de datos antes de lanzar una campaña.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
          <IconRefresh className={cn("mr-2 size-4", loading && "animate-spin")} />
          Actualizar
        </Button>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-3">
          {cards.map((card) => (
            <div key={card.key} className="rounded-xl border bg-muted/40 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                {card.icon}
                <span>{card.title}</span>
              </div>
              <div className="mt-2 text-3xl font-bold">{loading ? "…" : card.count}</div>
              <p className="mt-2 text-xs text-muted-foreground">{card.description}</p>
              <Button
                className="mt-3"
                variant="secondary"
                size="sm"
                onClick={card.onAction}
                disabled={
                  loading || !card.count || (card.actionKey ? actionInProgress === card.actionKey : false)
                }
              >
                {card.actionKey && actionInProgress === card.actionKey ? (
                  <>
                    <IconLoader className="mr-2 size-4 animate-spin" />
                    Ejecutando...
                  </>
                ) : (
                  card.actionLabel
                )}
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function formatDistance(meters?: number | null) {
  if (typeof meters !== "number" || Number.isNaN(meters)) {
    return null
  }
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`
  }
  return `${Math.round(meters)} m`
}

function carrierLabel(value: string | null | undefined) {
  if (!value) return ""
  const normalized = value.toLowerCase()
  switch (normalized) {
    case "mobile":
      return "Móvil"
    case "landline":
      return "Línea fija"
    case "voip":
      return "VoIP"
    default:
      return normalized
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function extractProspectoNotes(metadata: unknown): string | null {
  if (!isRecord(metadata)) {
    return null
  }
  const value = metadata["notas"]
  if (typeof value !== "string") {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length ? trimmed : null
}

function auditActionLabel(action: string): string {
  switch (action) {
    case "insert":
      return "Prospecto creado"
    case "delete":
      return "Prospecto eliminado"
    default:
      return "Campos actualizados"
  }
}

function formatAuditActor(value?: string | null): string {
  if (!value) {
    return "Sistema"
  }
  return value
}

function extractAuditChanges(entry: ProspectoAuditEntry): string[] {
  if (entry.accion !== "update") {
    return []
  }
  const before = isRecord(entry.cambios?.before) ? (entry.cambios.before as Record<string, unknown>) : null
  const after = isRecord(entry.cambios?.after) ? (entry.cambios.after as Record<string, unknown>) : null
  if (!before || !after) {
    return []
  }
  const trackedFields: Array<{
    key: string
    label: string
    formatter?: (value: unknown) => string
  }> = [
    { key: "display_name", label: "Nombre" },
    { key: "phone", label: "Teléfono" },
    { key: "email", label: "Correo" },
    { key: "segmento", label: "Segmento" },
    {
      key: "lookup_status",
      label: "Estado telefónico",
      formatter: formatLookupStatusValue,
    },
  ]
  const changes: string[] = []
  trackedFields.forEach(({ key, label, formatter }) => {
    const prevValue = formatter ? formatter(before[key]) : formatAuditValue(before[key])
    const nextValue = formatter ? formatter(after[key]) : formatAuditValue(after[key])
    if (prevValue !== nextValue) {
      changes.push(`${label}: ${prevValue} → ${nextValue}`)
    }
  })
  const prevStage = readStageFromRow(before)
  const nextStage = readStageFromRow(after)
  if (prevStage !== nextStage) {
    changes.push(`Etapa: ${formatStageLabel(prevStage)} → ${formatStageLabel(nextStage)}`)
  }
  const prevNotas = readNotesFromRow(before)
  const nextNotas = readNotesFromRow(after)
  if (prevNotas !== nextNotas) {
    changes.push(`Notas: ${prevNotas ?? "—"} → ${nextNotas ?? "—"}`)
  }
  return changes.slice(0, 5)
}

function formatAuditValue(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed.length ? trimmed : "—"
  }
  if (typeof value === "number") {
    return value.toString()
  }
  if (typeof value === "boolean") {
    return value ? "Sí" : "No"
  }
  if (value === null || value === undefined) {
    return "—"
  }
  return String(value)
}

function readStageFromRow(row: Record<string, unknown> | null): string | null {
  if (!row) {
    return null
  }
  const metadata = row["metadata"]
  if (!isRecord(metadata)) {
    return null
  }
  const stage = metadata["stage"]
  if (typeof stage === "string" && stage.trim().length) {
    return stage.trim()
  }
  return null
}

function formatStageLabel(stage: string | null | undefined): string {
  if (!stage) {
    return "Sin etapa"
  }
  const normalized = stage.toLowerCase() as ProspeccionStage
  return STAGE_LABELS[normalized] ?? stage
}

function formatLookupStatusValue(value: unknown): string {
  if (typeof value !== "string") {
    return formatAuditValue(value)
  }
  const normalized = value.toLowerCase()
  return LOOKUP_STATUS_LABELS[normalized] ?? value
}

function readNotesFromRow(row: Record<string, unknown> | null): string | null {
  if (!row) {
    return null
  }
  return extractProspectoNotes(row["metadata"])
}
