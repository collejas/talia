import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
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
  Columns3,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSupabaseSession } from '@/hooks/useSupabaseSession'
import { fetchVisitas } from '@/services/visitas'
import type { VisitaRow } from '@/types/visitas'

const LIMIT = 50
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
  'w-32',
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

const CONTACT_STATUS_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'completo', label: 'Contacto completo' },
  { value: 'incompleto', label: 'Contacto incompleto' },
  { value: 'sin_contacto', label: 'Sin contacto' },
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

type ContactStatusOption = 'all' | 'completo' | 'incompleto' | 'sin_contacto'

type Filters = {
  rango: RangeOption
  conChat: 'all' | 'with' | 'without'
  estado: string
  country: string
  city: string
  search: string
  sessionId: string
  ip: string
  visitasMin: number | null
  visitasMax: number | null
  contactStatus: ContactStatusOption
  deviceTypes: string[]
  referrer: string
  landing: string
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
  sessionId: '',
  ip: '',
  visitasMin: null,
  visitasMax: null,
  contactStatus: 'all',
  deviceTypes: [],
  referrer: '',
  landing: '',
}

const numberFormatter = new Intl.NumberFormat('es-MX')
const dateFormatter = new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'short',
  timeStyle: 'short',
})
const coordinateFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 5,
  maximumFractionDigits: 5,
  signDisplay: 'auto',
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

type CoordinateSearchResult = {
  lat: number
  lng: number
  path: string
}

type CoordinatesInfo = {
  lat: number
  lng: number
  source?: string
}

function toCoordinateNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const normalized = value.replace(',', '.')
    const parsed = Number(normalized)
    if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
      return parsed
    }
  }
  return null
}

function extractCoordinatesFromRecord(
  record: Record<string, unknown> | null | undefined,
): { lat: number; lng: number } | null {
  if (!record) return null
  const latKeys = ['lat', 'latitude', 'latitud', 'y']
  const lngKeys = ['lng', 'lon', 'long', 'longitude', 'x']
  let lat: number | null = null
  let lng: number | null = null

  for (const key of latKeys) {
    if (key in record) {
      const candidate = toCoordinateNumber(record[key])
      if (candidate !== null) {
        lat = candidate
        break
      }
    }
  }

  for (const key of lngKeys) {
    if (key in record) {
      const candidate = toCoordinateNumber(record[key])
      if (candidate !== null) {
        lng = candidate
        break
      }
    }
  }

  if (lat === null || lng === null) {
    const coordinatesValue = record['coordinates']
    if (Array.isArray(coordinatesValue) && coordinatesValue.length >= 2) {
      const first = toCoordinateNumber(coordinatesValue[0])
      const second = toCoordinateNumber(coordinatesValue[1])
      if (first !== null && second !== null) {
        if (Math.abs(first) <= 90 && Math.abs(second) <= 180) {
          lat = first
          lng = second
        } else if (Math.abs(second) <= 90 && Math.abs(first) <= 180) {
          lat = second
          lng = first
        }
      }
    }
  }

  if (lat === null || lng === null) {
    return null
  }

  return { lat, lng }
}

function findCoordinatesCandidate(
  value: unknown,
  path: string[],
  depth = 0,
): CoordinateSearchResult | null {
  if (value === null || value === undefined || depth > 5) {
    return null
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const result = findCoordinatesCandidate(value[index], [...path, String(index)], depth + 1)
      if (result) return result
    }
    return null
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    const direct = extractCoordinatesFromRecord(record)
    if (direct) {
      return {
        ...direct,
        path: path.join('.'),
      }
    }
    for (const [key, nested] of Object.entries(record)) {
      const result = findCoordinatesCandidate(nested, [...path, key], depth + 1)
      if (result) return result
    }
  }

  return null
}

function resolveCoordinates(row: VisitaRow): CoordinatesInfo | null {
  const ubicacionResult = findCoordinatesCandidate(
    row.ubicacion_cache as Record<string, unknown> | undefined,
    ['ubicacion'],
  )
  if (ubicacionResult) {
    return {
      lat: ubicacionResult.lat,
      lng: ubicacionResult.lng,
      source: 'Contacto',
    }
  }

  const geoResult = findCoordinatesCandidate(row.geo, ['geo'])
  if (geoResult) {
    let source = 'Geo'
    if (geoResult.path.includes('ip_lookup')) {
      source = 'GeoIP'
    } else if (geoResult.path.includes('client')) {
      source = 'Cliente'
    }
    return {
      lat: geoResult.lat,
      lng: geoResult.lng,
      source,
    }
  }

  return null
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

function formatLastEvent(row: VisitaRow): string {
  const parts: string[] = []
  parts.push(formatDateTime(row.ultimo_evento_en))
  if (row.closed_at) {
    parts.push(`Cierre: ${formatDateTime(row.closed_at)}`)
  }
  return parts.filter(Boolean).join('\n')
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

type TextFilterField = 'sessionId' | 'ip' | 'referrer' | 'landing'

type ColumnFilterConfig =
  | {
      type: 'text'
      field: TextFilterField
      placeholder?: string
    }
  | {
      type: 'numberRange'
      fieldMin: 'visitasMin'
      fieldMax: 'visitasMax'
      minPlaceholder?: string
      maxPlaceholder?: string
    }
  | {
      type: 'select'
      field: 'conChat' | 'contactStatus'
      options: readonly { value: string; label: string }[]
    }
  | {
      type: 'multiSelect'
      field: 'deviceTypes'
    }
  | {
      type: 'geo'
      target: 'country' | 'state' | 'city'
    }

type ColumnId =
  | 'session'
  | 'ip'
  | 'visitas'
  | 'primera'
  | 'ultimo'
  | 'stay'
  | 'avgStay'
  | 'chat'
  | 'contact'
  | 'country'
  | 'state'
  | 'city'
  | 'coordinates'
  | 'device'
  | 'referrer'
  | 'landing'

type SortKey =
  | 'session'
  | 'ip'
  | 'visitas'
  | 'primera'
  | 'ultimo'
  | 'stay'
  | 'avg_stay'
  | 'chat'
  | 'country'
  | 'state'
  | 'city'
  | 'device'
  | 'referrer'
  | 'landing'

type ColumnCell = { value: ReactNode; className?: string; title?: string }

type ColumnDefinition = {
  id: ColumnId
  label: string
  sortKey?: SortKey
  tooltip?: string
  filter?: ColumnFilterConfig
  render: (row: VisitaRow) => ColumnCell
}

const COLUMN_DEFINITIONS: ColumnDefinition[] = [
  {
    id: 'session',
    label: 'Sesión',
    sortKey: 'session',
    filter: { type: 'text', field: 'sessionId', placeholder: 'ID de sesión' },
    render: (row) => ({
      value: <span className="block truncate font-mono">{row.session_id || '—'}</span>,
      className: 'truncate',
      title: row.session_id || undefined,
    }),
  },
  {
    id: 'ip',
    label: 'IP',
    sortKey: 'ip',
    filter: { type: 'text', field: 'ip', placeholder: 'Ej. 187.1.2.3' },
    render: (row) => ({
      value: row.ip ? <span className="block break-words font-mono">{row.ip}</span> : '—',
      className: 'font-mono break-words',
      title: row.ip || undefined,
    }),
  },
  {
    id: 'visitas',
    label: 'Visitas',
    sortKey: 'visitas',
    filter: {
      type: 'numberRange',
      fieldMin: 'visitasMin',
      fieldMax: 'visitasMax',
      minPlaceholder: 'Mínimo',
      maxPlaceholder: 'Máximo',
    },
    render: (row) => {
      const visitsTotal = Number(row.total_visitas ?? row.visit_count ?? 0)
      const formatted = numberFormatter.format(visitsTotal)
      return {
        value: <span className="block truncate">{formatted}</span>,
        className: 'truncate',
        title: formatted,
      }
    },
  },
  {
    id: 'primera',
    label: 'Primera visita',
    sortKey: 'primera',
    render: (row) => {
      const text = formatDateTime(row.primera_visita_en || row.registrado_en)
      return {
        value: <span className="block truncate">{text}</span>,
        className: 'truncate',
        title: text,
      }
    },
  },
  {
    id: 'ultimo',
    label: 'Último evento',
    sortKey: 'ultimo',
    tooltip: 'Última interacción detectada para la sesión, incluyendo el momento de cierre si existe.',
    render: (row) => {
      const text = formatLastEvent(row) || '—'
      return {
        value: <span className="whitespace-pre-line">{text}</span>,
        className: 'whitespace-pre-line',
        title: text,
      }
    },
  },
  {
    id: 'stay',
    label: 'Tiempo estancia',
    sortKey: 'stay',
    tooltip: 'Tiempo total entre el registro y el cierre de la sesión, en una sola visita.',
    render: (row) => {
      const text = formatDuration(row.stay_seconds)
      return {
        value: <span className="block truncate">{text}</span>,
        className: 'truncate',
        title: text,
      }
    },
  },
  {
    id: 'avgStay',
    label: 'Estancia promedio',
    sortKey: 'avg_stay',
    tooltip: 'Promedio de tiempo por visita calculado en función del número total de visitas registradas.',
    render: (row) => {
      const text = formatDuration(row.avg_stay_seconds)
      return {
        value: <span className="block truncate">{text}</span>,
        className: 'truncate',
        title: text,
      }
    },
  },
  {
    id: 'chat',
    label: 'Chat',
    sortKey: 'chat',
    filter: { type: 'select', field: 'conChat', options: CHAT_OPTIONS },
    render: (row) => {
      const inbound = Number(row.mensajes_entrantes ?? 0)
      const chatLabel = row.tuvo_chat ? `Sí (${numberFormatter.format(inbound)} entrantes)` : 'No'
      const badge = row.tuvo_chat ? (
        <Badge className="border-emerald-500/40 bg-emerald-500/10 text-emerald-200">Chat activo</Badge>
      ) : (
        <Badge variant="outline" className="border-border text-muted-foreground">
          Sin chat
        </Badge>
      )
      return {
        value: badge,
        className: 'truncate',
        title: chatLabel,
      }
    },
  },
  {
    id: 'contact',
    label: 'Contacto',
    filter: { type: 'select', field: 'contactStatus', options: CONTACT_STATUS_OPTIONS },
    render: (row) => {
      const contactText = formatContact(row)
      const badge = captureBadgeFromValue(row.contacto_captura)
      return {
        value: (
          <div className="flex flex-col gap-1">
            <span className="whitespace-pre-line">{contactText}</span>
            {badge ? <div className="flex flex-wrap gap-1">{badge}</div> : null}
          </div>
        ),
        className: 'whitespace-pre-line',
        title: contactText,
      }
    },
  },
  {
    id: 'country',
    label: 'País',
    sortKey: 'country',
    filter: { type: 'geo', target: 'country' },
    render: (row) => {
      const text = formatCountry(row)
      return {
        value: <span className="block truncate">{text}</span>,
        className: 'truncate',
        title: text,
      }
    },
  },
  {
    id: 'state',
    label: 'Estado',
    sortKey: 'state',
    filter: { type: 'geo', target: 'state' },
    render: (row) => {
      const text = formatState(row)
      return {
        value: <span className="block truncate">{text}</span>,
        className: 'truncate',
        title: text,
      }
    },
  },
  {
    id: 'city',
    label: 'Ciudad',
    sortKey: 'city',
    filter: { type: 'geo', target: 'city' },
    render: (row) => {
      const text = formatCity(row)
      return {
        value: <span className="block truncate">{text}</span>,
        className: 'truncate',
        title: text,
      }
    },
  },
  {
    id: 'coordinates',
    label: 'Coordenadas',
    tooltip: 'Latitud y longitud detectadas para la sesión.',
    render: (row) => {
      const coords = resolveCoordinates(row)
      if (!coords) {
        return { value: '—', title: undefined }
      }
      const latText = coordinateFormatter.format(coords.lat)
      const lngText = coordinateFormatter.format(coords.lng)
      const combined = `${latText}, ${lngText}`
      const subtitle = coords.source ? `${coords.source}` : ''
      return {
        value: (
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-mono text-sm">{combined}</span>
            {subtitle ? (
              <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                {subtitle}
              </span>
            ) : null}
          </div>
        ),
        className: 'whitespace-pre-line',
        title: subtitle ? `${combined} • ${subtitle}` : combined,
      }
    },
  },
  {
    id: 'device',
    label: 'Dispositivo',
    sortKey: 'device',
    filter: { type: 'multiSelect', field: 'deviceTypes' },
    render: (row) => {
      const text = formatDevice(row)
      return {
        value: (
          <div className="flex min-w-0 items-center gap-2">
            <MonitorSmartphone className="h-4 w-4 text-muted-foreground" />
            <span className="truncate">{text}</span>
          </div>
        ),
        className: 'truncate',
        title: text,
      }
    },
  },
  {
    id: 'referrer',
    label: 'Referrer',
    sortKey: 'referrer',
    filter: { type: 'text', field: 'referrer', placeholder: 'Dominio o URL' },
    render: (row) => {
      if (!row.referrer) {
        return { value: '—', title: undefined }
      }
      return {
        value: (
          <a
            href={row.referrer}
            target="_blank"
            rel="noreferrer"
            className="block truncate text-primary hover:underline"
          >
            {row.referrer}
          </a>
        ),
        className: 'truncate',
        title: row.referrer,
      }
    },
  },
  {
    id: 'landing',
    label: 'Landing',
    sortKey: 'landing',
    filter: { type: 'text', field: 'landing', placeholder: 'URL' },
    render: (row) => {
      if (!row.landing_url) {
        return { value: '—', title: undefined }
      }
      return {
        value: (
          <a
            href={row.landing_url}
            target="_blank"
            rel="noreferrer"
            className="block truncate text-primary hover:underline"
          >
            {row.landing_url}
          </a>
        ),
        className: 'truncate',
        title: row.landing_url,
      }
    },
  },
]

const COLUMN_DEFINITION_MAP: Record<ColumnId, ColumnDefinition> = COLUMN_DEFINITIONS.reduce(
  (acc, column) => {
    acc[column.id] = column
    return acc
  },
  {} as Record<ColumnId, ColumnDefinition>,
)

const DEFAULT_COLUMN_ORDER = COLUMN_DEFINITIONS.map((column) => column.id)

const COLUMN_COUNT = COLUMN_DEFINITIONS.length

const COLUMN_STORAGE_KEY = 'visitas.column_prefs.v1'

function createDefaultColumnVisibility(): Record<ColumnId, boolean> {
  const visibility = {} as Record<ColumnId, boolean>
  DEFAULT_COLUMN_ORDER.forEach((id) => {
    visibility[id] = true
  })
  return visibility
}

function arrayMove<T>(array: readonly T[], from: number, to: number): T[] {
  const result = [...array]
  const [item] = result.splice(from, 1)
  result.splice(to, 0, item)
  return result
}

function sanitizeOrder(candidate: unknown): ColumnId[] {
  if (!Array.isArray(candidate)) return [...DEFAULT_COLUMN_ORDER]
  const seen = new Set<ColumnId>()
  const result: ColumnId[] = []
  candidate.forEach((value) => {
    if (typeof value !== 'string') return
    if ((COLUMN_DEFINITION_MAP as Record<string, ColumnDefinition>)[value] && !seen.has(value as ColumnId)) {
      seen.add(value as ColumnId)
      result.push(value as ColumnId)
    }
  })
  DEFAULT_COLUMN_ORDER.forEach((id) => {
    if (!seen.has(id)) {
      seen.add(id)
      result.push(id)
    }
  })
  return result
}

function sanitizeVisibility(candidate: unknown): Record<ColumnId, boolean> {
  const visibility = createDefaultColumnVisibility()
  if (!candidate || typeof candidate !== 'object') return visibility
  Object.entries(candidate as Record<string, unknown>).forEach(([key, value]) => {
    if ((COLUMN_DEFINITION_MAP as Record<string, ColumnDefinition>)[key]) {
      visibility[key as ColumnId] = Boolean(value)
    }
  })
  return visibility
}

function loadColumnPreferences(): { order: ColumnId[]; visibility: Record<ColumnId, boolean> } {
  if (typeof window === 'undefined') {
    return {
      order: [...DEFAULT_COLUMN_ORDER],
      visibility: createDefaultColumnVisibility(),
    }
  }
  try {
    const raw = window.localStorage.getItem(COLUMN_STORAGE_KEY)
    if (!raw) {
      return {
        order: [...DEFAULT_COLUMN_ORDER],
        visibility: createDefaultColumnVisibility(),
      }
    }
    const parsed = JSON.parse(raw) as { order?: unknown; visibility?: unknown }
    return {
      order: sanitizeOrder(parsed.order),
      visibility: sanitizeVisibility(parsed.visibility),
    }
  } catch (error) {
    console.warn('[visitas] no se pudo leer columnas desde storage', error)
    return {
      order: [...DEFAULT_COLUMN_ORDER],
      visibility: createDefaultColumnVisibility(),
    }
  }
}

export function VisitasPage() {
  const { loading: sessionLoading } = useSupabaseSession()
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [formValues, setFormValues] = useState<Filters>(DEFAULT_FILTERS)
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' } | null>(null)
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
  const initialColumnPrefsRef = useRef<{ order: ColumnId[]; visibility: Record<ColumnId, boolean> } | null>(null)
  const getInitialColumnPrefs = () => {
    if (!initialColumnPrefsRef.current) {
      initialColumnPrefsRef.current = loadColumnPreferences()
    }
    return initialColumnPrefsRef.current
  }
  const [columnOrder, setColumnOrder] = useState<ColumnId[]>(() => getInitialColumnPrefs().order)
  const [columnVisibility, setColumnVisibility] = useState<Record<ColumnId, boolean>>(
    () => getInitialColumnPrefs().visibility,
  )
  const activeColumnDefinitions = useMemo(
    () => columnOrder.filter((id) => columnVisibility[id]).map((id) => COLUMN_DEFINITION_MAP[id]),
    [columnOrder, columnVisibility],
  )
  const visibleColumnCount = useMemo(() => activeColumnDefinitions.length, [activeColumnDefinitions])
  const columnWidthsRef = useRef(columnWidths)
  const [selectedVisit, setSelectedVisit] = useState<VisitaRow | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const [columnsPopoverOpen, setColumnsPopoverOpen] = useState(false)
  const [activeHeaderFilter, setActiveHeaderFilter] = useState<ColumnId | null>(null)
  const [draggedColumn, setDraggedColumn] = useState<ColumnId | null>(null)
  const [dragOverColumn, setDragOverColumn] = useState<ColumnId | null>(null)
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
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(
        COLUMN_STORAGE_KEY,
        JSON.stringify({ order: columnOrder, visibility: columnVisibility }),
      )
    } catch (error) {
      console.warn('[visitas] no se pudo guardar columnas en storage', error)
    }
  }, [columnOrder, columnVisibility])

  useEffect(() => {
    if (activeHeaderFilter && !columnVisibility[activeHeaderFilter]) {
      setActiveHeaderFilter(null)
    }
    if (draggedColumn && !columnVisibility[draggedColumn]) {
      setDraggedColumn(null)
    }
    if (dragOverColumn && !columnVisibility[dragOverColumn]) {
      setDragOverColumn(null)
    }
  }, [activeHeaderFilter, columnVisibility, draggedColumn, dragOverColumn])

  useEffect(() => {
    setFormValues(filters)
    setPage(0)
  }, [filters])

  useEffect(() => {
    setPage(0)
  }, [sortConfig])

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
          sessionId: filters.sessionId || undefined,
          ip: filters.ip || undefined,
          visitasMin: filters.visitasMin ?? undefined,
          visitasMax: filters.visitasMax ?? undefined,
          contactStatus: filters.contactStatus !== 'all' ? filters.contactStatus : undefined,
          deviceTypes: filters.deviceTypes.length ? filters.deviceTypes : undefined,
          referrer: filters.referrer || undefined,
          landing: filters.landing || undefined,
          orderBy: sortConfig?.key,
          orderDirection: sortConfig?.direction,
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
  }, [sessionLoading, filters, sortConfig, offset, page, refreshToken])

  const handleResizeStart = useCallback(
    (columnId: ColumnId) => (event: React.MouseEvent<HTMLSpanElement>) => {
      event.preventDefault()
      event.stopPropagation()
      const header = event.currentTarget.parentElement as HTMLElement | null
      if (!header) return
      const definitionIndex = DEFAULT_COLUMN_ORDER.indexOf(columnId)
      if (definitionIndex === -1) return

      const startX = event.clientX
      const startWidth = header.getBoundingClientRect().width

      const onMouseMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientX - startX
        const nextWidth = Math.max(COLUMN_MIN_WIDTH, Math.round(startWidth + delta))
        setColumnWidths((prev) => {
          const draft = [...prev]
          draft[definitionIndex] = nextWidth
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

  const columnStyle = useCallback((columnId: ColumnId): CSSProperties => {
    const definitionIndex = DEFAULT_COLUMN_ORDER.indexOf(columnId)
    if (definitionIndex === -1) return {}
    const width = columnWidthsRef.current[definitionIndex]
    if (!width) return {}
    return { width, minWidth: width, maxWidth: width }
  }, [])

  const handleReset = () => {
    setFilters(DEFAULT_FILTERS)
    setFormValues(DEFAULT_FILTERS)
    setColumnWidths(Array(COLUMN_COUNT).fill(undefined))
    setPage(0)
    setSortConfig(null)
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
  const deviceOptions = useMemo(
    () => {
      const map = new Map<string, string>()
      items.forEach((row) => {
        const raw = typeof row.device_type === 'string' ? row.device_type.trim() : ''
        if (!raw) return
        const normalized = raw.toLowerCase()
        if (!map.has(normalized)) {
          map.set(normalized, raw)
        }
      })
      return Array.from(map.entries())
        .sort((a, b) => a[1].localeCompare(b[1], 'es'))
        .map(([key, label]) => ({ value: key, label }))
    },
    [items],
  )
  const deviceLabelMap = useMemo(() => {
    const map = new Map<string, string>()
    deviceOptions.forEach((option) => {
      map.set(option.value, option.label)
    })
    return map
  }, [deviceOptions])
  const setFilterValue = useCallback(<K extends keyof Filters>(field: K, value: Filters[K]) => {
    setFilters((current) => {
      if (current[field] === value) return current
      return { ...current, [field]: value }
    })
  }, [])

  const setNumberFilter = useCallback(
    (field: 'visitasMin' | 'visitasMax', value: number | null) => {
      setFilters((current) => {
        if (current[field] === value) return current
        return { ...current, [field]: value }
      })
    },
    [],
  )

  const toggleDeviceType = useCallback((value: string) => {
    const normalized = value.trim().toLowerCase()
    setFilters((current) => {
      const exists = current.deviceTypes.includes(normalized)
      if (exists) {
        const next = current.deviceTypes.filter((item) => item !== normalized)
        if (next.length === current.deviceTypes.length) return current
        return { ...current, deviceTypes: next }
      }
      return { ...current, deviceTypes: [...current.deviceTypes, normalized] }
    })
  }, [])

  const handleToggleColumnVisibility = useCallback(
    (columnId: ColumnId) => {
      setColumnVisibility((current) => {
        const isVisible = current[columnId]
        if (isVisible && visibleColumnCount <= 1) {
          return current
        }
        return { ...current, [columnId]: !isVisible }
      })
    },
    [visibleColumnCount],
  )

  const handleMoveColumn = useCallback((columnId: ColumnId, direction: -1 | 1) => {
    setColumnOrder((current) => {
      const index = current.indexOf(columnId)
      if (index === -1) return current
      const targetIndex = index + direction
      if (targetIndex < 0 || targetIndex >= current.length) return current
      return arrayMove(current, index, targetIndex)
    })
  }, [])

  const handleResetColumns = useCallback(() => {
    setColumnOrder([...DEFAULT_COLUMN_ORDER])
    setColumnVisibility(createDefaultColumnVisibility())
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(COLUMN_STORAGE_KEY)
      } catch (error) {
        console.warn('[visitas] no se pudo limpiar columnas en storage', error)
      }
    }
  }, [])

  const handleDragStartColumn = useCallback(
    (columnId: ColumnId) => (event: DragEvent<HTMLDivElement>) => {
      setDraggedColumn(columnId)
      setDragOverColumn(null)
      event.dataTransfer.effectAllowed = 'move'
      try {
        event.dataTransfer.setData('text/plain', columnId)
      } catch (error) {
        console.warn('[visitas] no se pudo establecer dataTransfer', error)
      }
    },
    [],
  )

  const handleDragOverColumn = useCallback(
    (columnId: ColumnId) => (event: DragEvent<HTMLDivElement>) => {
      if (!draggedColumn || draggedColumn === columnId) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
      setDragOverColumn((current) => (current === columnId ? current : columnId))
    },
    [draggedColumn],
  )

  const handleDragLeaveColumn = useCallback(() => {
    setDragOverColumn(null)
  }, [])

  const handleDropColumn = useCallback(
    (columnId: ColumnId) => (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      const source = draggedColumn ?? (event.dataTransfer.getData('text/plain') as ColumnId)
      setDragOverColumn(null)
      setDraggedColumn(null)
      if (!source || source === columnId) return
      setColumnOrder((current) => {
        const from = current.indexOf(source)
        const to = current.indexOf(columnId)
        if (from === -1 || to === -1 || from === to) return current
        return arrayMove(current, from, to)
      })
    },
    [draggedColumn],
  )

  const handleDragEndColumn = useCallback(() => {
    setDraggedColumn(null)
    setDragOverColumn(null)
  }, [])

  const handleSortToggle = useCallback((key: SortKey) => {
    setSortConfig((current) => {
      if (!current || current.key !== key) {
        return { key, direction: 'asc' }
      }
      if (current.direction === 'asc') {
        return { key, direction: 'desc' }
      }
      return null
    })
  }, [])

  const handleClearColumnFilter = useCallback(
    (column: ColumnDefinition) => {
      const config = column.filter
      if (!config) return
      switch (config.type) {
        case 'text':
          setFilterValue(config.field, '' as Filters[typeof config.field])
          break
        case 'numberRange':
          setNumberFilter(config.fieldMin, null)
          setNumberFilter(config.fieldMax, null)
          break
        case 'select':
          if (config.field === 'conChat') {
            setFilterValue('conChat', 'all')
          } else {
            setFilterValue('contactStatus', 'all')
          }
          break
        case 'multiSelect':
          setFilters((current) => {
            if (current.deviceTypes.length === 0) return current
            return { ...current, deviceTypes: [] }
          })
          break
        case 'geo':
          if (config.target === 'country') {
            handleCountryFilter(null)
          } else if (config.target === 'state') {
            handleStateFilter(null)
          } else {
            handleCityFilter(null)
          }
          break
        default:
          break
      }
    },
    [setFilterValue, setNumberFilter, handleCountryFilter, handleStateFilter, handleCityFilter, setFilters],
  )

  const isColumnFilterActive = useCallback(
    (config?: ColumnFilterConfig) => {
      if (!config) return false
      switch (config.type) {
        case 'text':
          return filters[config.field].trim() !== ''
        case 'numberRange':
          return filters[config.fieldMin] !== null || filters[config.fieldMax] !== null
        case 'select':
          if (config.field === 'conChat') {
            return filters.conChat !== 'all'
          }
          return filters.contactStatus !== 'all'
        case 'multiSelect':
          return filters.deviceTypes.length > 0
        case 'geo':
          if (config.target === 'country') return Boolean(filters.country)
          if (config.target === 'state') return Boolean(filters.estado)
          return Boolean(filters.city)
        default:
          return false
      }
    },
    [filters],
  )

  const renderColumnFilterContent = (column: ColumnDefinition) => {
    const config = column.filter
    if (!config) return null
    switch (config.type) {
      case 'text':
        return (
          <div className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Filtro por {column.label.toLowerCase()}
            </span>
            <Input
              value={filters[config.field]}
              onChange={(event) => setFilterValue(config.field, event.target.value as Filters[typeof config.field])}
              placeholder={config.placeholder}
            />
            <div className="flex justify-between gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleClearColumnFilter(column)}
              >
                Limpiar
              </Button>
              <Button type="button" size="sm" onClick={() => setActiveHeaderFilter(null)}>
                Cerrar
              </Button>
            </div>
          </div>
        )
      case 'numberRange':
        return (
          <div className="space-y-3">
            <div className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Rango de visitas
              </span>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  inputMode="numeric"
                  value={filters[config.fieldMin] ?? ''}
                  placeholder={config.minPlaceholder}
                  onChange={(event) => {
                    const raw = event.target.value
                    if (raw === '') {
                      setNumberFilter(config.fieldMin, null)
                      return
                    }
                    const next = Number(raw)
                    if (!Number.isNaN(next)) {
                      setNumberFilter(config.fieldMin, next)
                    }
                  }}
                />
                <span className="text-xs text-muted-foreground">a</span>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={filters[config.fieldMax] ?? ''}
                  placeholder={config.maxPlaceholder}
                  onChange={(event) => {
                    const raw = event.target.value
                    if (raw === '') {
                      setNumberFilter(config.fieldMax, null)
                      return
                    }
                    const next = Number(raw)
                    if (!Number.isNaN(next)) {
                      setNumberFilter(config.fieldMax, next)
                    }
                  }}
                />
              </div>
            </div>
            <div className="flex justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleClearColumnFilter(column)}
              >
                Limpiar
              </Button>
              <Button type="button" size="sm" onClick={() => setActiveHeaderFilter(null)}>
                Cerrar
              </Button>
            </div>
          </div>
        )
      case 'select':
        return (
          <div className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Selecciona una opción
            </span>
            <Select
              value={String(filters[config.field])}
              onValueChange={(value) => {
                if (config.field === 'conChat') {
                  setFilterValue('conChat', value as Filters['conChat'])
                } else {
                  setFilterValue('contactStatus', value as Filters['contactStatus'])
                }
              }}
            >
              <SelectTrigger className="border-border bg-surface-alt text-foreground">
                <SelectValue placeholder="Selecciona" />
              </SelectTrigger>
              <SelectContent>
                {config.options.map((option) => (
                  <SelectItem key={`${column.id}-filter-${option.value}`} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex justify-between gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleClearColumnFilter(column)}
              >
                Limpiar
              </Button>
              <Button type="button" size="sm" onClick={() => setActiveHeaderFilter(null)}>
                Cerrar
              </Button>
            </div>
          </div>
        )
      case 'multiSelect':
        return (
          <div className="space-y-3">
            <div className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Tipos de dispositivo
              </span>
              {deviceOptions.length ? (
                <div className="flex flex-wrap gap-2">
                  {deviceOptions.map((option) => {
                    const selected = filters.deviceTypes.includes(option.value)
                    return (
                      <Button
                        key={`device-option-${option.value}`}
                        type="button"
                        variant={selected ? 'secondary' : 'outline'}
                        size="sm"
                        onClick={() => toggleDeviceType(option.value)}
                      >
                        {option.label}
                      </Button>
                    )
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Sin datos de dispositivos en esta página.</p>
              )}
            </div>
            <div className="flex justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleClearColumnFilter(column)}
              >
                Limpiar
              </Button>
              <Button type="button" size="sm" onClick={() => setActiveHeaderFilter(null)}>
                Cerrar
              </Button>
            </div>
          </div>
        )
      default:
        return null
    }
  }

  const renderHeaderLabel = (column: ColumnDefinition, headLabel: ReactNode) => {
    const config = column.filter
    const sortKey = column.sortKey
    const currentSortDirection = sortKey && sortConfig?.key === sortKey ? sortConfig.direction : null
    const sortButton = sortKey ? (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn(
          'h-7 w-7 rounded-md border border-transparent text-muted-foreground hover:text-primary',
          currentSortDirection ? 'text-primary hover:text-primary' : '',
        )}
        onClick={() => handleSortToggle(sortKey)}
      >
        {currentSortDirection === 'asc' ? (
          <ArrowUp className="h-3.5 w-3.5" />
        ) : currentSortDirection === 'desc' ? (
          <ArrowDown className="h-3.5 w-3.5" />
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5" />
        )}
      </Button>
    ) : null

    if (!config) {
      if (!sortButton) return headLabel
      return <div className="flex items-center gap-1">{headLabel}{sortButton}</div>
    }

    if (config.type === 'geo') {
      const active = isColumnFilterActive(config)
      return (
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={cn(
              'group inline-flex items-center gap-1 text-left focus:outline-none',
              active ? 'text-primary' : 'text-foreground',
            )}
            onClick={() => {
              setGeoPopoverOpen(true)
              setActiveHeaderFilter(null)
            }}
          >
            <span>{headLabel}</span>
            <Filter className={cn('h-3.5 w-3.5 transition-colors', active ? 'text-primary' : 'text-muted-foreground group-hover:text-primary')} />
          </button>
          {sortButton}
        </div>
      )
    }

    const active = isColumnFilterActive(config)
    return (
      <div className="flex items-center gap-1">
        <span>{headLabel}</span>
        {sortButton}
        <Popover
          open={activeHeaderFilter === column.id}
          onOpenChange={(open) => setActiveHeaderFilter(open ? column.id : null)}
        >
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                'h-7 w-7 -mr-2 rounded-md border border-transparent',
                active ? 'text-primary hover:text-primary' : 'text-muted-foreground hover:text-primary',
              )}
            >
              <Filter className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 space-y-3" align="end" side="bottom">
            {renderColumnFilterContent(column)}
          </PopoverContent>
        </Popover>
      </div>
    )
  }
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
      <div className="mx-auto flex w-full max-w-[100vw] flex-col gap-4 px-4 pt-1 pb-4">
        <Card className="border-border bg-surface shadow-panel-soft">
          <CardContent className="pt-4">
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-alt px-4 py-3">
              <div className="flex w-full flex-wrap items-center gap-2">
                <div className="flex flex-1 flex-wrap items-center gap-2">
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
                <Popover open={columnsPopoverOpen} onOpenChange={setColumnsPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button type="button" size="sm" variant="outline">
                      <Columns3 className="mr-2 h-4 w-4" /> Columnas
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 space-y-3" align="end">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                        Columnas visibles
                      </span>
                      <Button type="button" variant="ghost" size="sm" onClick={handleResetColumns}>
                        Restablecer
                      </Button>
                    </div>
                    <div className="space-y-1.5">
                      {columnOrder.map((columnId, index) => {
                        const column = COLUMN_DEFINITION_MAP[columnId]
                        const isVisible = columnVisibility[columnId]
                        const isFirst = index === 0
                        const isLast = index === columnOrder.length - 1
                        const isDragSource = draggedColumn === columnId
                        const isDragTarget = dragOverColumn === columnId
                        return (
                          <div
                            key={`column-config-${columnId}`}
                            className={cn(
                              'flex items-center gap-2 rounded-md border bg-surface px-2 py-1.5 transition',
                              !isVisible ? 'opacity-70' : '',
                              isDragSource ? 'opacity-60 ring-2 ring-primary/40' : '',
                              isDragTarget ? 'border-primary/60 bg-primary/5' : 'border-border/60',
                            )}
                            draggable
                            onDragStart={handleDragStartColumn(columnId)}
                            onDragOver={handleDragOverColumn(columnId)}
                            onDragLeave={handleDragLeaveColumn}
                            onDrop={handleDropColumn(columnId)}
                            onDragEnd={handleDragEndColumn}
                          >
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleMoveColumn(columnId, -1)}
                              disabled={isFirst}
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleMoveColumn(columnId, 1)}
                              disabled={isLast}
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant={isVisible ? 'secondary' : 'outline'}
                              size="sm"
                              className="flex-1 justify-start"
                              onClick={() => handleToggleColumnVisibility(columnId)}
                            >
                              {isVisible ? (
                                <Eye className="mr-2 h-4 w-4" />
                              ) : (
                                <EyeOff className="mr-2 h-4 w-4" />
                              )}
                              {column.label}
                            </Button>
                          </div>
                        )
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
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
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleReset}
                  disabled={loadingState}
                  className="ml-auto flex-shrink-0"
                >
                  Limpiar filtros
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
            <div className="flex flex-col gap-3 lg:flex-row lg:flex-nowrap lg:items-center lg:gap-4">
              <CardTitle className="text-center text-xl font-semibold lg:flex-[0_0_auto] lg:text-left">
                Listado de visitas
              </CardTitle>
              <div
                className={cn(
                  'flex flex-wrap items-center justify-center gap-2 text-sm text-muted-foreground lg:flex-1 lg:flex-nowrap lg:justify-center',
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
                    {filters.sessionId ? (
                      <Badge variant="outline" className="bg-surface text-foreground">
                        Sesión: {filters.sessionId}
                      </Badge>
                    ) : null}
                    {filters.ip ? (
                      <Badge variant="outline" className="bg-surface text-foreground">
                        IP: {filters.ip}
                      </Badge>
                    ) : null}
                    {filters.visitasMin !== null || filters.visitasMax !== null ? (
                      <Badge variant="outline" className="bg-surface text-foreground">
                        Visitas:
                        {' '}
                        {filters.visitasMin !== null && filters.visitasMax !== null
                          ? `${filters.visitasMin}–${filters.visitasMax}`
                          : filters.visitasMin !== null
                            ? `≥${filters.visitasMin}`
                            : `≤${filters.visitasMax}`}
                      </Badge>
                    ) : null}
                    {filters.contactStatus !== 'all' ? (
                      <Badge variant="outline" className="bg-surface text-foreground">
                        Contacto:
                        {' '}
                        {CONTACT_STATUS_OPTIONS.find((option) => option.value === filters.contactStatus)?.label ?? filters.contactStatus}
                      </Badge>
                    ) : null}
                    {filters.deviceTypes.length ? (
                      <Badge variant="outline" className="bg-surface text-foreground">
                        Dispositivo:
                        {' '}
                        {filters.deviceTypes
                          .map((value) => deviceLabelMap.get(value) ?? value)
                          .join(', ')}
                      </Badge>
                    ) : null}
                    {filters.referrer ? (
                      <Badge variant="outline" className="bg-surface text-foreground">
                        Referrer: {filters.referrer}
                      </Badge>
                    ) : null}
                    {filters.landing ? (
                      <Badge variant="outline" className="bg-surface text-foreground">
                        Landing: {filters.landing}
                      </Badge>
                    ) : null}
                  </>
                )}
              </div>
              <div className="flex justify-center lg:flex-[0_0_auto] lg:justify-end">
                <Input
                  value={formValues.search}
                  onChange={(event) => {
                    const nextValue = event.target.value
                    setFormValues((current) => ({
                      ...current,
                      search: nextValue,
                    }))
                    setFilters((current) => {
                      if (current.search === nextValue) return current
                      return { ...current, search: nextValue }
                    })
                  }}
                  placeholder="Buscar visitas..."
                  className="w-full max-w-[20ch] border-border bg-surface-alt text-foreground lg:w-[20ch]"
                  ref={searchInputRef}
                  aria-label="Buscar visitas"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <TooltipProvider delayDuration={150} skipDelayDuration={100}>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-border">
                      {activeColumnDefinitions.map((column) => {
                        const headLabel = column.tooltip ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex cursor-help items-center gap-1">
                                {column.label}
                                <InfoIcon className="h-3 w-3" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs text-xs leading-relaxed">
                              {column.tooltip}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          column.label
                        )
                        const headerContent = renderHeaderLabel(column, headLabel)

                        return (
                          <TableHead
                            key={column.id}
                            style={columnStyle(column.id)}
                            className="relative whitespace-nowrap bg-surface-alt px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-primary"
                          >
                            {headerContent}
                            <span
                              className="o_resize_handle"
                              onMouseDown={handleResizeStart(column.id)}
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
                          {activeColumnDefinitions.map((column) => {
                            const definitionIndex = DEFAULT_COLUMN_ORDER.indexOf(column.id)
                            const skeletonWidth =
                              definitionIndex !== -1 ? SKELETON_WIDTHS[definitionIndex] ?? 'w-full' : 'w-full'
                            return (
                              <TableCell
                                key={`${column.id}-skeleton`}
                                style={columnStyle(column.id)}
                                className="px-4 py-3"
                              >
                                <div className="flex flex-col gap-2">
                                  <Skeleton className={`h-4 rounded-sm ${skeletonWidth}`} />
                                  {column.id === 'ultimo' || column.id === 'contact' ? (
                                    <Skeleton className="h-3 w-3/4 rounded-sm" />
                                  ) : null}
                                </div>
                              </TableCell>
                            )
                          })}
                        </TableRow>
                      ))
                    : null}

                  {!error && hasData
                    ? items.map((row, rowIndex) => (
                        <TableRow
                          key={row.session_id ?? `row-${rowIndex}`}
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
                          {activeColumnDefinitions.map((column) => {
                            const cell = column.render(row)
                            return (
                              <TableCell
                                key={`${column.id}-${rowIndex}`}
                                style={columnStyle(column.id)}
                                title={cell.title ?? (typeof cell.value === 'string' ? cell.value : undefined)}
                                className={cn(
                                  'px-4 py-3 align-top text-sm text-foreground whitespace-normal break-words',
                                  cell.className,
                                )}
                              >
                                {cell.value}
                              </TableCell>
                            )
                          })}
                        </TableRow>
                      ))
                    : null}

                  {showEmptyState ? (
                    <TableRow>
                      <TableCell
                        colSpan={activeColumnDefinitions.length || 1}
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
