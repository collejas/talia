import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
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
import { useSupabaseSession } from '@/hooks/useSupabaseSession'
import { fetchVisitas } from '@/services/visitas'
import type { VisitaRow } from '@/types/visitas'

const LIMIT = 50
const COLUMN_COUNT = 15
const COLUMN_MIN_WIDTH = 120

const RANGE_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'hoy', label: 'Hoy' },
  { value: 'ayer', label: 'Ayer' },
  { value: '7d', label: 'Últimos 7 días' },
  { value: '30d', label: 'Últimos 30 días' },
]

const CHAT_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'with', label: 'Con chat' },
  { value: 'without', label: 'Sin chat' },
]

const DEFAULT_FILTERS = {
  rango: '7d',
  conChat: 'all' as 'all' | 'with' | 'without',
  estado: '',
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

type Filters = typeof DEFAULT_FILTERS

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
  const [columnWidths, setColumnWidths] = useState<(number | undefined)[]>(
    Array(COLUMN_COUNT).fill(undefined),
  )
  const columnWidthsRef = useRef(columnWidths)

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
          rango: filters.rango || undefined,
          conChat: filters.conChat,
          estado: filters.estado || undefined,
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
        }
      } catch (err) {
        console.error('[visitas] fetch error', err)
        if (!cancelled) {
          setItems([])
          setTotal(0)
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

  useEffect(() => {
    document.body.classList.add('theme-aurora')
    return () => {
      document.body.classList.remove('theme-aurora')
    }
  }, [])

  return (
    <div className="bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-[1240px] flex-col gap-8 px-6 py-10">
        <form
          className="flex flex-wrap items-end gap-4 rounded-2xl border border-border bg-surface p-6 shadow-panel-soft"
          onSubmit={handleSubmit}
        >
          <div className="flex min-w-[160px] flex-col gap-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">
            <span>Período</span>
            <Select
              value={formValues.rango}
              onValueChange={(value) =>
                setFormValues((current) => ({ ...current, rango: value }))
              }
            >
              <SelectTrigger className="border-border bg-surface-alt text-foreground">
                <SelectValue placeholder="Selecciona un rango" />
              </SelectTrigger>
              <SelectContent>
                {RANGE_OPTIONS.map((option) => (
                  <SelectItem key={option.value || 'all'} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex min-w-[160px] flex-col gap-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">
            <span>Chat</span>
            <Select
              value={formValues.conChat}
              onValueChange={(value: 'all' | 'with' | 'without') =>
                setFormValues((current) => ({ ...current, conChat: value }))
              }
            >
              <SelectTrigger className="border-border bg-surface-alt text-foreground">
                <SelectValue placeholder="Filtrar por chat" />
              </SelectTrigger>
              <SelectContent>
                {CHAT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex min-w-[120px] flex-col gap-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">
            <span>Estado (CVE)</span>
            <Input
              value={formValues.estado}
              maxLength={3}
              onChange={(event) =>
                setFormValues((current) => ({
                  ...current,
                  estado: event.target.value.replace(/[^0-9A-Za-z]/g, '').slice(0, 3),
                }))
              }
              placeholder="Ej. 09"
              className="border-border bg-surface-alt text-foreground"
            />
          </div>

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

        <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface shadow-panel">
          {loadingState && !hasData && (
            <div className="px-6 pt-6">
              <Skeleton className="h-10 w-full rounded-xl" />
            </div>
          )}

          {error && !loadingState && (
            <div className="px-6 pt-6">
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                {error}
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-border">
                  {headers.map((header, index) => (
                    <TableHead
                      key={header}
                      style={columnStyle(index)}
                      className="relative whitespace-nowrap bg-surface-alt px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-primary"
                    >
                      {header}
                      <span
                        className="o_resize_handle"
                        onMouseDown={handleResizeStart(index)}
                      />
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingState && !hasData ? (
                  Array.from({ length: 3 }).map((_, skeletonIndex) => (
                    <TableRow key={`skeleton-${skeletonIndex}`} className="border-b border-border">
                      {headers.map((_, cellIndex) => (
                        <TableCell
                          key={cellIndex}
                          style={columnStyle(cellIndex)}
                          className="px-4 py-3"
                        >
                          <Skeleton className="h-4 w-full rounded-sm" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : !error && !hasData ? (
                  <TableRow>
                    <TableCell
                      colSpan={COLUMN_COUNT}
                      className="px-4 py-10 text-center text-sm text-muted"
                    >
                      No se encontraron visitas con los filtros actuales.
                    </TableCell>
                  </TableRow>
                ) : error && !hasData ? (
                  <TableRow>
                    <TableCell
                      colSpan={COLUMN_COUNT}
                      className="px-4 py-10 text-center text-sm text-destructive"
                    >
                      {error}
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((row, rowIndex) => {
                    const visitsTotal = Number(row.total_visitas ?? row.visit_count ?? 0)
                    const inbound = Number(row.mensajes_entrantes ?? 0)
                    const chatLabel = row.tuvo_chat
                      ? `Sí (${numberFormatter.format(inbound)} entrantes)`
                      : 'No'

                    const columns = [
                      {
                        value: row.session_id || '—',
                        className: 'font-mono whitespace-nowrap',
                        title: row.session_id || undefined,
                      },
                      {
                        value: row.ip || '—',
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
                        value: chatLabel,
                        className: 'whitespace-nowrap',
                        title: chatLabel,
                      },
                      {
                        value: formatContact(row),
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
                        value: formatDevice(row),
                        className: 'whitespace-nowrap',
                        title: formatDevice(row),
                      },
                      {
                        value: row.referrer || '—',
                        className: 'break-words',
                        title: row.referrer || undefined,
                      },
                      {
                        value: row.landing_url || '—',
                        className: 'break-words',
                        title: row.landing_url || undefined,
                      },
                    ]

                    return (
                      <TableRow
                        key={row.session_id ?? `${rowIndex}`}
                        className="border-b border-border hover:bg-surface-alt/60"
                      >
                        {columns.map((column, columnIndex) => (
                          <TableCell
                            key={columnIndex}
                            style={columnStyle(columnIndex)}
                            title={column.title}
                            className={`px-4 py-3 text-sm text-foreground ${column.className ?? ''}`}
                          >
                            {column.className?.includes('whitespace-pre-line') ? (
                              <span className="whitespace-pre-line">{column.value}</span>
                            ) : (
                              column.value
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>

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
        </section>
      </div>
    </div>
  )
}
