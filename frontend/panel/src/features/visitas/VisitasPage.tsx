import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import {
  AlertCircle,
  InfoIcon,
  Clock,
  Globe,
  Mail,
  Phone,
  MonitorSmartphone,
  Command as CommandIcon,
  Sparkles,
  RefreshCw,
  Filter,
  Calendar,
  MessageCircle,
  MapPin,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSupabaseSession } from '@/hooks/useSupabaseSession'
import { fetchVisitas } from '@/services/visitas'
import type { VisitaRow } from '@/types/visitas'

const LIMIT = 50
const COLUMN_COUNT = 15
const COLUMN_MIN_WIDTH = 120
const SKELETON_WIDTHS = [
  'w-32',
  'w-28',
  'w-16',
  'w-36',
  'w-40',
  'w-20',
  'w-20',
  'w-28',
  'w-48',
  'w-28',
  'w-24',
  'w-28',
  'w-36',
  'w-40',
  'w-40',
] as const

const RANGE_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'hoy', label: 'Hoy' },
  { value: 'ayer', label: 'Ayer' },
  { value: '7d', label: 'Últimos 7 días' },
  { value: '30d', label: 'Últimos 30 días' },
] as const

const CHAT_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'with', label: 'Con chat' },
  { value: 'without', label: 'Sin chat' },
] as const

const MEXICO_STATE_LABELS: Record<string, string> = {
  '01': 'Aguascalientes',
  '02': 'Baja California',
  '03': 'Baja California Sur',
  '04': 'Campeche',
  '05': 'Coahuila de Zaragoza',
  '06': 'Colima',
  '07': 'Chiapas',
  '08': 'Chihuahua',
  '09': 'Ciudad de México',
  '10': 'Durango',
  '11': 'Guanajuato',
  '12': 'Guerrero',
  '13': 'Hidalgo',
  '14': 'Jalisco',
  '15': 'Estado de México',
  '16': 'Michoacán de Ocampo',
  '17': 'Morelos',
  '18': 'Nayarit',
  '19': 'Nuevo León',
  '20': 'Oaxaca',
  '21': 'Puebla',
  '22': 'Querétaro',
  '23': 'Quintana Roo',
  '24': 'San Luis Potosí',
  '25': 'Sinaloa',
  '26': 'Sonora',
  '27': 'Tabasco',
  '28': 'Tamaulipas',
  '29': 'Tlaxcala',
  '30': 'Veracruz de Ignacio de la Llave',
  '31': 'Yucatán',
  '32': 'Zacatecas',
  AGU: 'Aguascalientes',
  BCN: 'Baja California',
  BCS: 'Baja California Sur',
  CAM: 'Campeche',
  COA: 'Coahuila de Zaragoza',
  COL: 'Colima',
  CHP: 'Chiapas',
  CHH: 'Chihuahua',
  CMX: 'Ciudad de México',
  CDMX: 'Ciudad de México',
  DF: 'Ciudad de México',
  DUR: 'Durango',
  GUA: 'Guanajuato',
  GRO: 'Guerrero',
  HID: 'Hidalgo',
  JAL: 'Jalisco',
  MEX: 'Estado de México',
  MIC: 'Michoacán de Ocampo',
  MOR: 'Morelos',
  NAY: 'Nayarit',
  NLE: 'Nuevo León',
  OAX: 'Oaxaca',
  PUE: 'Puebla',
  QUE: 'Querétaro',
  ROO: 'Quintana Roo',
  SLP: 'San Luis Potosí',
  SIN: 'Sinaloa',
  SON: 'Sonora',
  TAB: 'Tabasco',
  TAM: 'Tamaulipas',
  TLA: 'Tlaxcala',
  VER: 'Veracruz de Ignacio de la Llave',
  YUC: 'Yucatán',
  ZAC: 'Zacatecas',
}

type RangeOption = 'all' | 'hoy' | 'ayer' | '7d' | '30d'

type Filters = {
  rango: RangeOption
  conChat: 'all' | 'with' | 'without'
  estado: string
  country: string
  city: string
  search: string
}

type ChatTotals = {
  conChat: number
  sinChat: number
}

const DEFAULT_FILTERS: Filters = {
  rango: '7d',
  conChat: 'all',
  estado: '',
  country: '',
  city: '',
  search: '',
}

const numberFormatter = new Intl.NumberFormat('es-MX')
const dateFormatter = new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'short',
  timeStyle: 'short',
})

function formatDateTime(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date)
}

function formatDuration(seconds?: number | null): string {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return '—'
  const total = Math.floor(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  const parts: string[] = []
  if (hours) parts.push(`${hours}h`)
  if (minutes) parts.push(`${minutes}m`)
  if (!hours && secs) parts.push(`${secs}s`)
  if (!parts.length) parts.push('0s')
  return parts.join(' ')
}

function formatContact(row: VisitaRow): string {
  const parts: string[] = []
  if (row.contacto_nombre) parts.push(row.contacto_nombre)
  const sub: string[] = []
  if (row.contacto_correo) sub.push(row.contacto_correo)
  if (row.contacto_telefono) sub.push(row.contacto_telefono)
  if (sub.length) parts.push(sub.join(' · '))
  return parts.join('\n') || 'Sin contacto'
}

function formatCountry(row: VisitaRow): string {
  const code = row.country_code?.toUpperCase() ?? ''
  const name = row.country_name ?? code
  if (!name) return 'Sin datos'
  return code && name.toUpperCase() !== code ? `${name} (${code})` : name
}

function formatState(row: VisitaRow): string {
  return row.state_name || 'Sin datos'
}

function formatCity(row: VisitaRow): string {
  return row.city_name || 'Sin datos'
}

function formatDevice(row: VisitaRow): string {
  const pieces: string[] = []
  if (row.device_type) pieces.push(row.device_type)
  const info = row.dispositivo_cache as Record<string, unknown> | undefined
  const platform = row.sistema_operativo || (info?.plataforma as string | undefined)
  if (platform) pieces.push(String(platform))
  const pantalla = (row.pantalla_cache ||
    (info?.pantalla as Record<string, unknown> | undefined)) as
    | Record<string, unknown>
    | undefined
  if (pantalla) {
    const width = pantalla.width as number | undefined
    const height = pantalla.height as number | undefined
    const ratio = pantalla.pixel_ratio as number | undefined
    const sizeParts: string[] = []
    if (width && height) sizeParts.push(`${width}×${height}`)
    if (ratio) sizeParts.push(`@${ratio}x`)
    if (sizeParts.length) pieces.push(sizeParts.join(' '))
  }
  return pieces.join(' • ') || 'Sin datos'
}

function captureBadgeFromValue(value?: string | null): ReactNode | null {
  if (!value) return null
  const normalized = value.toLowerCase()

  if (normalized === 'completo') {
    return (
      <Badge
        variant="secondary"
        className="border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
      >
        Contacto completo
      </Badge>
    )
  }

  if (normalized === 'incompleto') {
    return (
      <Badge
        variant="outline"
        className="border-amber-500/40 bg-amber-500/10 text-amber-200"
      >
        Contacto incompleto
      </Badge>
    )
  }

  return (
    <Badge variant="outline" className="border-border text-muted-foreground">
      {value}
    </Badge>
  )
}

type GeoOption = {
  value: string
  label: string
  subtitle?: string
  country?: string
  state?: string
}

const headers = [
  'Sesión',
  'IP',
  'Visitas',
  'Primera visita',
  'Último evento',
  'Tiempo estancia',
  'Estancia promedio',
  'Chat',
  'Contacto',
  'País',
  'Estado',
  'Ciudad',
  'Dispositivo',
  'Referrer',
  'Landing',
]

const HEADER_TOOLTIPS: Record<string, string> = {
  'Tiempo estancia': 'Tiempo total entre el registro y el cierre de la sesión, en una sola visita.',
  'Estancia promedio': 'Promedio de tiempo por visita calculado en función del número total de visitas registradas.',
  'Último evento': 'Última interacción detectada para la sesión, incluyendo el momento de cierre si existe.',
}

export function VisitasPage() {
  const { loading: sessionLoading } = useSupabaseSession()
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [formValues, setFormValues] = useState<Filters>(DEFAULT_FILTERS)
  const [page, setPage] = useState(0)
  const [refreshToken, setRefreshToken] = useState(0)
  const [items, setItems] = useState<VisitaRow[]>([])
  const [total, setTotal] = useState(0)
  const [isFetching, setIsFetching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [chatTotals, setChatTotals] = useState<ChatTotals>({ conChat: 0, sinChat: 0 })
  const [commandOpen, setCommandOpen] = useState(false)
  const [geoPopoverOpen, setGeoPopoverOpen] = useState(false)
  const [columnWidths, setColumnWidths] = useState<(number | undefined)[]>(
    Array(COLUMN_COUNT).fill(undefined),
  )
  const columnWidthsRef = useRef(columnWidths)
  const [selectedVisit, setSelectedVisit] = useState<VisitaRow | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const setRangeFilter = useCallback((value: RangeOption) => {
    setFilters((current) => {
      if (current.rango === value) return current
      return { ...current, rango: value }
    })
  }, [])
  const setChatFilter = useCallback((value: Filters['conChat']) => {
    setFilters((current) => {
      if (current.conChat === value) return current
      return { ...current, conChat: value }
    })
  }, [])
  const handleCountryFilter = useCallback((value: string | null) => {
    const nextCountry = value ?? ''
    setFilters((current) => {
      if (current.country === nextCountry && current.estado === '' && current.city === '') return current
      return {
        ...current,
        country: nextCountry,
        estado: '',
        city: '',
      }
    })
    setFormValues((current) => ({
      ...current,
      country: nextCountry,
      estado: '',
      city: '',
    }))
  }, [])
  const handleStateFilter = useCallback((value: string | null) => {
    const nextState = value ?? ''
    setFilters((current) => {
      if (current.estado === nextState && current.city === '') return current
      return {
        ...current,
        estado: nextState,
        city: '',
      }
    })
    setFormValues((current) => ({
      ...current,
      estado: nextState,
      city: '',
    }))
  }, [])
  const handleCityFilter = useCallback((value: string | null) => {
    const nextCity = value ?? ''
    setFilters((current) => {
      if (current.city === nextCity) return current
      return {
        ...current,
        city: nextCity,
      }
    })
    setFormValues((current) => ({
      ...current,
      city: nextCity,
    }))
  }, [])
  const handleClearGeoFilters = useCallback(() => {
    handleCountryFilter(null)
    handleStateFilter(null)
    handleCityFilter(null)
  }, [handleCountryFilter, handleStateFilter, handleCityFilter])

  const handleOpenDetails = useCallback((visit: VisitaRow) => {
    setSelectedVisit(visit)
  }, [])

  const handleCloseDetails = useCallback(() => {
    setSelectedVisit(null)
  }, [])

  useEffect(() => {
    columnWidthsRef.current = columnWidths
  }, [columnWidths])

  useEffect(() => {
    setFormValues(filters)
    setPage(0)
  }, [filters])

  const offset = page * LIMIT
  const hasData = items.length > 0
  const pagerStart = total > 0 ? offset + 1 : 0
  const pagerEnd = total > 0 ? Math.min(offset + items.length, total) : 0
  const canGoPrev = page > 0
  const canGoNext = offset + LIMIT < total

  useEffect(() => {
    if (sessionLoading) return
    let cancelled = false
    const fetchData = async () => {
      setIsFetching(true)
      setError(null)
      try {
        const data = await fetchVisitas({
          limit: LIMIT,
          offset,
          rango: filters.rango,
          conChat: filters.conChat,
          estado: filters.estado || undefined,
          country: filters.country || undefined,
          city: filters.city || undefined,
          search: filters.search || undefined,
        })

        if (page > 0 && data.total > 0 && offset >= data.total) {
          const lastPage = Math.max(Math.ceil(data.total / LIMIT) - 1, 0)
          setPage(lastPage)
          return
        }

        if (!cancelled) {
          setItems(data.items)
          setTotal(data.total)
          setChatTotals(data.totals)
        }
      } catch (err) {
        console.error('[visitas] fetch error', err)
        if (!cancelled) {
          setItems([])
          setTotal(0)
          setChatTotals({ conChat: 0, sinChat: 0 })
          setError(
            err instanceof Error && err.message
              ? err.message
              : 'No fue posible cargar las visitas.',
          )
        }
      } finally {
        if (!cancelled) {
          setIsFetching(false)
        }
      }
    }

    fetchData()

    return () => {
      cancelled = true
    }
  }, [sessionLoading, filters, offset, page, refreshToken])

  const handleResizeStart = useCallback(
    (index: number) => (event: React.MouseEvent<HTMLSpanElement>) => {
      event.preventDefault()
      event.stopPropagation()
      const header = event.currentTarget.parentElement as HTMLElement | null
      if (!header) return

      const startX = event.clientX
      const startWidth = header.getBoundingClientRect().width

      const onMouseMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientX - startX
        const nextWidth = Math.max(COLUMN_MIN_WIDTH, Math.round(startWidth + delta))
        setColumnWidths((prev) => {
          const draft = [...prev]
          draft[index] = nextWidth
          return draft
        })
      }

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove)
        header.classList.remove('is-resizing')
        document.body.classList.remove('select-none')
      }

      header.classList.add('is-resizing')
      document.body.classList.add('select-none')
      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp, { once: true })
    },
    [],
  )

  const columnStyle = useCallback(
    (index: number): CSSProperties => {
      const width = columnWidthsRef.current[index]
      if (!width) return {}
      return { width, minWidth: width, maxWidth: width }
    },
    [],
  )

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFilters({ ...formValues })
    setPage(0)
  }

  const handleReset = () => {
    setFilters(DEFAULT_FILTERS)
    setFormValues(DEFAULT_FILTERS)
    setColumnWidths(Array(COLUMN_COUNT).fill(undefined))
    setPage(0)
  }

  const handleRefresh = () => {
    setRefreshToken((token) => token + 1)
  }

  const handlePrevPage = () => {
    if (!canGoPrev) return
    setPage((prev) => Math.max(prev - 1, 0))
  }

  const handleNextPage = () => {
    if (!canGoNext) return
    setPage((prev) => prev + 1)
  }

  const loadingState = sessionLoading || isFetching
  const showEmptyState = !loadingState && !error && !hasData
  const resultsLabel = numberFormatter.format(total)
  const detailsOpen = Boolean(selectedVisit)
  const selectedCaptureBadge = selectedVisit
    ? captureBadgeFromValue(selectedVisit.contacto_captura)
    : null
  const lastEventContent = useMemo(
    () =>
      items.map((row) => {
        const parts: string[] = []
        parts.push(formatDateTime(row.ultimo_evento_en))
        if (row.closed_at) {
          parts.push(`Cierre: ${formatDateTime(row.closed_at)}`)
        }
        return parts.join('\n')
      }),
    [items],
  )
  const showTotalsSkeleton = loadingState && !hasData
  const dimTotals = isFetching && hasData
  const chatFilterLabel = useMemo(() => {
    const option = CHAT_OPTIONS.find((item) => item.value === filters.conChat)
    return option?.label ?? 'Todos'
  }, [filters.conChat])
  const countryOptions = useMemo<GeoOption[]>(() => {
    const map = new Map<string, GeoOption>()
    items.forEach((row) => {
      const code = typeof row.country_code === 'string' ? row.country_code.trim().toUpperCase() : ''
      const name = typeof row.country_name === 'string' ? row.country_name.trim() : ''
      const value = code || name
      if (!value) return
      if (!map.has(value)) {
        map.set(value, {
          value,
          label: name || value,
          subtitle: code && name && code !== name.toUpperCase() ? code : undefined,
          country: value,
        })
      }
    })
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, 'es'))
  }, [items])
  const stateOptions = useMemo<GeoOption[]>(() => {
    const map = new Map<string, GeoOption>()
    items.forEach((row) => {
      const value = typeof row.cve_ent === 'string' && row.cve_ent.trim()
        ? row.cve_ent.trim()
        : typeof row.state_code === 'string' && row.state_code.trim()
          ? row.state_code.trim()
          : undefined
      const label = typeof row.state_name === 'string' && row.state_name.trim()
        ? row.state_name.trim()
        : typeof row.nom_ent === 'string' && row.nom_ent.trim()
          ? row.nom_ent.trim()
          : value
      if (!value || !label) return
      if (!map.has(value)) {
        map.set(value, {
          value,
          label,
          subtitle: typeof row.country_name === 'string' ? row.country_name.trim() || undefined : undefined,
          country: typeof row.country_code === 'string' ? row.country_code.trim().toUpperCase() || undefined : undefined,
        })
      }
    })
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, 'es'))
  }, [items])
  const cityOptions = useMemo<GeoOption[]>(() => {
    const map = new Map<string, GeoOption>()
    items.forEach((row) => {
      const label = typeof row.city_name === 'string' ? row.city_name.trim() : ''
      if (!label) return
      const state = typeof row.cve_ent === 'string' ? row.cve_ent.trim() : undefined
      const country = typeof row.country_code === 'string' ? row.country_code.trim().toUpperCase() : undefined
      const stateName = typeof row.state_name === 'string' ? row.state_name.trim() : undefined
      const countryName = typeof row.country_name === 'string' ? row.country_name.trim() : undefined
      const key = `${label}|${state || ''}|${country || ''}`
      if (!map.has(key)) {
        map.set(key, {
          value: label,
          label,
          subtitle: [stateName, countryName].filter(Boolean).join(' • ') || undefined,
          state,
          country,
        })
      }
    })
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, 'es'))
  }, [items])
  const filteredStateOptions = useMemo(() => {
    if (!filters.country) return stateOptions
    return stateOptions.filter((option) => !option.country || option.country === filters.country)
  }, [stateOptions, filters.country])
  const filteredCityOptions = useMemo(() => (
    cityOptions.filter((option) => {
      if (filters.country && option.country && option.country !== filters.country) {
        return false
      }
      if (filters.estado && option.state && option.state !== filters.estado) {
        return false
      }
      return true
    })
  ), [cityOptions, filters.country, filters.estado])
  const selectedCountryOption = useMemo(
    () => countryOptions.find((option) => option.value === filters.country),
    [countryOptions, filters.country],
  )
  const selectedStateOption = useMemo(
    () => stateOptions.find((option) => option.value === filters.estado),
    [stateOptions, filters.estado],
  )
  const selectedCityOption = useMemo(
    () => cityOptions.find((option) => option.value === filters.city),
    [cityOptions, filters.city],
  )
  const countryDisplayNames = useMemo(() => {
    if (typeof Intl.DisplayNames !== 'function') return null
    try {
      return new Intl.DisplayNames(['es-MX', 'es', 'en'], { type: 'region' })
    } catch {
      return null
    }
  }, [])
  const countryBadgeLabel = useMemo(() => {
    if (!filters.country) return ''
    if (selectedCountryOption?.label) return selectedCountryOption.label
    const normalized = filters.country.trim().toUpperCase()
    if (countryDisplayNames) {
      const resolved = countryDisplayNames.of(normalized)
      if (resolved && resolved.toUpperCase() !== normalized) {
        return resolved
      }
    }
    return normalized
  }, [filters.country, selectedCountryOption, countryDisplayNames])
  const stateBadgeLabel = useMemo(() => {
    if (!filters.estado) return ''
    if (selectedStateOption?.label) return selectedStateOption.label
    const normalized = filters.estado.trim().toUpperCase()
    return MEXICO_STATE_LABELS[normalized as keyof typeof MEXICO_STATE_LABELS] ?? normalized
  }, [filters.estado, selectedStateOption])
  const cityBadgeLabel = useMemo(() => {
    if (!filters.city) return ''
    return selectedCityOption?.label ?? filters.city
  }, [filters.city, selectedCityOption])
  const GEO_ANY_VALUE = '__all'
  const contentRef = useRef<HTMLDivElement | null>(null)
  const geoSummary = useMemo(() => {
    if (cityBadgeLabel) {
      return cityBadgeLabel
    }
    if (stateBadgeLabel) {
      return stateBadgeLabel
    }
    if (countryBadgeLabel) {
      return countryBadgeLabel
    }
    return 'Ubicación geográfica'
  }, [cityBadgeLabel, stateBadgeLabel, countryBadgeLabel])
  const geoActive = Boolean(filters.country || filters.estado || filters.city)
  const geoTriggerClass = cn(
    'h-8 w-[200px] justify-start gap-2 border-border bg-surface text-sm font-medium',
    geoActive ? 'text-primary' : 'text-foreground',
  )

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.key === 'k' || event.key === 'K') && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setCommandOpen((open) => !open)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  useEffect(() => {
    document.body.classList.add('theme-aurora')
    return () => {
      document.body.classList.remove('theme-aurora')
    }
  }, [])

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-4 px-6 pt-1 pb-4">
        <Card className="border-border bg-surface shadow-panel-soft">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl font-semibold">Filtros de visitas</CardTitle>
            <p className="text-sm text-muted-foreground">
              Ajusta el período, canal y criterios de búsqueda para explorar las visitas del webchat.
            </p>
          </CardHeader>
          <CardContent>
            <form className="flex flex-wrap items-end gap-4" onSubmit={handleSubmit}>
              <div className="flex min-w-[240px] flex-1 flex-col gap-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">
                <span>Buscar</span>
                <Input
                  value={formValues.search}
                  onChange={(event) =>
                    setFormValues((current) => ({
                      ...current,
                      search: event.target.value,
                    }))
                  }
                  placeholder="Sesión, contacto, referrer..."
                  className="border-border bg-surface-alt text-foreground"
                  ref={searchInputRef}
                />
              </div>

              <div className="ml-auto flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleRefresh}
                  disabled={loadingState}
                >
                  Actualizar
                </Button>
                <Button type="submit" disabled={loadingState}>
                  Aplicar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleReset}
                  disabled={loadingState}
                >
                  Limpiar
                </Button>
              </div>
            </form>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-alt px-4 py-3">
              <div
                className={cn(
                  'flex flex-wrap items-center gap-2 text-sm text-muted-foreground',
                  dimTotals ? 'opacity-60 transition-opacity duration-200' : '',
                )}
              >
                {showTotalsSkeleton ? (
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-5 w-32 rounded-sm" />
                    <Skeleton className="h-5 w-24 rounded-sm" />
                    <Skeleton className="h-5 w-24 rounded-sm" />
                  </div>
                ) : (
                  <>
                    <Filter className="h-4 w-4" />
                    <span>
                      {total > 0
                        ? `${numberFormatter.format(pagerStart)}-${numberFormatter.format(pagerEnd)} de ${resultsLabel}`
                        : '0 resultados'}
                    </span>
                    <Badge variant="outline" className="bg-surface text-foreground">
                      Con chat: {numberFormatter.format(chatTotals.conChat)}
                    </Badge>
                    <Badge variant="outline" className="bg-surface text-foreground">
                      Sin chat: {numberFormatter.format(chatTotals.sinChat)}
                    </Badge>
                    <Badge variant="secondary" className="bg-surface text-foreground">
                      Chat: {chatFilterLabel}
                    </Badge>
                    {filters.country ? (
                      <Badge variant="outline" className="bg-surface text-foreground">
                        País: {countryBadgeLabel}
                      </Badge>
                    ) : null}
                    {filters.estado ? (
                      <Badge variant="outline" className="bg-surface text-foreground">
                        Región: {stateBadgeLabel}
                      </Badge>
                    ) : null}
                    {filters.city ? (
                      <Badge variant="outline" className="bg-surface text-foreground">
                        Ciudad: {cityBadgeLabel}
                      </Badge>
                    ) : null}
                  </>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Popover open={geoPopoverOpen} onOpenChange={setGeoPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" className={geoTriggerClass}>
                      <MapPin className="h-4 w-4 text-primary/80" />
                      <span className="max-w-[160px] truncate">{geoSummary}</span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent ref={contentRef} align="start" className="w-[320px] space-y-4">
                      <div className="space-y-2">
                        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">País</span>
                        <Select
                          value={filters.country || GEO_ANY_VALUE}
                          onValueChange={(value) => handleCountryFilter(value === GEO_ANY_VALUE ? null : value)}
                        >
                          <SelectTrigger className="h-8 border-border bg-surface-alt text-foreground text-sm">
                            <SelectValue placeholder="Todos los países" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={GEO_ANY_VALUE}>Todos los países</SelectItem>
                            {countryOptions.map((option) => (
                              <SelectItem key={`geo-country-${option.value}`} value={option.value}>
                                <div className="flex flex-col">
                                  <span>{option.label}</span>
                                  {option.subtitle ? (
                                    <span className="text-xs text-muted-foreground">{option.subtitle}</span>
                                  ) : null}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Región</span>
                        <Select
                          value={filters.estado || GEO_ANY_VALUE}
                          onValueChange={(value) => handleStateFilter(value === GEO_ANY_VALUE ? null : value)}
                        >
                          <SelectTrigger className="h-8 border-border bg-surface-alt text-foreground text-sm">
                            <SelectValue placeholder="Todas las regiones" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={GEO_ANY_VALUE}>Todas las regiones</SelectItem>
                            {filteredStateOptions.map((option) => (
                              <SelectItem key={`geo-state-${option.value}`} value={option.value}>
                                <div className="flex flex-col">
                                  <span>{option.label}</span>
                                  {option.subtitle ? (
                                    <span className="text-xs text-muted-foreground">{option.subtitle}</span>
                                  ) : null}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Ciudad</span>
                        <Select
                          value={filters.city || GEO_ANY_VALUE}
                          onValueChange={(value) => handleCityFilter(value === GEO_ANY_VALUE ? null : value)}
                        >
                          <SelectTrigger className="h-8 border-border bg-surface-alt text-foreground text-sm">
                            <SelectValue placeholder="Todas las ciudades" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={GEO_ANY_VALUE}>Todas las ciudades</SelectItem>
                            {filteredCityOptions.map((option) => (
                              <SelectItem key={`geo-city-${option.value}-${option.subtitle ?? 'x'}`} value={option.value}>
                                <div className="flex flex-col">
                                  <span>{option.label}</span>
                                  {option.subtitle ? (
                                    <span className="text-xs text-muted-foreground">{option.subtitle}</span>
                                  ) : null}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    <div className="flex justify-between gap-2 pt-2">
                      <Button type="button" variant="ghost" size="sm" onClick={handleClearGeoFilters}>
                        Limpiar
                      </Button>
                      <Button type="button" size="sm" onClick={() => setGeoPopoverOpen(false)}>
                        Cerrar
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
                <div className="hidden h-6 w-px bg-border sm:block" />
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-primary/80" />
                  <div className="w-[140px]">
                    <Select
                      value={filters.rango}
                      onValueChange={(value: RangeOption) => setRangeFilter(value)}
                    >
                      <SelectTrigger className="h-8 border-border bg-surface text-foreground text-sm font-medium">
                        <SelectValue placeholder="Selecciona rango" />
                      </SelectTrigger>
                      <SelectContent>
                        {RANGE_OPTIONS.map((option) => (
                          <SelectItem key={`toolbar-range-${option.value}`} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="hidden h-6 w-px bg-border sm:block" />
                <div className="flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-primary/80" />
                  <div className="w-[140px]">
                    <Select
                      value={filters.conChat}
                      onValueChange={(value: 'all' | 'with' | 'without') => setChatFilter(value)}
                    >
                      <SelectTrigger className="h-8 border-border bg-surface text-foreground text-sm font-medium">
                        <SelectValue placeholder="Filtrar chat" />
                      </SelectTrigger>
                      <SelectContent>
                        {CHAT_OPTIONS.map((option) => (
                          <SelectItem key={`toolbar-chat-${option.value}`} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setCommandOpen(true)}
                >
                  <Sparkles className="h-4 w-4" />
                  <span>Comandos</span>
                  <span className="hidden text-xs text-muted-foreground sm:inline">⌘K / Ctrl+K</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={handleRefresh}
                  disabled={isFetching}
                >
                  <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">Actualizar</span>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {error ? (
          <Alert
            variant="destructive"
            className="border border-destructive/40 bg-destructive/10 text-destructive shadow-panel-soft"
          >
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error al cargar visitas</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {showEmptyState ? (
          <Alert className="border border-border bg-surface shadow-panel-soft">
            <InfoIcon className="h-4 w-4" />
            <AlertTitle>Sin resultados</AlertTitle>
            <AlertDescription>
              No se encontraron visitas con los filtros seleccionados. Ajusta el período, el estado o la búsqueda para ver otros datos.
            </AlertDescription>
          </Alert>
        ) : null}

        <Card className="border-border bg-surface shadow-panel">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl font-semibold">Listado de visitas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <TooltipProvider delayDuration={150} skipDelayDuration={100}>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-border">
                      {headers.map((header, index) => {
                        const tooltipContent = HEADER_TOOLTIPS[header]
                        const headLabel = tooltipContent ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex cursor-help items-center gap-1">
                                {header}
                                <InfoIcon className="h-3 w-3" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs text-xs leading-relaxed">
                              {tooltipContent}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          header
                        )

                        return (
                          <TableHead
                            key={header}
                            style={columnStyle(index)}
                            className="relative whitespace-nowrap bg-surface-alt px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-primary"
                          >
                            {headLabel}
                            <span
                              className="o_resize_handle"
                              onMouseDown={handleResizeStart(index)}
                            />
                          </TableHead>
                        )
                      })}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                  {loadingState && !hasData
                    ? Array.from({ length: 5 }).map((_, skeletonIndex) => (
                        <TableRow key={`skeleton-${skeletonIndex}`} className="border-b border-border">
                          {headers.map((_, cellIndex) => (
                            <TableCell
                              key={cellIndex}
                              style={columnStyle(cellIndex)}
                              className="px-4 py-3"
                            >
                              <div className="flex flex-col gap-2">
                                <Skeleton
                                  className={`h-4 rounded-sm ${SKELETON_WIDTHS[cellIndex] ?? 'w-full'}`}
                                />
                                {cellIndex === 4 || cellIndex === 8 ? (
                                  <Skeleton className="h-3 w-3/4 rounded-sm" />
                                ) : null}
                              </div>
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    : null}

                  {!error && hasData
                    ? items.map((row, rowIndex) => {
                        const visitsTotal = Number(row.total_visitas ?? row.visit_count ?? 0)
                        const inbound = Number(row.mensajes_entrantes ?? 0)
                        const chatLabel = row.tuvo_chat
                          ? `Sí (${numberFormatter.format(inbound)} entrantes)`
                          : 'No'
                        const chatBadge = (
                          <Badge
                            variant={row.tuvo_chat ? 'default' : 'outline'}
                            className={row.tuvo_chat
                              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                              : 'border-border text-muted-foreground'}
                          >
                            {row.tuvo_chat ? 'Chat activo' : 'Sin chat'}
                          </Badge>
                        )
                        const captureBadge = captureBadgeFromValue(row.contacto_captura)
                        const referrerLink = row.referrer ? (
                          <a
                            href={row.referrer}
                            target="_blank"
                            rel="noreferrer"
                            className="break-words text-primary hover:underline"
                          >
                            {row.referrer}
                          </a>
                        ) : (
                          '—'
                        )
                        const landingLink = row.landing_url ? (
                          <a
                            href={row.landing_url}
                            target="_blank"
                            rel="noreferrer"
                            className="break-words text-primary hover:underline"
                          >
                            {row.landing_url}
                          </a>
                        ) : (
                          '—'
                        )

                        const columns: Array<{ value: ReactNode; className?: string; title?: string }> = [
                          {
                            value: <span className="font-mono">{row.session_id || '—'}</span>,
                            className: 'whitespace-nowrap',
                            title: row.session_id || undefined,
                          },
                          {
                            value: row.ip ? <span className="font-mono break-words">{row.ip}</span> : '—',
                            className: 'break-words',
                            title: row.ip || undefined,
                          },
                          {
                            value: numberFormatter.format(visitsTotal),
                            className: 'whitespace-nowrap',
                            title: numberFormatter.format(visitsTotal),
                          },
                          {
                            value: formatDateTime(row.primera_visita_en || row.registrado_en),
                            className: 'whitespace-nowrap',
                            title: formatDateTime(row.primera_visita_en || row.registrado_en),
                          },
                          {
                            value: lastEventContent[rowIndex],
                            className: 'whitespace-pre-line',
                            title: lastEventContent[rowIndex],
                          },
                          {
                            value: formatDuration(row.stay_seconds),
                            className: 'whitespace-nowrap',
                            title: formatDuration(row.stay_seconds),
                          },
                          {
                            value: formatDuration(row.avg_stay_seconds),
                            className: 'whitespace-nowrap',
                            title: formatDuration(row.avg_stay_seconds),
                          },
                          {
                            value: chatBadge,
                            className: 'whitespace-nowrap',
                            title: chatLabel,
                          },
                          {
                            value: (
                              <div className="flex flex-col gap-1">
                                <span className="whitespace-pre-line">{formatContact(row)}</span>
                                {captureBadge ? (
                                  <div className="flex flex-wrap gap-1">{captureBadge}</div>
                                ) : null}
                              </div>
                            ),
                            className: 'whitespace-pre-line',
                            title: formatContact(row),
                          },
                          {
                            value: formatCountry(row),
                            className: 'whitespace-nowrap',
                            title: formatCountry(row),
                          },
                          {
                            value: formatState(row),
                            className: 'whitespace-nowrap',
                            title: formatState(row),
                          },
                          {
                            value: formatCity(row),
                            className: 'whitespace-nowrap',
                            title: formatCity(row),
                          },
                          {
                            value: (
                              <div className="flex items-center gap-2">
                                <MonitorSmartphone className="h-4 w-4 text-muted-foreground" />
                                <span>{formatDevice(row)}</span>
                              </div>
                            ),
                            className: 'whitespace-nowrap',
                            title: formatDevice(row),
                          },
                          {
                            value: referrerLink,
                            className: 'break-words',
                            title: row.referrer || undefined,
                          },
                          {
                            value: landingLink,
                            className: 'break-words',
                            title: row.landing_url || undefined,
                          },
                        ]

                        return (
                          <TableRow
                            key={row.session_id ?? `${rowIndex}`}
                            role="button"
                            tabIndex={0}
                            onClick={() => handleOpenDetails(row)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault()
                                handleOpenDetails(row)
                              }
                            }}
                            className="cursor-pointer border-b border-border transition hover:bg-surface-alt/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                          >
                            {columns.map((column, columnIndex) => (
                              <TableCell
                                key={columnIndex}
                                style={columnStyle(columnIndex)}
                                title={column.title ?? (typeof column.value === 'string' ? column.value : undefined)}
                                className={`px-4 py-3 text-sm text-foreground ${column.className ?? ''}`}
                              >
                                {column.value}
                              </TableCell>
                            ))}
                          </TableRow>
                        )
                      })
                    : null}

                  {showEmptyState ? (
                    <TableRow>
                      <TableCell
                        colSpan={COLUMN_COUNT}
                        className="px-4 py-10 text-center text-sm text-muted"
                      >
                        No se encontraron visitas con los filtros actuales.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
            </TooltipProvider>

            <div className="flex items-center justify-between gap-4 border-t border-border bg-surface-alt px-4 py-3 text-sm text-muted">
              <span>
                {total > 0
                  ? `${numberFormatter.format(pagerStart)}-${numberFormatter.format(pagerEnd)} de ${numberFormatter.format(total)}`
                  : '0 resultados'}
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handlePrevPage}
                  disabled={!canGoPrev || loadingState}
                >
                  Anterior
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleNextPage}
                  disabled={!canGoNext || loadingState}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
        <Dialog
          open={detailsOpen}
          onOpenChange={(open) => {
            if (!open) {
              handleCloseDetails()
            }
          }}
        >
          <DialogContent className="max-w-2xl">
            {selectedVisit ? (
              <>
                <DialogHeader>
                  <DialogTitle>Detalle de la visita</DialogTitle>
                  <DialogDescription>
                    Sesión <span className="font-mono">{selectedVisit.session_id}</span>
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-6 text-sm">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                        Información general
                      </h4>
                      <div className="flex items-center gap-2 text-foreground">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span>
                          Primera visita: {formatDateTime(selectedVisit.primera_visita_en || selectedVisit.registrado_en)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-foreground">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span>
                          Último evento: {formatDateTime(selectedVisit.ultimo_evento_en)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-foreground">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span>Estancia total: {formatDuration(selectedVisit.stay_seconds)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-foreground">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span>Promedio por visita: {formatDuration(selectedVisit.avg_stay_seconds)}</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                        Ubicación y origen
                      </h4>
                      <div className="flex items-center gap-2 text-foreground">
                        <Globe className="h-4 w-4 text-muted-foreground" />
                        <span>
                          {formatCountry(selectedVisit)}
                          {selectedVisit.state_name ? ` · ${selectedVisit.state_name}` : ''}
                          {selectedVisit.city_name ? ` (${selectedVisit.city_name})` : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-foreground">
                        <MonitorSmartphone className="h-4 w-4 text-muted-foreground" />
                        <span>{formatDevice(selectedVisit)}</span>
                      </div>
                      {selectedVisit.referrer ? (
                        <div className="flex items-center gap-2 text-foreground">
                          <InfoIcon className="h-4 w-4 text-muted-foreground" />
                          <a
                            href={selectedVisit.referrer}
                            target="_blank"
                            rel="noreferrer"
                            className="truncate text-primary hover:underline"
                          >
                            {selectedVisit.referrer}
                          </a>
                        </div>
                      ) : null}
                      {selectedVisit.landing_url ? (
                        <div className="flex items-center gap-2 text-foreground">
                          <InfoIcon className="h-4 w-4 text-muted-foreground" />
                          <a
                            href={selectedVisit.landing_url}
                            target="_blank"
                            rel="noreferrer"
                            className="truncate text-primary hover:underline"
                          >
                            {selectedVisit.landing_url}
                          </a>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                        Contacto
                      </h4>
                      <div className="flex items-center gap-2 text-foreground">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span>{selectedVisit.contacto_correo || 'Sin correo'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-foreground">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <span>{selectedVisit.contacto_telefono || 'Sin teléfono'}</span>
                      </div>
                      {selectedVisit.contacto_nombre ? (
                        <div className="text-foreground">{selectedVisit.contacto_nombre}</div>
                      ) : null}
                      {selectedVisit.contacto_empresa ? (
                        <div className="text-foreground">{selectedVisit.contacto_empresa}</div>
                      ) : null}
                      {selectedCaptureBadge ? (
                        <div className="flex flex-wrap gap-1">{selectedCaptureBadge}</div>
                      ) : null}
                    </div>
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                        Conversación
                      </h4>
                      <div className="flex flex-wrap items-center gap-2 text-foreground">
                        <span className="text-sm">Estado:</span>
                        {selectedVisit.tuvo_chat ? (
                          <Badge className="border-emerald-500/40 bg-emerald-500/10 text-emerald-200">
                            Chat activo
                          </Badge>
                        ) : (
                          <Badge variant="outline">Sin chat</Badge>
                        )}
                      </div>
                      <div className="text-foreground">
                        Mensajes entrantes: {numberFormatter.format(selectedVisit.mensajes_entrantes ?? 0)}
                      </div>
                      <div className="text-foreground">
                        Mensajes salientes: {numberFormatter.format(selectedVisit.mensajes_salientes ?? 0)}
                      </div>
                      {selectedVisit.primer_mensaje_en ? (
                        <div className="text-foreground">
                          Primer mensaje: {formatDateTime(selectedVisit.primer_mensaje_en)}
                        </div>
                      ) : null}
                      {selectedVisit.ultimo_mensaje_conversacion ? (
                        <div className="text-foreground">
                          Último mensaje: {formatDateTime(selectedVisit.ultimo_mensaje_conversacion)}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </>
            ) : null}
          </DialogContent>
        </Dialog>
        <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
          <CommandInput placeholder="Buscar acción o filtro..." />
          <CommandList>
            <CommandEmpty>Sin comandos disponibles.</CommandEmpty>
            <CommandGroup heading="Período">
              {RANGE_OPTIONS.map((option) => (
                <CommandItem
                  key={`cmd-range-${option.value}`}
                  onSelect={() => {
                    setRangeFilter(option.value)
                    setCommandOpen(false)
                  }}
                >
                  {option.label}
                  {filters.rango === option.value ? (
                    <Badge variant="outline" className="ml-auto">
                      Activo
                    </Badge>
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="Chat">
              {CHAT_OPTIONS.map((option) => (
                <CommandItem
                  key={`cmd-chat-${option.value}`}
                  onSelect={() => {
                    setChatFilter(option.value)
                    setCommandOpen(false)
                  }}
                >
                  {option.label}
                  {filters.conChat === option.value ? (
                    <Badge variant="outline" className="ml-auto">
                      Activo
                    </Badge>
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Acciones">
              <CommandItem
                onSelect={() => {
                  handleRefresh()
                  setCommandOpen(false)
                }}
              >
                <RefreshCw className="h-4 w-4" />
                <span>Actualizar datos</span>
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  handleReset()
                  setCommandOpen(false)
                }}
              >
                <Filter className="h-4 w-4" />
                <span>Limpiar filtros</span>
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  setCommandOpen(false)
                  searchInputRef.current?.focus()
                }}
              >
                <CommandIcon className="h-4 w-4" />
                <span>Enfocar búsqueda</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </CommandDialog>
      </div>
    </div>
  )
}
