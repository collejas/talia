"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconDotsVertical,
  IconChevronDown,
  IconCalendar,
  IconHistory,
  IconLoader,
  IconPencil,
  IconPhoneCheck,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSparkles,
  IconTrash,
  IconMail,
  IconTargetArrow,
  IconPhone,
  IconUsersGroup,
  IconWorldSearch,
} from "@tabler/icons-react"

import Link from "next/link"

import { ProspeccionViewLayout } from "@/components/layouts/prospeccion-view-layout"
import { ProspeccionContactDrawer, type ProspeccionContactResult } from "@/components/prospeccion/prospeccion-contact-drawer"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
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
  contactarProspectos,
  crearProspectoManual,
  eliminarProspecto,
  eliminarProspectos,
  convertirProspectoAContacto,
  type ConvertirProspectoPayload,
  listContactoTemplates,
  listCrmCampaigns,
  listProspectos,
  listProspectosQueryMetadata,
  listContactoEnviosPorProspecto,
  listContactoLogs,
  listProspectoContactIndicators,
  listProspectoAudit,
  ejecutarChecklistLookup,
  ejecutarChecklistScraper,
  type ProspectoItem,
  type ProspectoManualInput,
  type ProspectoAuditEntry,
  type ContactoEnvio,
  type ProspeccionOmitido,
  type ProspectoContactIndicators,
  type ContactoLog,
  type ContactoTemplate,
  type ProspectoQueryOption,
  type ProspeccionCanalConfigInput,
  verificarProspectos,
  listContactoBatches,
  type ContactoBatch,
} from "@/lib/prospeccion/prospectos-client"

type FuenteFilter = "" | "google_places" | "denue" | "usuario"
type LookupFilter = "" | "pendiente" | "verificado" | "sin_numero" | "error"
type OrderOption = "creado" | "nombre"
type ProspectosSortKey =
  | "prospecto"
  | "correo"
  | "sitio_web"
  | "telefono"
  | "tipo_linea"
  | "telefono_verificado"
  | "fuente"
  | "tamano_rating"
  | "campana"
  | "con_envio"
  | "creado"
type ProspectTableColumnId = ProspectosSortKey

type Filters = {
  search: string
  fuente: FuenteFilter
  lookupStatus: LookupFilter
  segmento: string
  order: OrderOption
  carrierType: "" | "mobile" | "landline" | "voip"
  contactFilters: ContactPresenceFilter[]
  queryFilters: string[]
  actividadFilters: string[]
  dateOption: DateRangeOption
  customDateFrom: string
  customDateTo: string
}

type BannerState = {
  type: "success" | "error"
  message: string
}

type ContactDrawerData = {
  batchId?: string | null
  results: ProspeccionContactResult[]
  omitidos?: ProspeccionOmitido[]
}
type CampaignOption = { id: string; nombre: string }
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
  contactFilters: [],
  queryFilters: [],
  actividadFilters: [],
  dateOption: "",
  customDateFrom: "",
  customDateTo: "",
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

function arraysEqual(a: string[], b: string[]) {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false
  }
  return true
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

type ContactPresenceFilter =
  | "phone_has"
  | "phone_missing"
  | "email_has"
  | "email_missing"
  | "website_has"
  | "website_missing"

const CONTACT_FILTER_OPTIONS: Array<{ value: ContactPresenceFilter; label: string }> = [
  { value: "phone_has", label: "Tiene teléfono" },
  { value: "phone_missing", label: "No tiene teléfono" },
  { value: "email_has", label: "Tiene correo electrónico" },
  { value: "email_missing", label: "No tiene correo electrónico" },
  { value: "website_has", label: "Tiene sitio web" },
  { value: "website_missing", label: "No tiene sitio web" },
]

const CONTACT_FILTER_LABELS: Record<ContactPresenceFilter, string> = CONTACT_FILTER_OPTIONS.reduce(
  (acc, option) => {
    acc[option.value] = option.label
    return acc
  },
  {} as Record<ContactPresenceFilter, string>
)

const CONTACT_FILTER_ORDER = CONTACT_FILTER_OPTIONS.map((option) => option.value)
const CONTACT_FILTER_PLACEHOLDER = "Teléfono, correo o sitio web"
const QUERY_FILTER_PLACEHOLDER = "Todas las consultas"
const ACTIVITY_FILTER_PLACEHOLDER = "Todas las actividades"

const resolvePresenceFlag = (present: boolean, missing: boolean): boolean | undefined => {
  if (present && !missing) return true
  if (!present && missing) return false
  return undefined
}

type DateRangeOption = "" | "today" | "week" | "month" | "last_30" | "custom"

const DATE_RANGE_SELECT_OPTIONS: Array<{ value: Exclude<DateRangeOption, "">; label: string }> = [
  { value: "today", label: "Hoy" },
  { value: "week", label: "Esta semana" },
  { value: "month", label: "Este mes" },
  { value: "last_30", label: "Últimos 30 días" },
  { value: "custom", label: "Personalizado" },
]

const DATE_RANGE_LABELS: Record<Exclude<DateRangeOption, "">, string> = DATE_RANGE_SELECT_OPTIONS.reduce(
  (acc, option) => {
    acc[option.value] = option.label
    return acc
  },
  {} as Record<Exclude<DateRangeOption, "">, string>
)

const DATE_DISPLAY_FORMATTER = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" })

const toLocalIsoDate = (value: Date) => {
  const tzMs = value.getTimezoneOffset() * 60 * 1000
  return new Date(value.getTime() - tzMs).toISOString().slice(0, 10)
}

const getDateRangeFromFilters = (
  option: DateRangeOption,
  customFrom: string,
  customTo: string
): { from?: string; to?: string } => {
  if (!option) {
    return {}
  }
  const today = new Date()
  const toValue = toLocalIsoDate(today)
  switch (option) {
    case "today": {
      return { from: toValue, to: toValue }
    }
    case "week": {
      const start = new Date(today)
      const day = start.getDay()
      const diff = (day + 6) % 7
      start.setDate(start.getDate() - diff)
      return { from: toLocalIsoDate(start), to: toValue }
    }
    case "month": {
      const start = new Date(today)
      start.setDate(1)
      return { from: toLocalIsoDate(start), to: toValue }
    }
    case "last_30": {
      const start = new Date(today)
      start.setDate(start.getDate() - 29)
      return { from: toLocalIsoDate(start), to: toValue }
    }
    case "custom": {
      const from = customFrom?.trim()
      const to = customTo?.trim()
      return { from: from || undefined, to: to || undefined }
    }
    default:
      return {}
  }
}

const formatDateForLabel = (value: string) => {
  try {
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) {
      return value
    }
    return DATE_DISPLAY_FORMATTER.format(parsed)
  } catch {
    return value
  }
}

const getDateFilterChipLabel = (
  option: DateRangeOption,
  customFrom: string,
  customTo: string
): string | null => {
  if (!option) {
    return null
  }
  if (option !== "custom") {
    return DATE_RANGE_LABELS[option]
  }
  const from = customFrom?.trim()
  const to = customTo?.trim()
  const fromLabel = from ? formatDateForLabel(from) : null
  const toLabel = to ? formatDateForLabel(to) : null
  if (fromLabel && toLabel) {
    return `Del ${fromLabel} al ${toLabel}`
  }
  if (fromLabel) {
    return `Desde ${fromLabel}`
  }
  if (toLabel) {
    return `Hasta ${toLabel}`
  }
  return DATE_RANGE_LABELS.custom
}

const FUENTE_LABELS: Record<string, string> = {
  google_places: "Google Places",
  denue: "DENUE",
  usuario: "Usuario",
}

const BATCH_STATE_VARIANTS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  pendiente: "secondary",
  procesando: "secondary",
  completado: "default",
  enviado: "default",
  cancelado: "outline",
  error: "destructive",
  fallido: "destructive",
}

const PAGE_SIZE_OPTIONS = [10, 25, 50] as const
const PROSPECTOS_TABLE_PREFS_KEY = "prospeccion_prospectos_table_prefs_v1"
const DEFAULT_TABLE_COLUMN_ORDER: ProspectTableColumnId[] = [
  "prospecto",
  "correo",
  "sitio_web",
  "telefono",
  "tipo_linea",
  "telefono_verificado",
  "fuente",
  "tamano_rating",
  "campana",
  "con_envio",
  "creado",
]

const TABLE_COLUMN_META: Record<
  ProspectTableColumnId,
  {
    label: string
    widthClass: string
  }
> = {
  prospecto: { label: "Prospecto", widthClass: "w-[260px]" },
  correo: { label: "Correo", widthClass: "w-[180px]" },
  sitio_web: { label: "Sitio web", widthClass: "w-[180px]" },
  telefono: { label: "Teléfono", widthClass: "w-[140px]" },
  tipo_linea: { label: "Tipo de línea", widthClass: "w-[120px]" },
  telefono_verificado: { label: "Teléfono verificado", widthClass: "w-[130px]" },
  fuente: { label: "Fuente", widthClass: "w-[160px]" },
  tamano_rating: { label: "Tamaño/Rating", widthClass: "w-[130px]" },
  campana: { label: "Campaña", widthClass: "w-[140px]" },
  con_envio: { label: "Con envío", widthClass: "w-[110px]" },
  creado: { label: "Creado", widthClass: "w-[120px]" },
}
const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Mexico_City",
})

type FlowStepKey = "discover" | "enrich" | "prepare" | "launch" | "evaluate"
type FlowStepDefinition = {
  key: FlowStepKey
  title: string
  description: string
  actionHref: string
  actionLabel: string
  icon: typeof IconSearch
  count?: number
  meta?: string
  isCurrent?: boolean
}

const PROSPECCION_FLOW_DEFINITIONS: FlowStepDefinition[] = [
  {
    key: "discover",
    title: "1. Descubre",
    description: "Busca en Google, DENUE o Web para alimentar tu lista.",
    actionHref: "/prospeccion/buscador",
    actionLabel: "Abrir buscador",
    icon: IconSearch,
  },
  {
    key: "enrich",
    title: "2. Enriquecer",
    description: "Valida teléfonos y completa datos clave desde este panel.",
    actionHref: "#checklist",
    actionLabel: "Ver checklist",
    icon: IconSparkles,
  },
  {
    key: "prepare",
    title: "3. Preparar",
    description: "Selecciona prospectos, define filtros y listas inteligentes.",
    actionHref: "#prospectos",
    actionLabel: "Revisar tabla",
    icon: IconUsersGroup,
  },
  {
    key: "launch",
    title: "4. Lanzar",
    description: "Configura canales y plantillas multicanal antes de enviar.",
    actionHref: "/prospeccion/campanas",
    actionLabel: "Ver campañas",
    icon: IconTargetArrow,
  },
  {
    key: "evaluate",
    title: "5. Evaluar",
    description: "Monitorea KPIs, streams y reintentos en tiempo real.",
    actionHref: "/prospeccion/contactos",
    actionLabel: "Abrir monitor",
    icon: IconPhone,
  },
]

export default function ProspectosClientPage() {
  return (
    <ProspeccionViewLayout title="Prospección · Prospectos">
      <ProspectosView />
    </ProspeccionViewLayout>
  )
}

function ProspectosView() {
  const [filters, setFilters] = useState<Filters>(initialFilters)
  const [tableSort, setTableSort] = useState<{ key: ProspectosSortKey; direction: "asc" | "desc" }>({
    key: "creado",
    direction: "desc",
  })
  const [columnOrder, setColumnOrder] = useState<ProspectTableColumnId[]>(DEFAULT_TABLE_COLUMN_ORDER)
  const [columnVisibility, setColumnVisibility] = useState<Record<ProspectTableColumnId, boolean>>({
    prospecto: true,
    correo: true,
    sitio_web: true,
    telefono: true,
    tipo_linea: true,
    telefono_verificado: true,
    fuente: true,
    tamano_rating: true,
    campana: true,
    con_envio: true,
    creado: true,
  })
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
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false)
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null)
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false)
  const [contactDrawerOpen, setContactDrawerOpen] = useState(false)
  const [contactDrawerData, setContactDrawerData] = useState<ContactDrawerData | null>(null)
  const [contactIndicators, setContactIndicators] = useState<Record<string, ProspectoContactIndicators>>({})
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false)
  const [historyProspect, setHistoryProspect] = useState<ProspectoItem | null>(null)
  const [historyEntries, setHistoryEntries] = useState<ContactoEnvio[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [timelineEntries, setTimelineEntries] = useState<ContactoLog[]>([])
  const [timelineLoading, setTimelineLoading] = useState(false)
  const [timelineError, setTimelineError] = useState<string | null>(null)
  const [auditEntries, setAuditEntries] = useState<ProspectoAuditEntry[]>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditError, setAuditError] = useState<string | null>(null)
  const [historyTab, setHistoryTab] = useState<"timeline" | "envios" | "audit">("timeline")
  const [checklist, setChecklist] = useState<ChecklistSummary | null>(null)
  const [checklistLoading, setChecklistLoading] = useState(false)
  const [checklistAction, setChecklistAction] = useState<"lookup" | "scraper" | null>(null)
  const [recentBatches, setRecentBatches] = useState<ContactoBatch[]>([])
  const [recentBatchLoading, setRecentBatchLoading] = useState(false)
  const [recentBatchError, setRecentBatchError] = useState<string | null>(null)
  const [queryOptions, setQueryOptions] = useState<ProspectoQueryOption[]>([])
  const [activityOptions, setActivityOptions] = useState<string[]>([])
  const [queryOptionsLoading, setQueryOptionsLoading] = useState(false)
  const [activityOptionsLoading, setActivityOptionsLoading] = useState(false)
  const [stageSummary, setStageSummary] = useState<Partial<Record<FlowStepKey, number>>>({})
  const [stageSummaryLoading, setStageSummaryLoading] = useState(false)
  const [plannerOpen, setPlannerOpen] = useState(false)
  const [plannerCampaignId, setPlannerCampaignId] = useState("")
  const [plannerScheduleDate, setPlannerScheduleDate] = useState("")
  const [plannerScheduleTime, setPlannerScheduleTime] = useState("10:00")
  const [plannerSeparationSeconds, setPlannerSeparationSeconds] = useState("0")
  const [plannerCampaignOptions, setPlannerCampaignOptions] = useState<CampaignOption[]>([])
  const [plannerCampaignsLoading, setPlannerCampaignsLoading] = useState(false)
  const [plannerScheduleMode, setPlannerScheduleMode] = useState<"ahora" | "programado">("ahora")
  const [plannerTemplates, setPlannerTemplates] = useState<ContactoTemplate[]>([])
  const [plannerTemplatesLoading, setPlannerTemplatesLoading] = useState(false)
  const [plannerTemplateSelection, setPlannerTemplateSelection] = useState<{
    correo: string
    whatsapp: string
    llamada: string
  }>({ correo: "", whatsapp: "", llamada: "" })
  const [plannerExecuting, setPlannerExecuting] = useState(false)
  const [plannerError, setPlannerError] = useState<string | null>(null)
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
  const queryFiltersInitialEffect = useRef(true)
  const plannerDateInputRef = useRef<HTMLInputElement | null>(null)

  const currentIds = useMemo(() => items.map((item) => item.id).filter(Boolean) as string[], [items])
  const selectedIds = useMemo(() => Array.from(selected.values()), [selected])
  const selectedCount = selectedIds.length
  const orderSelectedByOptions = (selection: Set<string>, options: string[]) => {
    const ordered: string[] = []
    const seen = new Set<string>()
    options.forEach((option) => {
      if (selection.has(option)) {
        ordered.push(option)
        seen.add(option)
      }
    })
    for (const value of selection) {
      if (!seen.has(value)) {
        ordered.push(value)
      }
    }
    return ordered
  }
  const queryLabelMap = useMemo(
    () => new Map(queryOptions.map((option) => [option.value, option.label])),
    [queryOptions]
  )
  const toggleTableSort = useCallback((key: ProspectosSortKey) => {
    setTableSort((current) => {
      if (current.key === key) {
        return { key, direction: current.direction === "asc" ? "desc" : "asc" }
      }
      return { key, direction: "asc" }
    })
  }, [])
  const sortedItems = useMemo(() => {
    const rows = [...items]
    rows.sort((a, b) => {
      const aName = (a.display_name || "").trim()
      const bName = (b.display_name || "").trim()
      const aEmail = (a.email || "").trim().toLowerCase()
      const bEmail = (b.email || "").trim().toLowerCase()
      const aWebsite = (a.website || "").trim().toLowerCase()
      const bWebsite = (b.website || "").trim().toLowerCase()
      const aPhone = (a.phone_e164 || a.phone || "").trim()
      const bPhone = (b.phone_e164 || b.phone || "").trim()
      const aCarrier = carrierLabel(a.carrier_type).toLowerCase()
      const bCarrier = carrierLabel(b.carrier_type).toLowerCase()
      const aLookup = (a.lookup_status || "").toLowerCase()
      const bLookup = (b.lookup_status || "").toLowerCase()
      const aFuente = FUENTE_LABELS[a.fuente] ?? a.fuente
      const bFuente = FUENTE_LABELS[b.fuente] ?? b.fuente
      const aRating = typeof a.rating === "number" ? a.rating : null
      const bRating = typeof b.rating === "number" ? b.rating : null
      const aSize = (a.estrato || a.segmento || "").trim().toLowerCase()
      const bSize = (b.estrato || b.segmento || "").trim().toLowerCase()
      const aCampaign = (extractProspectoCampaignName(a.metadata) || "").trim().toLowerCase()
      const bCampaign = (extractProspectoCampaignName(b.metadata) || "").trim().toLowerCase()
      const aHasEnvios = ((a.id ? contactIndicators[a.id]?.total_envios : 0) ?? 0) > 0 ? 1 : 0
      const bHasEnvios = ((b.id ? contactIndicators[b.id]?.total_envios : 0) ?? 0) > 0 ? 1 : 0
      const aCreated = a.creado_en ? new Date(a.creado_en).getTime() : 0
      const bCreated = b.creado_en ? new Date(b.creado_en).getTime() : 0

      let base = 0
      switch (tableSort.key) {
        case "prospecto":
          base = aName.localeCompare(bName, "es", { sensitivity: "base" })
          break
        case "correo":
          base = aEmail.localeCompare(bEmail, "es", { sensitivity: "base" })
          break
        case "sitio_web":
          base = aWebsite.localeCompare(bWebsite, "es", { sensitivity: "base" })
          break
        case "telefono":
          base = aPhone.localeCompare(bPhone, "es", { sensitivity: "base" })
          break
        case "tipo_linea":
          base = aCarrier.localeCompare(bCarrier, "es", { sensitivity: "base" })
          break
        case "telefono_verificado":
          base = aLookup.localeCompare(bLookup, "es", { sensitivity: "base" })
          break
        case "fuente":
          base = aFuente.localeCompare(bFuente, "es", { sensitivity: "base" })
          break
        case "tamano_rating":
          if (aRating !== null || bRating !== null) {
            base = (aRating ?? -1) - (bRating ?? -1)
          } else {
            base = aSize.localeCompare(bSize, "es", { sensitivity: "base" })
          }
          break
        case "campana":
          base = aCampaign.localeCompare(bCampaign, "es", { sensitivity: "base" })
          break
        case "con_envio":
          base = aHasEnvios - bHasEnvios
          break
        case "creado":
        default:
          base = aCreated - bCreated
          break
      }
      if (base === 0) {
        return aName.localeCompare(bName, "es", { sensitivity: "base" })
      }
      return tableSort.direction === "asc" ? base : -base
    })
    return rows
  }, [contactIndicators, items, tableSort.direction, tableSort.key])
  const visibleColumns = useMemo(
    () => columnOrder.filter((columnId) => columnVisibility[columnId] !== false),
    [columnOrder, columnVisibility]
  )
  const visibleColumnsCount = visibleColumns.length

  useEffect(() => {
    if (typeof window === "undefined") return
    const raw = window.localStorage.getItem(PROSPECTOS_TABLE_PREFS_KEY)
    if (!raw) return
    try {
      const parsed = JSON.parse(raw) as {
        order?: ProspectTableColumnId[]
        visibility?: Partial<Record<ProspectTableColumnId, boolean>>
      }
      const parsedOrder = Array.isArray(parsed.order) ? parsed.order.filter((id): id is ProspectTableColumnId => id in TABLE_COLUMN_META) : []
      if (parsedOrder.length) {
        const missing = DEFAULT_TABLE_COLUMN_ORDER.filter((id) => !parsedOrder.includes(id))
        setColumnOrder([...parsedOrder, ...missing])
      }
      if (parsed.visibility && typeof parsed.visibility === "object") {
        setColumnVisibility((prev) => {
          const next: Record<ProspectTableColumnId, boolean> = { ...prev }
          for (const columnId of DEFAULT_TABLE_COLUMN_ORDER) {
            const value = parsed.visibility?.[columnId]
            if (typeof value === "boolean") {
              next[columnId] = value
            }
          }
          return next
        })
      }
    } catch {
      // ignore persisted parse issues
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    window.localStorage.setItem(
      PROSPECTOS_TABLE_PREFS_KEY,
      JSON.stringify({ order: columnOrder, visibility: columnVisibility })
    )
  }, [columnOrder, columnVisibility])

  const moveTableColumn = useCallback((draggedId: ProspectTableColumnId, targetId: ProspectTableColumnId) => {
    if (draggedId === targetId) return
    setColumnOrder((prev) => {
      const from = prev.indexOf(draggedId)
      const to = prev.indexOf(targetId)
      if (from < 0 || to < 0) return prev
      const next = [...prev]
      next.splice(from, 1)
      next.splice(to, 0, draggedId)
      return next
    })
  }, [])

  const toggleColumnVisibility = useCallback((columnId: ProspectTableColumnId, visible: boolean) => {
    setColumnVisibility((prev) => ({ ...prev, [columnId]: visible }))
  }, [])

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
    if (filters.contactFilters.length) {
      filters.contactFilters.forEach((filterKey) => {
        chips.push(CONTACT_FILTER_LABELS[filterKey])
      })
    }
    if (filters.queryFilters.length) {
      const labels = filters.queryFilters.map((value) => queryLabelMap.get(value) ?? value)
      chips.push(`Consulta: ${labels.join(", ")}`)
    }
    if (filters.actividadFilters.length) {
      chips.push(`Actividad: ${filters.actividadFilters.join(", ")}`)
    }
    const dateChip = getDateFilterChipLabel(filters.dateOption, filters.customDateFrom, filters.customDateTo)
    if (dateChip) {
      chips.push(`Fecha: ${dateChip}`)
    }
    return chips
  }, [filters, queryLabelMap])
  const fetchProspectos = useCallback(
    async (nextOffset = 0) => {
      setLoading(true)
      setError(null)
    try {
      const phonePresent = resolvePresenceFlag(
        filters.contactFilters.includes("phone_has"),
        filters.contactFilters.includes("phone_missing")
      )
      const emailPresent = resolvePresenceFlag(
        filters.contactFilters.includes("email_has"),
        filters.contactFilters.includes("email_missing")
      )
      const websitePresent = resolvePresenceFlag(
        filters.contactFilters.includes("website_has"),
        filters.contactFilters.includes("website_missing")
      )
      const { from: dateFrom, to: dateTo } = getDateRangeFromFilters(
        filters.dateOption,
        filters.customDateFrom,
        filters.customDateTo
      )
        const response = await listProspectos({
          limit,
          offset: nextOffset,
          search: filters.search || undefined,
          fuente: filters.fuente || undefined,
          lookupStatus: filters.lookupStatus || undefined,
          segmento: filters.segmento || undefined,
          carrierType: filters.carrierType || undefined,
          order: filters.order,
          phonePresent,
          emailPresent,
          websitePresent,
          metadataQueries: filters.queryFilters.length ? filters.queryFilters : undefined,
          actividades: filters.actividadFilters.length ? filters.actividadFilters : undefined,
          dateFrom,
          dateTo,
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

  const appendProspectos = useCallback(
    async (startOffset: number, needed: number) => {
      if (needed <= 0) return
      try {
        const phonePresent = resolvePresenceFlag(
          filters.contactFilters.includes("phone_has"),
          filters.contactFilters.includes("phone_missing")
        )
        const emailPresent = resolvePresenceFlag(
          filters.contactFilters.includes("email_has"),
          filters.contactFilters.includes("email_missing")
        )
        const websitePresent = resolvePresenceFlag(
          filters.contactFilters.includes("website_has"),
          filters.contactFilters.includes("website_missing")
        )
        const { from: dateFrom, to: dateTo } = getDateRangeFromFilters(
          filters.dateOption,
          filters.customDateFrom,
          filters.customDateTo
        )
        const response = await listProspectos({
          limit: needed,
          offset: startOffset,
          search: filters.search || undefined,
          fuente: filters.fuente || undefined,
          lookupStatus: filters.lookupStatus || undefined,
          segmento: filters.segmento || undefined,
          carrierType: filters.carrierType || undefined,
          order: filters.order,
          phonePresent,
          emailPresent,
          websitePresent,
          metadataQueries: filters.queryFilters.length ? filters.queryFilters : undefined,
          actividades: filters.actividadFilters.length ? filters.actividadFilters : undefined,
          dateFrom,
          dateTo,
        })
        const rows = response.items ?? []
        if (rows.length) {
          setItems((prev) => [...prev, ...rows])
        }
        if (typeof response.total === "number") {
          setTotal(response.total)
        }
      } catch {
        // Silencioso: solo relleno de huecos.
      }
    },
    [filters]
  )

  useEffect(() => {
    void fetchProspectos(0)
  }, [fetchProspectos])

  const loadQueryOptions = useCallback(async (scope: { fuente?: FuenteFilter; dateFrom?: string; dateTo?: string }) => {
    setQueryOptionsLoading(true)
    try {
      const response = await listProspectosQueryMetadata({
        fuente: scope.fuente || undefined,
        dateFrom: scope.dateFrom,
        dateTo: scope.dateTo,
      })
      const queries = response.queries ?? []
      const activities = response.activities ?? []
      setQueryOptions(queries)
      setActivityOptions(activities)
      const queryValues = new Set(queries.map((item) => item.value))
      setFilters((prev) => {
        const nextQueryFilters = prev.queryFilters.filter((value) => queryValues.has(value))
        const nextActividadFilters = prev.actividadFilters.filter((value) => activities.includes(value))
        if (
          arraysEqual(nextQueryFilters, prev.queryFilters) &&
          arraysEqual(nextActividadFilters, prev.actividadFilters)
        ) {
          return prev
        }
        return {
          ...prev,
          queryFilters: nextQueryFilters,
          actividadFilters: nextActividadFilters,
        }
      })
    } catch {
      setQueryOptions([])
      setActivityOptions([])
      setFilters((prev) => {
        if (!prev.queryFilters.length && !prev.actividadFilters.length) {
          return prev
        }
        return {
          ...prev,
          queryFilters: [],
          actividadFilters: [],
        }
      })
    } finally {
      setQueryOptionsLoading(false)
    }
  }, [])

  const loadActivitiesForQueries = useCallback(
    async (selectedQueries: string[]) => {
      setActivityOptionsLoading(true)
      try {
        const { from: dateFrom, to: dateTo } = getDateRangeFromFilters(
          filters.dateOption,
          filters.customDateFrom,
          filters.customDateTo
        )
        const response = await listProspectosQueryMetadata({
          queries: selectedQueries.length ? selectedQueries : undefined,
          fuente: filters.fuente || undefined,
          dateFrom,
          dateTo,
        })
      const activities = response.activities ?? []
        setActivityOptions(activities)
        setFilters((prev) => {
          const nextActividadFilters = prev.actividadFilters.filter((value) => activities.includes(value))
          if (arraysEqual(nextActividadFilters, prev.actividadFilters)) {
            return prev
          }
          return {
            ...prev,
            actividadFilters: nextActividadFilters,
          }
        })
      } catch {
        setActivityOptions([])
        setFilters((prev) => {
          if (!prev.actividadFilters.length) {
            return prev
          }
          return {
            ...prev,
            actividadFilters: [],
          }
        })
      } finally {
        setActivityOptionsLoading(false)
      }
    },
    [filters.customDateFrom, filters.customDateTo, filters.dateOption, filters.fuente]
  )

  useEffect(() => {
    const { from: dateFrom, to: dateTo } = getDateRangeFromFilters(
      filters.dateOption,
      filters.customDateFrom,
      filters.customDateTo
    )
    void loadQueryOptions({ fuente: filters.fuente || undefined, dateFrom, dateTo })
  }, [filters.customDateFrom, filters.customDateTo, filters.dateOption, filters.fuente, loadQueryOptions])

  useEffect(() => {
    if (queryFiltersInitialEffect.current) {
      queryFiltersInitialEffect.current = false
      return
    }
    void loadActivitiesForQueries(filters.queryFilters)
  }, [filters.queryFilters, loadActivitiesForQueries])

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

  const fetchRecentBatches = useCallback(async () => {
    setRecentBatchLoading(true)
    setRecentBatchError(null)
    try {
      const response = await listContactoBatches({ limit: 3 })
      setRecentBatches(response.items ?? [])
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudieron cargar los lotes recientes."
      setRecentBatchError(message)
    } finally {
      setRecentBatchLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshChecklist()
  }, [refreshChecklist])

  const fetchStageSummary = useCallback(async () => {
    setStageSummaryLoading(true)
    try {
      const response = await fetch("/api/prospeccion/stage-resumen", { cache: "no-store" })
      if (!response.ok) {
        throw new Error("stage_summary_failed")
      }
      const data = (await response.json()) as { stages?: Record<string, number> }
      const stages = data?.stages ?? {}
      setStageSummary({
        discover: Number(stages["descubre"]) || 0,
        enrich: Number(stages["enriquecer"]) || 0,
        prepare: Number(stages["preparar"]) || 0,
        launch: Number(stages["lanzar"]) || 0,
        evaluate: Number(stages["evaluar"]) || 0,
      })
    } catch {
      setStageSummary({})
    } finally {
      setStageSummaryLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchStageSummary()
  }, [fetchStageSummary])

  useEffect(() => {
    void fetchRecentBatches()
  }, [fetchRecentBatches])

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
        limit: Math.max(1, Math.min(20, pending)),
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

  const handleScraperSelected = useCallback(async () => {
    if (!selectedIds.length) return
    setChecklistAction("scraper")
    setBanner(null)
    const cappedIds = selectedIds.slice(0, 200)
    const limit = Math.max(1, Math.min(20, cappedIds.length))
    try {
      const response = await ejecutarChecklistScraper({
        limit,
        mode: "auto",
        prospectoIds: cappedIds,
      })
      if (!response.programados) {
        setBanner({
          type: "error",
          message: "Los prospectos seleccionados no tienen sitio web válido para lanzar el scraper.",
        })
      } else {
        setBanner({
          type: "success",
          message: `Scraper lanzado para ${response.programados} prospectos seleccionados.`,
        })
      }
      await refreshChecklist()
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo lanzar el scraper."
      setBanner({ type: "error", message })
    } finally {
      setChecklistAction(null)
    }
  }, [refreshChecklist, selectedIds])

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
      setTimelineEntries([])
      setTimelineError(null)
      setTimelineLoading(false)
      setAuditEntries([])
      setAuditError(null)
      setAuditLoading(false)
      setHistoryTab("timeline")
    }
  }, [historyDialogOpen])

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

  useEffect(() => {
    if (!currentIds.length) {
      setContactIndicators({})
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const response = await listProspectoContactIndicators(currentIds)
        if (cancelled) return
        const indicators: Record<string, ProspectoContactIndicators> = {}
        for (const indicator of response.items ?? []) {
          const key = indicator?.prospecto_id
          if (key) {
            indicators[key] = indicator
          }
        }
        setContactIndicators(indicators)
      } catch {
        if (!cancelled) {
          setContactIndicators({})
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [currentIds])
  const allSelected = currentIds.length > 0 && currentIds.every((id) => selected.has(id))
  const showingFrom = items.length ? offset + 1 : 0
  const showingTo = items.length ? offset + items.length : 0
  const pageCount = limit ? Math.ceil(total / limit) : 1
  const currentPage = limit ? Math.floor(offset / limit) + 1 : 1
  const flowSteps = useMemo(() => {
    const pendingPhones = checklist?.telefonos_pendientes ?? 0
    const pendingEmails = checklist?.sin_email ?? 0
    const steps = PROSPECCION_FLOW_DEFINITIONS.map((step) => {
      let meta: string
      switch (step.key) {
        case "discover":
          meta = total ? `${total.toLocaleString("es-MX")} prospectos` : "Sin búsquedas guardadas"
          break
        case "enrich": {
          const parts = []
          if (pendingPhones > 0) parts.push(`${pendingPhones} tel. pendientes`)
          if (pendingEmails > 0) parts.push(`${pendingEmails} sin email`)
          meta = parts.length ? parts.join(" · ") : "Datos verificados"
          break
        }
        case "prepare":
          meta = selectedCount ? `${selectedCount} seleccionados` : "Selecciona prospectos"
          break
        case "launch":
          meta = "Wizard multicanal"
          break
        case "evaluate":
          meta = "KPIs y stream en vivo"
          break
        default:
          meta = ""
      }
      const count = stageSummary[step.key] ?? 0
      return { ...step, meta, count, isCurrent: step.key === "prepare" }
    })
    return steps
  }, [checklist, selectedCount, stageSummary, total])

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

  const handleContactFilterToggle = (value: ContactPresenceFilter, enabled: boolean) => {
    setFilters((prev) => {
      const next = new Set(prev.contactFilters)
      if (enabled) {
        next.add(value)
      } else {
        next.delete(value)
      }
      return {
        ...prev,
        contactFilters: CONTACT_FILTER_ORDER.filter((filter) => next.has(filter)),
      }
    })
  }

  const handleQueryFilterToggle = (value: string, enabled: boolean) => {
    setFilters((prev) => {
      const next = new Set(prev.queryFilters)
      if (enabled) {
        next.add(value)
      } else {
        next.delete(value)
      }
      return {
        ...prev,
        queryFilters: orderSelectedByOptions(
          next,
          queryOptions.map((option) => option.value)
        ),
      }
    })
  }

  const handleActividadFilterToggle = (value: string, enabled: boolean) => {
    setFilters((prev) => {
      const next = new Set(prev.actividadFilters)
      if (enabled) {
        next.add(value)
      } else {
        next.delete(value)
      }
      return {
        ...prev,
        actividadFilters: orderSelectedByOptions(next, activityOptions),
      }
    })
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
      void fetchStageSummary()
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo verificar los teléfonos."
      setBanner({ type: "error", message })
    } finally {
      setAction(null)
    }
  }, [fetchProspectos, fetchStageSummary, offset, selectedIds])

  const handlePlannerOpen = useCallback(() => {
    setPlannerCampaignId("")
    setPlannerScheduleDate("")
    setPlannerScheduleTime("10:00")
    setPlannerScheduleMode("ahora")
    setPlannerSeparationSeconds("0")
    setPlannerTemplates([])
    setPlannerTemplateSelection({ correo: "", whatsapp: "", llamada: "" })
    setPlannerError(null)
    setPlannerOpen(true)
  }, [])

  const fetchPlannerCampaignOptions = useCallback(async () => {
    setPlannerCampaignsLoading(true)
    try {
      const campaigns = await listCrmCampaigns()
      const ordered = (Array.isArray(campaigns) ? campaigns : [])
        .map((campaign) => ({
          id: campaign.id,
          nombre: campaign.nombre ?? `Campaña ${campaign.id.slice(0, 8)}`,
        }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }))
      setPlannerCampaignOptions(ordered)
      setPlannerCampaignId((prev) => (prev && ordered.some((item) => item.id === prev) ? prev : ordered[0]?.id ?? ""))
    } catch (err) {
      setPlannerCampaignOptions([])
      const message = err instanceof Error ? err.message : "No se pudieron cargar las campañas."
      setPlannerError(message)
    } finally {
      setPlannerCampaignsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!plannerOpen) return
    void fetchPlannerCampaignOptions()
  }, [fetchPlannerCampaignOptions, plannerOpen])

  const fetchPlannerTemplates = useCallback(async (campanaId: string) => {
    setPlannerTemplatesLoading(true)
    try {
      const response = await listContactoTemplates({ campana_id: campanaId })
      const items = (response.items ?? []) as ContactoTemplate[]
      setPlannerTemplates(items)
      const byCanal = (canal: "correo" | "whatsapp" | "llamada") =>
        items.find((item) => item.canal === canal)?.id ?? ""
      setPlannerTemplateSelection({
        correo: byCanal("correo"),
        whatsapp: byCanal("whatsapp"),
        llamada: byCanal("llamada"),
      })
    } catch (err) {
      setPlannerTemplates([])
      setPlannerTemplateSelection({ correo: "", whatsapp: "", llamada: "" })
      const message = err instanceof Error ? err.message : "No se pudieron cargar las plantillas de la campaña."
      setPlannerError(message)
    } finally {
      setPlannerTemplatesLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!plannerOpen || !plannerCampaignId) return
    void fetchPlannerTemplates(plannerCampaignId)
  }, [fetchPlannerTemplates, plannerCampaignId, plannerOpen])

  const handlePlannerOpenChange = useCallback(
    (open: boolean) => {
      setPlannerOpen(open)
      if (!open) {
        setPlannerError(null)
        setPlannerCampaignId("")
        setPlannerScheduleDate("")
        setPlannerScheduleTime("10:00")
        setPlannerScheduleMode("ahora")
        setPlannerSeparationSeconds("0")
        setPlannerTemplates([])
        setPlannerTemplateSelection({ correo: "", whatsapp: "", llamada: "" })
      }
    },
    []
  )

  const handlePlannerContinue = useCallback(async () => {
    setPlannerError(null)
    if (!selectedCount) {
      setPlannerError("Selecciona al menos un prospecto.")
      return
    }
    if (!plannerCampaignId) {
      setPlannerError("Selecciona una campaña.")
      return
    }
    const separacion = Number.parseInt(plannerSeparationSeconds || "0", 10)
    if (Number.isNaN(separacion) || separacion < 0 || separacion > 3600) {
      setPlannerError("La separación debe estar entre 0 y 3600 segundos.")
      return
    }
    setPlannerExecuting(true)
    try {
      const templates = plannerTemplates
      const canalesPayload: ProspeccionCanalConfigInput[] = []
      const scheduleValue =
        plannerScheduleMode === "programado" && plannerScheduleDate
          ? new Date(`${plannerScheduleDate}T${plannerScheduleTime || "00:00"}`).toISOString()
          : undefined
      ;(["correo", "whatsapp", "llamada"] as const).forEach((canal) => {
        const selectedTemplateId = plannerTemplateSelection[canal]
        if (!selectedTemplateId) return
        const template = templates.find((item) => item.id === selectedTemplateId && item.canal === canal)
        if (!template) return
        const entry: ProspeccionCanalConfigInput = {
          canal,
          template_id: template.id,
        }
        if (canal === "correo") {
          if (template.asunto) entry.subject = template.asunto
          if (template.cuerpo_texto) entry.body = template.cuerpo_texto
          if (template.cuerpo_html) entry.body_html = template.cuerpo_html
        }
        if (canal === "whatsapp") {
          if (template.cuerpo_texto) entry.body = template.cuerpo_texto
          const metadata = template.metadata && typeof template.metadata === "object" ? template.metadata : null
          const twilioSid =
            metadata && typeof metadata["twilio_content_sid"] === "string" ? metadata["twilio_content_sid"].trim() : ""
          if (twilioSid) {
            entry.metadata = { twilio_content_sid: twilioSid }
          }
        }
        if (canal === "llamada") {
          entry.message = template.cuerpo_texto?.trim() || template.descripcion?.trim() || ""
        }
        if (scheduleValue) {
          entry.programado_en = scheduleValue
        }
        canalesPayload.push(entry)
      })
      if (!canalesPayload.length) {
        setPlannerError("La campaña no tiene plantillas configuradas para ejecutar.")
        return
      }
      const response = await contactarProspectos({
        prospecto_ids: selectedIds,
        campana_id: plannerCampaignId,
        canales: canalesPayload,
        separacion_segundos: separacion,
      })
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
      setBanner({
        type: "success",
        message: response.batch_id
          ? `Lote ${response.batch_id} ejecutado con ${enrichedResults.length} envíos.`
          : "Lote ejecutado.",
      })
      handlePlannerOpenChange(false)
      await fetchProspectos(offset)
      void fetchRecentBatches()
      void fetchStageSummary()
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo ejecutar el lote."
      setPlannerError(message)
    } finally {
      setPlannerExecuting(false)
    }
  }, [
    fetchProspectos,
    fetchRecentBatches,
    fetchStageSummary,
    handlePlannerOpenChange,
    items,
    offset,
    openContactDrawer,
    plannerCampaignId,
    plannerScheduleDate,
    plannerScheduleMode,
    plannerScheduleTime,
    plannerTemplateSelection,
    plannerTemplates,
    plannerSeparationSeconds,
    selectedCount,
    selectedIds,
  ])

  const openPlannerDatePicker = useCallback(() => {
    const input = plannerDateInputRef.current
    if (!input) return
    // Chromium supports showPicker; fallback keeps compatibility on Firefox.
    const pickerInput = input as HTMLInputElement & { showPicker?: () => void }
    if (typeof pickerInput.showPicker === "function") {
      pickerInput.showPicker()
      return
    }
    input.focus()
    input.click()
  }, [])

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
      void fetchStageSummary()
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo convertir el prospecto."
      setConvertError(message)
    } finally {
      setConvertSubmitting(false)
    }
  }, [convertForm, convertProspect, fetchProspectos, fetchStageSummary, offset])

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
    setHistoryTab("timeline")
    setHistoryLoading(true)
    setHistoryError(null)
    setTimelineLoading(true)
    setTimelineError(null)
    setAuditLoading(true)
    setAuditError(null)
    const [contactResult, auditResult, timelineResult] = await Promise.allSettled([
      listContactoEnviosPorProspecto(prospecto.id, { limit: 50 }),
      listProspectoAudit(prospecto.id, { limit: 100 }),
      listContactoLogs({ prospecto_id: prospecto.id, limit: 100, order: "antiguo" }),
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
    if (timelineResult.status === "fulfilled") {
      setTimelineEntries(timelineResult.value.items ?? [])
    } else {
      const reason = timelineResult.reason
      const message = reason instanceof Error ? reason.message : "No se pudo cargar el timeline."
      setTimelineError(message)
      setTimelineEntries([])
    }
    setHistoryLoading(false)
    setAuditLoading(false)
    setTimelineLoading(false)
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
      const response = await eliminarProspecto(deleteTarget.id)
      const deletedId = response.prospecto_id ?? deleteTarget.id
      const removedCount = items.some((item) => item.id === deletedId) ? 1 : 0
      const nextItems = items.filter((item) => item.id !== deletedId)
      setItems(nextItems)
      setSelected((prev) => {
        if (!prev.has(deletedId)) return prev
        const next = new Set(prev)
        next.delete(deletedId)
        return next
      })
      const nextTotal = Math.max(0, total - removedCount)
      if (removedCount) setTotal(nextTotal)
      if (nextItems.length < limit && offset + nextItems.length < nextTotal) {
        void appendProspectos(offset + nextItems.length, limit - nextItems.length)
      }
      setBanner({
        type: "success",
        message: `${deleteTarget.display_name ?? "El prospecto"} fue eliminado.`,
      })
      setDeleteDialogOpen(false)
      void fetchStageSummary()
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo eliminar el prospecto."
      setDeleteError(message)
    } finally {
      setDeleteLoading(false)
    }
  }, [appendProspectos, deleteTarget, fetchStageSummary, items, limit, offset, total])

  const handleBulkDeleteConfirm = useCallback(async () => {
    if (!selectedIds.length) return
    setBulkDeleteLoading(true)
    setBulkDeleteError(null)
    try {
      const response = await eliminarProspectos(selectedIds)
      const deletedIds = response.prospecto_ids ?? selectedIds
      const deletedSet = new Set(deletedIds)
      const removedCount = items.reduce((acc, item) => (item.id && deletedSet.has(item.id) ? acc + 1 : acc), 0)
      const nextItems = items.filter((item) => !item.id || !deletedSet.has(item.id))
      setItems(nextItems)
      setSelected((prev) => {
        if (!prev.size) return prev
        const next = new Set(prev)
        deletedSet.forEach((id) => next.delete(id))
        return next
      })
      const nextTotal = Math.max(0, total - removedCount)
      if (removedCount) setTotal(nextTotal)
      if (nextItems.length < limit && offset + nextItems.length < nextTotal) {
        void appendProspectos(offset + nextItems.length, limit - nextItems.length)
      }
      setBanner({
        type: "success",
        message: `Se eliminaron ${selectedIds.length} prospecto${selectedIds.length === 1 ? "" : "s"}.`,
      })
      setBulkDeleteDialogOpen(false)
      void fetchStageSummary()
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudieron eliminar los prospectos."
      setBulkDeleteError(message)
    } finally {
      setBulkDeleteLoading(false)
    }
  }, [appendProspectos, fetchStageSummary, items, limit, offset, selectedIds, total])

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

      <section className="rounded-2xl border bg-card/80 p-4 shadow-sm" aria-label="Guía rápida de prospección">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">Flujo recomendado</p>
            <p className="text-base text-muted-foreground">
              Sigue los pasos “Descubre → Enriquecer → Preparar → Lanzar → Evaluar” desde un solo lugar.
            </p>
          </div>
          <Button size="sm" onClick={handlePlannerOpen}>
            <IconSparkles className="mr-1.5 size-4" />
            Preparar envíos
          </Button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {flowSteps.map((step) => {
            const Icon = step.icon
            return (
              <div
                key={step.key}
                className={cn(
                  "flex h-full flex-col rounded-xl border bg-background/70 p-4 text-sm shadow-sm transition",
                  step.isCurrent ? "border-primary shadow-md" : "border-border hover:border-primary/40"
                )}
              >
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
                  <span
                    className={cn(
                      "inline-flex items-center justify-center rounded-full p-1.5",
                      step.isCurrent ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span>{step.title}</span>
                  {step.isCurrent ? <Badge variant="secondary">En esta vista</Badge> : null}
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold">
                    {stageSummaryLoading ? "…" : (step.count ?? 0).toLocaleString("es-MX")}
                  </span>
                  <span className="text-xs text-muted-foreground">en etapa</span>
                </div>
                <p className="mt-2 flex-1 text-muted-foreground">{step.description}</p>
                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{step.meta}</span>
                  <Button asChild variant={step.isCurrent ? "secondary" : "ghost"} size="sm">
                    <Link href={step.actionHref}>{step.actionLabel}</Link>
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <section className="rounded-2xl border bg-card/80 p-4 shadow-sm" aria-label="Últimos envíos">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Últimos lotes programados</p>
            <p className="text-xs text-muted-foreground">
              Consulta rápidamente cómo van las campañas más recientes y abre el monitor detallado si necesitas más
              contexto.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void fetchRecentBatches()}
              disabled={recentBatchLoading}
            >
              <IconRefresh className={cn("mr-1.5 size-4", recentBatchLoading && "animate-spin")} />
              Actualizar
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/prospeccion/contactos">Ver monitor</Link>
            </Button>
          </div>
        </div>
        {recentBatchError ? (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <IconAlertTriangle className="size-4" />
            <span className="flex-1">{recentBatchError}</span>
          </div>
        ) : null}
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {recentBatchLoading && !recentBatches.length ? (
            Array.from({ length: 3 }).map((_, index) => (
              <div
                key={`batch-skeleton-${index}`}
                className="rounded-xl border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground"
              >
                <IconLoader className="mb-1 size-4 animate-spin" />
                Cargando lote...
              </div>
            ))
          ) : recentBatches.length ? (
            recentBatches.map((batch) => (
              <div key={batch.id} className="flex h-full flex-col rounded-xl border bg-background/80 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">
                      {batch.titulo?.trim() || `Lote ${batch.id.slice(0, 8)}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(batch.programado_en ?? batch.creado_en)}
                    </p>
                  </div>
                  <Badge variant={BATCH_STATE_VARIANTS[batch.estado?.toLowerCase() ?? ""] ?? "outline"} className="capitalize">
                    {batchStateLabel(batch.estado)}
                  </Badge>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {(batch.total_prospectos ?? 0).toLocaleString("es-MX")} prospectos ·{" "}
                  {(batch.canales ?? []).map((canal) => CANAL_LABELS[canal as keyof typeof CANAL_LABELS] ?? canal).join(", ") ||
                    "Sin canales"}
                </p>
                {batch.metadata && typeof batch.metadata["campana_nombre"] === "string" ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Campaña: {String(batch.metadata["campana_nombre"])}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {(batch.canales ?? []).map((canal) => (
                    <Badge key={`${batch.id}-${canal}`} variant="outline" className="text-[11px]">
                      {CANAL_LABELS[canal as keyof typeof CANAL_LABELS] ?? canal}
                    </Badge>
                  ))}
                </div>
                <div className="mt-4 flex flex-1 items-end justify-between text-xs text-muted-foreground">
                  <span>ID: {batch.id.slice(0, 8)}</span>
                  <Button asChild variant="ghost" size="sm" className="text-xs">
                    <Link href="/prospeccion/contactos">Ver detalle</Link>
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
              No hay envíos recientes. Crea una campaña desde “Preparar envíos” para verla aquí.
            </div>
          )}
        </div>
      </section>

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
              <Label className="flex items-center gap-1">
                <IconCalendar className="size-3" />
                Fecha
              </Label>
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={filters.dateOption || "all"}
                  onValueChange={(value) =>
                    setFilters((prev) => {
                      const nextOption = value === "all" ? "" : (value as DateRangeOption)
                      return {
                        ...prev,
                        dateOption: nextOption,
                        customDateFrom: nextOption === "custom" ? prev.customDateFrom : "",
                        customDateTo: nextOption === "custom" ? prev.customDateTo : "",
                      }
                    })
                  }
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {DATE_RANGE_SELECT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {filters.dateOption === "custom" && (
                  <div className="flex flex-wrap gap-2">
                    <Input
                      type="date"
                      value={filters.customDateFrom}
                      onChange={(event) =>
                        setFilters((prev) => ({ ...prev, customDateFrom: event.target.value }))
                      }
                      className="w-[150px]"
                      placeholder="Desde"
                    />
                    <Input
                      type="date"
                      value={filters.customDateTo}
                      onChange={(event) =>
                        setFilters((prev) => ({ ...prev, customDateTo: event.target.value }))
                      }
                      className="w-[150px]"
                      placeholder="Hasta"
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-1">
              <Label>Consulta</Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-w-[220px] justify-between text-sm normal-case"
                  >
                    <span className="max-w-[160px] truncate text-left text-sm">
                      {filters.queryFilters.length
                        ? filters.queryFilters
                            .map((value) => queryOptions.find((option) => option.value === value)?.label ?? value)
                            .join(", ")
                        : QUERY_FILTER_PLACEHOLDER}
                    </span>
                    <IconChevronDown className="size-4 opacity-70" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[260px]">
                {queryOptionsLoading ? (
                  <div className="px-3 py-2 text-xs text-muted-foreground">Cargando consultas …</div>
                ) : queryOptions.length ? (
                  queryOptions.map((option) => (
                    <DropdownMenuCheckboxItem
                      key={option.value}
                      checked={filters.queryFilters.includes(option.value)}
                      onCheckedChange={(checked) => handleQueryFilterToggle(option.value, Boolean(checked))}
                    >
                      {option.label}
                    </DropdownMenuCheckboxItem>
                  ))
                ) : (
                  <div className="px-3 py-2 text-xs text-muted-foreground">No hay consultas registradas.</div>
                )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="space-y-1">
              <Label>Actividad</Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-w-[220px] justify-between text-sm normal-case"
                  >
                    <span className="max-w-[160px] truncate text-left text-sm">
                      {filters.actividadFilters.length ? filters.actividadFilters.join(", ") : ACTIVITY_FILTER_PLACEHOLDER}
                    </span>
                    <IconChevronDown className="size-4 opacity-70" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[260px]">
                  {activityOptionsLoading ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground">Cargando actividades …</div>
                  ) : activityOptions.length ? (
                    activityOptions.map((option) => (
                      <DropdownMenuCheckboxItem
                        key={option}
                        checked={filters.actividadFilters.includes(option)}
                        onCheckedChange={(checked) => handleActividadFilterToggle(option, Boolean(checked))}
                      >
                        {option}
                      </DropdownMenuCheckboxItem>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      No hay actividades registradas.
                    </div>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="space-y-1">
              <Label>Datos de contacto</Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-w-[220px] justify-between text-sm normal-case"
                  >
                    <span className="max-w-[160px] truncate text-left text-sm">
                      {filters.contactFilters.length
                        ? filters.contactFilters.map((filterKey) => CONTACT_FILTER_LABELS[filterKey]).join(", ")
                        : CONTACT_FILTER_PLACEHOLDER}
                    </span>
                    <IconChevronDown className="size-4 opacity-70" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[220px]">
                  {CONTACT_FILTER_OPTIONS.map((option) => (
                    <DropdownMenuCheckboxItem
                      key={option.value}
                      checked={filters.contactFilters.includes(option.value)}
                      onCheckedChange={(checked) => handleContactFilterToggle(option.value, Boolean(checked))}
                    >
                      {option.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
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
            <DrawerTitle>Preparar campaña</DrawerTitle>
            <DrawerDescription>
              Todo envío se ejecuta como campaña con plantillas por canal para mantener trazabilidad completa.
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
            <div className="mt-4 space-y-4">
              <div className="rounded-lg border bg-background p-4">
                <p className="text-sm font-semibold">1) Selecciona campaña activa</p>
                <div className="mt-2 space-y-2">
                  <Select
                    value={plannerCampaignId}
                    onValueChange={setPlannerCampaignId}
                    disabled={plannerCampaignsLoading || !plannerCampaignOptions.length}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          plannerCampaignsLoading
                            ? "Cargando campañas..."
                            : plannerCampaignOptions.length
                              ? "Selecciona campaña"
                              : "No hay campañas activas"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {plannerCampaignOptions.map((campaign) => (
                        <SelectItem key={campaign.id} value={campaign.id}>
                          {campaign.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Las plantillas se toman de la campaña seleccionada.
                  </p>
                </div>
              </div>
              <div className="rounded-lg border bg-background p-4">
                <p className="text-sm font-semibold">2) Selecciona plantillas por canal</p>
                <div className="mt-2 grid gap-3 md:grid-cols-3">
                  {(["correo", "whatsapp", "llamada"] as const).map((canal) => (
                    <div key={`planner-template-${canal}`} className="space-y-1">
                      <Label className="capitalize">{canal}</Label>
                      <Select
                        value={plannerTemplateSelection[canal]}
                        onValueChange={(value) =>
                          setPlannerTemplateSelection((prev) => ({
                            ...prev,
                            [canal]: value,
                          }))
                        }
                        disabled={plannerTemplatesLoading || !plannerCampaignId}
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              plannerTemplatesLoading
                                ? "Cargando..."
                                : `Sin plantilla ${canal}`
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {plannerTemplates
                            .filter((tpl) => tpl.canal === canal)
                            .map((tpl) => (
                              <SelectItem key={tpl.id} value={tpl.id}>
                                {tpl.nombre}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border bg-background p-4">
                <p className="text-sm font-semibold">3) Configura programación y separación</p>
                <div className="mt-2 grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Programar lote (opcional)</Label>
                    <div className="space-y-2">
                      <Select
                        value={plannerScheduleMode}
                        onValueChange={(value) => setPlannerScheduleMode(value as "ahora" | "programado")}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ahora">Ejecutar ahora</SelectItem>
                          <SelectItem value="programado">Programar fecha y hora</SelectItem>
                        </SelectContent>
                      </Select>
                      {plannerScheduleMode === "programado" ? (
                        <div className="relative flex items-center gap-2">
                          <input
                            ref={plannerDateInputRef}
                            type="date"
                            value={plannerScheduleDate}
                            onChange={(event) => setPlannerScheduleDate(event.target.value)}
                            className="pointer-events-none absolute h-0 w-0 opacity-0"
                            tabIndex={-1}
                            aria-hidden="true"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={openPlannerDatePicker}
                            aria-label="Abrir calendario"
                          >
                            <IconCalendar className="size-4" />
                          </Button>
                          <Input
                            type="text"
                            className="min-w-[11rem] flex-1"
                            value={plannerScheduleDate}
                            readOnly
                            onClick={openPlannerDatePicker}
                          />
                          <Input
                            type="time"
                            className="w-24"
                            value={plannerScheduleTime}
                            onChange={(event) => setPlannerScheduleTime(event.target.value)}
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>Separación entre envíos</Label>
                    <Input
                      type="number"
                      min={0}
                      max={3600}
                      step={1}
                      className="w-32"
                      value={plannerSeparationSeconds}
                      onChange={(event) => setPlannerSeparationSeconds(event.target.value)}
                    />
                  </div>
                </div>
              </div>
              <div className="rounded-lg border bg-muted/20 p-4 text-sm">
                <p className="font-semibold">4) Ejecutar lote</p>
                <p className="mt-1 text-muted-foreground">
                  Se ejecutará sobre los prospectos seleccionados con las plantillas de la campaña.
                </p>
              </div>
            </div>
            <div className="mt-6 rounded-2xl border bg-muted/20 p-4 text-sm">
              <p className="font-semibold">¿Qué sucederá después?</p>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-muted-foreground">
                <li>Se creará un lote con seguimiento en Campañas y Contactos.</li>
                <li>Podrás monitorear estados de envío en la vista de Contactos.</li>
              </ul>
            </div>
            {plannerError ? <p className="mt-4 text-sm text-destructive">{plannerError}</p> : null}
          </div>
          <DrawerFooter className="flex flex-wrap items-center justify-between gap-3 border-t border-border/40 bg-background/80">
            <Button variant="outline" onClick={() => handlePlannerOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void handlePlannerContinue()} disabled={plannerExecuting || plannerCampaignsLoading || !selectedCount}>
              <>
                {plannerExecuting ? <IconLoader className="mr-2 size-4 animate-spin" /> : <IconTargetArrow className="mr-2 size-4" />}
                Ejecutar lote
              </>
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
      <section id="prospectos" className="overflow-hidden rounded-lg border bg-card shadow-sm">
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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    Columnas
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {DEFAULT_TABLE_COLUMN_ORDER.map((columnId) => (
                    <DropdownMenuCheckboxItem
                      key={columnId}
                      checked={columnVisibility[columnId] !== false}
                      onCheckedChange={(checked) => toggleColumnVisibility(columnId, checked === true)}
                    >
                      {TABLE_COLUMN_META[columnId].label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleVerify()}
                disabled={!selectedCount || action === "lookup"}
              >
                <IconPhoneCheck className={cn("mr-1.5 size-4", action === "lookup" && "animate-spin")} />
                Verificar teléfonos
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleScraperSelected()}
                disabled={!selectedCount || checklistAction === "scraper"}
              >
                <IconWorldSearch
                  className={cn("mr-1.5 size-4", checklistAction === "scraper" && "animate-spin")}
                />
                Scraper seleccionados
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
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setBulkDeleteDialogOpen(true)}
              disabled={!selectedCount}
            >
              <IconTrash className="mr-1.5 size-4" />
              Eliminar seleccionados
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
            <Table className="text-[11px]">
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
                  {visibleColumns.map((columnId) => {
                    const meta = TABLE_COLUMN_META[columnId]
                    const isSorted = tableSort.key === columnId
                    return (
                      <TableHead
                        key={columnId}
                        className={cn(meta.widthClass, "text-[10px] font-bold uppercase tracking-wide")}
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.setData("text/plain", columnId)
                          event.dataTransfer.effectAllowed = "move"
                        }}
                        onDragOver={(event) => {
                          event.preventDefault()
                          event.dataTransfer.dropEffect = "move"
                        }}
                        onDrop={(event) => {
                          event.preventDefault()
                          const dragged = event.dataTransfer.getData("text/plain") as ProspectTableColumnId
                          if (!dragged) return
                          moveTableColumn(dragged, columnId)
                        }}
                      >
                        <button type="button" onClick={() => toggleTableSort(columnId)}>
                          {meta.label} {isSorted ? (tableSort.direction === "asc" ? "↑" : "↓") : ""}
                        </button>
                      </TableHead>
                    )
                  })}
                  <TableHead className="w-14 text-right text-[10px] font-bold uppercase tracking-wide">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={visibleColumnsCount + 2} className="py-10 text-center text-sm text-muted-foreground">
                      <IconLoader className="mr-2 inline size-4 animate-spin" />
                      Cargando prospectos...
                    </TableCell>
                  </TableRow>
                ) : null}
                {!loading && !items.length ? (
                  <TableRow>
                    <TableCell colSpan={visibleColumnsCount + 2} className="py-10 text-center text-sm text-muted-foreground">
                      No hay prospectos con los filtros actuales.
                    </TableCell>
                  </TableRow>
                ) : null}
                {!loading
                  ? sortedItems.map((prospecto) => {
                      const notas = extractProspectoNotes(prospecto.metadata)
                      const campaignName = extractProspectoCampaignName(prospecto.metadata)
                      const indicator = prospecto.id ? contactIndicators[prospecto.id] : undefined
                      const hasEnvios = (indicator?.total_envios ?? 0) > 0
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
                          {visibleColumns.map((columnId) => {
                            switch (columnId) {
                              case "prospecto":
                                return (
                                  <TableCell key={columnId}>
                                    <div className="max-w-[220px] truncate text-[11px] font-medium" title={prospecto.display_name || "Sin nombre"}>
                                      {prospecto.display_name || "Sin nombre"}
                                    </div>
                                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                      {prospecto.actividad ? (
                                        <span className="block max-w-[200px] truncate" title={prospecto.actividad}>
                                          {prospecto.actividad}
                                        </span>
                                      ) : null}
                                      {prospecto.segmento ? (
                                        <Badge variant="outline" className="text-[10px]">
                                          {prospecto.segmento}
                                        </Badge>
                                      ) : null}
                                    </div>
                                    {prospecto.address ? (
                                      <p className="mt-1 max-w-[220px] truncate text-xs text-muted-foreground" title={prospecto.address}>
                                        {prospecto.address}
                                      </p>
                                    ) : null}
                                    {notas ? (
                                      <p className="mt-1 max-w-[220px] truncate text-xs text-muted-foreground" title={`Notas: ${notas}`}>
                                        Notas: {notas}
                                      </p>
                                    ) : null}
                                  </TableCell>
                                )
                              case "correo": {
                                const email = (prospecto.email || "").trim()
                                const normalizedEmail = email ? email.toLowerCase() : ""
                                return (
                                  <TableCell key={columnId}>
                                    <span className="block max-w-[160px] truncate text-[11px]" title={normalizedEmail || "—"}>
                                      {normalizedEmail || "—"}
                                    </span>
                                  </TableCell>
                                )
                              }
                              case "sitio_web": {
                                const websiteLabel = (prospecto.website || "").trim()
                                const websiteHref = buildWebsiteHref(websiteLabel)
                                return (
                                  <TableCell key={columnId}>
                                    {!websiteLabel || !websiteHref ? (
                                      <span className="text-[11px] text-muted-foreground">—</span>
                                    ) : (
                                      <a
                                        href={websiteHref}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                                        title={websiteLabel}
                                      >
                                        <IconWorldSearch className="size-3.5" />
                                        Sitio web
                                      </a>
                                    )}
                                  </TableCell>
                                )
                              }
                              case "telefono":
                                return (
                                  <TableCell key={columnId}>
                                    <span className="text-[11px]">{prospecto.phone_e164 || prospecto.phone || "—"}</span>
                                  </TableCell>
                                )
                              case "tipo_linea":
                                return (
                                  <TableCell key={columnId}>
                                    <span className="text-[11px]">{prospecto.carrier_type ? carrierLabel(prospecto.carrier_type) : "—"}</span>
                                  </TableCell>
                                )
                              case "telefono_verificado":
                                return (
                                  <TableCell key={columnId}>
                                    <LookupStatusBadge status={prospecto.lookup_status} className="text-[10px]" />
                                  </TableCell>
                                )
                              case "fuente":
                                return (
                                  <TableCell key={columnId}>
                                    <Badge variant="outline" className="text-[10px]">
                                      {FUENTE_LABELS[prospecto.fuente] ?? prospecto.fuente}
                                    </Badge>
                                  </TableCell>
                                )
                              case "tamano_rating":
                                return (
                                  <TableCell key={columnId}>
                                    {typeof prospecto.rating === "number" ? (
                                      <Badge variant="secondary" className="text-[10px]">⭐ {prospecto.rating.toFixed(1)}</Badge>
                                    ) : prospecto.estrato ? (
                                      <Badge variant="outline" className="text-[10px]">{prospecto.estrato}</Badge>
                                    ) : prospecto.segmento ? (
                                      <Badge variant="outline" className="text-[10px]">{prospecto.segmento}</Badge>
                                    ) : (
                                      <span className="text-[11px] text-muted-foreground">—</span>
                                    )}
                                  </TableCell>
                                )
                              case "campana":
                                return (
                                  <TableCell key={columnId}>
                                    <span className="text-[11px]">{campaignName || (hasEnvios ? "Sí" : "No")}</span>
                                  </TableCell>
                                )
                              case "con_envio":
                                return (
                                  <TableCell key={columnId}>
                                    <span className="text-[11px]">{hasEnvios ? "Sí" : "No"}</span>
                                  </TableCell>
                                )
                              case "creado":
                                return (
                                  <TableCell key={columnId} className="text-right text-xs text-muted-foreground">
                                    {formatDate(prospecto.creado_en)}
                                  </TableCell>
                                )
                              default:
                                return null
                            }
                          })}
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

      <Dialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar prospectos seleccionados</DialogTitle>
            <DialogDescription>
              Esta acción no se puede deshacer. Se eliminarán los prospectos seleccionados y todo su historial.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            ¿Deseas eliminar{" "}
            <span className="font-semibold text-foreground">
              {selectedCount} prospecto{selectedCount === 1 ? "" : "s"}
            </span>
            ?
          </p>
          {bulkDeleteError ? <p className="text-sm text-destructive">{bulkDeleteError}</p> : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBulkDeleteDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleBulkDeleteConfirm()}
              disabled={bulkDeleteLoading}
            >
              {bulkDeleteLoading ? (
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
          <Tabs
            value={historyTab}
            onValueChange={(value) => setHistoryTab(value as "timeline" | "envios" | "audit")}
            className="mt-4"
          >
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
              <TabsTrigger value="envios">Envíos</TabsTrigger>
              <TabsTrigger value="audit">Auditoría</TabsTrigger>
            </TabsList>
            <TabsContent value="timeline" className="mt-4">
              {timelineError ? (
                <p className="text-sm text-destructive">{timelineError}</p>
              ) : (
                <div className="max-h-[50vh] space-y-3 overflow-y-auto">
                  {timelineLoading ? (
                    <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                      <IconLoader className="size-4 animate-spin" />
                      Cargando timeline...
                    </p>
                  ) : null}
                  {!timelineLoading && !timelineEntries.length ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">Sin eventos registrados.</p>
                  ) : null}
                  {!timelineLoading
                    ? timelineEntries.map((entry) => (
                        <div key={entry.id} className="rounded-lg border bg-muted/30 p-3 text-sm shadow-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <Badge variant={contactStatusVariant(entry.estado)}>
                              {contactStatusLabel(entry.estado)}
                            </Badge>
                            <span className="text-xs text-muted-foreground">{formatDate(entry.creado_en)}</span>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {canalLabel(entry.canal)} · {formatContactLogDetail(entry)}
                          </p>
                          {entry.error ? (
                            <p className="mt-1 text-xs text-destructive">Error: {entry.error}</p>
                          ) : null}
                        </div>
                      ))
                    : null}
                </div>
              )}
            </TabsContent>
            <TabsContent value="envios" className="mt-4">
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

function LookupStatusBadge({ status, className }: { status?: string | null; className?: string }) {
  if (!status) {
    return <Badge variant="secondary" className={className}>Pendiente</Badge>
  }
  const normalized = status.toLowerCase()
  const label = LOOKUP_STATUS_LABELS[normalized] ?? status
  const variant = LOOKUP_STATUS_VARIANTS[normalized] ?? "secondary"
  return <Badge variant={variant} className={className}>{label}</Badge>
}

function formatDate(value?: string | null) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return DATE_TIME_FORMATTER.format(date)
}

function formatContactLogDetail(entry: ContactoLog) {
  const detail = isRecord(entry.detalle) ? entry.detalle : {}
  const parts: string[] = []
  const candidates = ["status", "reason", "email", "phone", "telefono", "action", "detail"]
  for (const key of candidates) {
    const raw = detail[key]
    if (typeof raw === "string" && raw.trim().length) {
      parts.push(raw.trim())
    }
  }
  const sid = detail["sid"]
  if (typeof sid === "string" && sid.trim().length) {
    parts.push(`SID ${sid.trim()}`)
  } else if (entry.envio_id) {
    parts.push(`Envio ${String(entry.envio_id).slice(0, 8)}`)
  }
  return parts.length ? parts.join(" · ") : "—"
}

function batchStateLabel(value?: string | null) {
  if (!value) return "Desconocido"
  const normalized = value.toLowerCase()
  switch (normalized) {
    case "pendiente":
      return "Pendiente"
    case "procesando":
      return "Procesando"
    case "completado":
      return "Completado"
    case "cancelado":
      return "Cancelado"
    case "error":
      return "Error"
    case "fallido":
      return "Fallido"
    case "enviado":
      return "Enviado"
    default:
      return normalized.charAt(0).toUpperCase() + normalized.slice(1)
  }
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
      <Card id="checklist">
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

function buildWebsiteHref(value: string | null | undefined): string | null {
  const raw = (value || "").trim()
  if (!raw) return null
  try {
    const absolute = new URL(raw)
    return absolute.toString()
  } catch {
    try {
      const prefixed = new URL(`https://${raw}`)
      return prefixed.toString()
    } catch {
      return null
    }
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

function extractProspectoCampaignName(metadata: unknown): string | null {
  if (!isRecord(metadata)) {
    return null
  }
  for (const key of ["campana_nombre", "campaign_name", "campana", "campaign"] as const) {
    const value = metadata[key]
    if (typeof value === "string") {
      const trimmed = value.trim()
      if (trimmed.length) {
        return trimmed
      }
    }
  }
  return null
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
