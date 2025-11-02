import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import {
  AlertCircle,
  BadgePercent,
  Building2,
  Filter,
  Flag,
  LayoutList,
  Loader2,
  Mail,
  MoreHorizontal,
  NotebookPen,
  Phone,
  RefreshCw,
  Search,
  Table as TableIcon,
  Tags,
  UserRound,
} from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { useSupabaseSession } from '@/hooks/useSupabaseSession'
import {
  deleteLead,
  fetchLeads,
  updateLead,
  type LeadsQuery,
} from '@/services/leads'
import type { LeadItem, LeadMetadata } from '@/types/leads'

const LIMIT = 50
type Filters = {
  search: string
  canal: string
  etapa: string
  vendedor: string
}

const DEFAULT_FILTERS: Filters = {
  search: '',
  canal: '',
  etapa: '',
  vendedor: '',
}
type ViewMode = 'table' | 'accordion'

const numberFormatter = new Intl.NumberFormat('es-MX')
const dateFormatter = new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'short',
  timeStyle: 'short',
})

type LookupOption = {
  value: string
  label: string
}

type StageOption = {
  value: string
  label: string
  categoria?: string | null
}

type VendorOption = {
  value: string
  label: string
  correo?: string | null
}

type EditFormState = {
  nombre: string
  correo: string
  telefono: string
  etapa: string
  asignado: string
  leadScore: string
  probabilidad: string
  siguienteAccion: string
  tags: string
}

const DEFAULT_EDIT_FORM: EditFormState = {
  nombre: '',
  correo: '',
  telefono: '',
  etapa: '',
  asignado: '',
  leadScore: '',
  probabilidad: '',
  siguienteAccion: '',
  tags: '',
}

function formatDateTime(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date)
}

function formatScore(value?: number | null) {
  if (value === null || value === undefined) return '—'
  return `${numberFormatter.format(value)}%`
}

function normalizeTagLabel(tag: string) {
  return tag.length > 28 ? `${tag.slice(0, 25)}…` : tag
}

function extractMetadataTags(metadata: LeadMetadata): string[] {
  if (!metadata || typeof metadata !== 'object') return []
  const raw = (metadata as Record<string, unknown>).tags
  if (!Array.isArray(raw)) return []
  return raw
    .map((tag) => (typeof tag === 'string' ? tag.trim() : null))
    .filter((tag): tag is string => Boolean(tag))
}

export function LeadsPage() {
  const { toast } = useToast()
  const { loading: sessionLoading } = useSupabaseSession()

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [formValues, setFormValues] = useState<Filters>(DEFAULT_FILTERS)
  const [items, setItems] = useState<LeadItem[]>([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [refreshToken, setRefreshToken] = useState(0)
  const [editLead, setEditLead] = useState<LeadItem | null>(null)
  const [editForm, setEditForm] = useState<EditFormState>(DEFAULT_EDIT_FORM)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deleteLoadingId, setDeleteLoadingId] = useState<string | null>(null)
  const [leadToDelete, setLeadToDelete] = useState<LeadItem | null>(null)
  const [editTab, setEditTab] = useState('general')
  const isDeleting = deleteLoadingId !== null

  const filtersRef = useRef(filters)
  const itemsRef = useRef(items)

  useEffect(() => {
    filtersRef.current = filters
  }, [filters])

  useEffect(() => {
    itemsRef.current = items
  }, [items])

  const fetchData = useCallback(
    async ({ reset }: { reset: boolean }) => {
      if (sessionLoading) return
      if (reset) {
        setIsLoading(true)
      } else {
        if (!hasMore) return
        setIsLoadingMore(true)
      }
      setError(null)
      try {
        const currentFilters = filtersRef.current
        const query: LeadsQuery = {
          limit: LIMIT,
          offset: reset ? 0 : itemsRef.current.length,
        }
        if (currentFilters.search) {
          query.search = currentFilters.search
        }
        if (currentFilters.canal) {
          query.canal = currentFilters.canal
        }
        if (currentFilters.etapa) {
          query.etapa = currentFilters.etapa
        }
        if (currentFilters.vendedor) {
          query.vendedor = currentFilters.vendedor
        }

        const result = await fetchLeads(query)
        setItems((prev) => (reset ? result.items : [...prev, ...result.items]))
        setTotal(result.total)
        setHasMore(result.hasMore)
      } catch (err) {
        console.error('[leads] fetch error', err)
        setItems((prev) => (reset ? [] : prev))
        setHasMore(false)
        setError(
          err instanceof Error && err.message
            ? err.message
            : 'No se pudo obtener la lista de leads.',
        )
      } finally {
        setIsLoading(false)
        setIsLoadingMore(false)
      }
    },
    [sessionLoading, hasMore],
  )

  useEffect(() => {
    if (sessionLoading) return
    void fetchData({ reset: true })
  }, [sessionLoading, filters, refreshToken, fetchData])

  const lookups = useMemo(() => {
    const canalesMap = new Map<string, LookupOption>()
    const etapasMap = new Map<string, StageOption>()
    const vendedoresMap = new Map<string, VendorOption>()

    for (const lead of items) {
      if (lead.canal) {
        const key = lead.canal.toLowerCase()
        if (!canalesMap.has(key)) {
          const label = lead.canal.charAt(0).toUpperCase() + lead.canal.slice(1)
          canalesMap.set(key, { value: lead.canal, label })
        }
      }
      if (lead.etapa?.id && !etapasMap.has(lead.etapa.id)) {
        etapasMap.set(lead.etapa.id, {
          value: lead.etapa.id,
          label: lead.etapa.nombre || 'Sin etapa',
          categoria: lead.etapa.categoria,
        })
      }
      if (lead.asignado?.id && !vendedoresMap.has(lead.asignado.id)) {
        const label = lead.asignado.nombre || lead.asignado.correo || lead.asignado.id || 'Sin asignar'
        vendedoresMap.set(lead.asignado.id, {
          value: lead.asignado.id,
          label,
          correo: lead.asignado.correo ?? undefined,
        })
      }
    }

    const canales = Array.from(canalesMap.values()).sort((a, b) =>
      a.label.localeCompare(b.label, 'es'),
    )
    const etapas = Array.from(etapasMap.values()).sort((a, b) =>
      (a.label || '').localeCompare(b.label || '', 'es'),
    )
    const vendedores = Array.from(vendedoresMap.values()).sort((a, b) =>
      (a.label || '').localeCompare(b.label || '', 'es'),
    )

    return { canales, etapas, vendedores }
  }, [items])

  const summaryText = useMemo(() => {
    if (isLoading && !items.length) return 'Cargando leads...'
    if (!items.length) return 'Sin leads para mostrar.'
    const loaded = numberFormatter.format(items.length)
    const totalLabel = numberFormatter.format(total)
    return `Mostrando ${loaded} de ${totalLabel} leads`
  }, [isLoading, items.length, total])

  const handleSubmitFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFilters({ ...formValues })
  }

  const handleResetFilters = () => {
    setFormValues(DEFAULT_FILTERS)
    setFilters(DEFAULT_FILTERS)
  }

  const handleRefresh = () => {
    setRefreshToken((token) => token + 1)
  }

  const handleLoadMore = () => {
    if (isLoading || isLoadingMore || !hasMore) return
    void fetchData({ reset: false })
  }

  const openEditDialog = (lead: LeadItem) => {
    setEditLead(lead)
    setEditTab('general')
    setEditForm({
      nombre: lead.contacto.nombre ?? '',
      correo: lead.contacto.correo ?? '',
      telefono: lead.contacto.telefono ?? '',
      etapa: lead.etapa?.id ?? '',
      asignado: lead.asignado?.id ?? '',
      leadScore: lead.lead_score !== null && lead.lead_score !== undefined ? String(lead.lead_score) : '',
      probabilidad: lead.probabilidad !== null && lead.probabilidad !== undefined ? String(lead.probabilidad) : '',
      siguienteAccion: lead.siguiente_accion ?? '',
      tags:
        lead.tags && lead.tags.length
          ? lead.tags.join(', ')
          : extractMetadataTags(lead.metadata).join(', '),
    })
  }

  const closeEditDialog = () => {
    setEditLead(null)
    setEditForm(DEFAULT_EDIT_FORM)
    setIsSubmitting(false)
    setEditTab('general')
  }

  const handleSubmitEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editLead) return

    if (!editForm.etapa) {
      toast({
        title: 'Selecciona una etapa',
        description: 'Debes elegir la etapa del lead antes de guardar.',
      })
      return
    }

    setIsSubmitting(true)
    try {
      const metadata: Record<string, unknown> =
        editLead.metadata && typeof editLead.metadata === 'object' && !Array.isArray(editLead.metadata)
          ? { ...(editLead.metadata as Record<string, unknown>) }
          : {}

      const trimmedNext = editForm.siguienteAccion.trim()
      if (trimmedNext) {
        metadata.siguiente_accion = trimmedNext
      } else {
        delete metadata.siguiente_accion
      }

      const tags = editForm.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)

      const payload = {
        etapa_id: editForm.etapa,
        asignado_a_usuario_id: editForm.asignado || null,
        lead_score: editForm.leadScore ? Number.parseInt(editForm.leadScore, 10) : null,
        probabilidad_override: editForm.probabilidad ? Number.parseFloat(editForm.probabilidad) : null,
        metadata,
        tags,
        siguiente_accion: trimmedNext || null,
        contacto: {
          nombre: editForm.nombre ? editForm.nombre.trim() : null,
          correo: editForm.correo ? editForm.correo.trim().toLowerCase() : null,
          telefono: editForm.telefono ? editForm.telefono.trim() : null,
        },
      }

      await updateLead(editLead.id, payload)

      toast({
        title: 'Lead actualizado',
        description: 'Se guardaron los cambios correctamente.',
      })
      closeEditDialog()
      setRefreshToken((token) => token + 1)
    } catch (err) {
      console.error('[leads] update error', err)
      toast({
        title: 'Hubo un problema al guardar',
        description:
          err instanceof Error && err.message
            ? err.message
            : 'No se pudo actualizar el lead, intenta de nuevo.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteLead = async (lead: LeadItem) => {
    const nombre = lead.contacto.nombre || lead.id
    setDeleteLoadingId(lead.id)
    let success = false
    try {
      await deleteLead(lead.id)
      toast({
        title: 'Lead eliminado',
        description: `Se eliminó "${nombre}" correctamente.`,
      })
      if (editLead?.id === lead.id) {
        closeEditDialog()
      }
      setRefreshToken((token) => token + 1)
      success = true
    } catch (err) {
      console.error('[leads] delete error', err)
      toast({
        title: 'No se pudo eliminar',
        description:
          err instanceof Error && err.message
            ? err.message
            : 'Ocurrió un error al eliminar el lead.',
      })
    } finally {
      setDeleteLoadingId(null)
    }
    return success
  }

  const requestDeleteLead = (lead: LeadItem) => {
    if (isDeleting) return
    setLeadToDelete(lead)
  }

  const handleConfirmDelete = async () => {
    if (!leadToDelete) return
    const success = await handleDeleteLead(leadToDelete)
    if (success) {
      setLeadToDelete(null)
    }
  }

  const canalOptions: LookupOption[] = lookups.canales
  const etapaOptions: StageOption[] = lookups.etapas
  const vendedorOptions: VendorOption[] = lookups.vendedores

  const showSkeleton = isLoading && !items.length
  const showEmptyState = !isLoading && !items.length && !error

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-4 px-6 pt-1 pb-4">
        <Card className="border-border bg-surface shadow-panel-soft">
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-alt px-4 py-3">
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <Filter className="h-4 w-4" />
                <Badge variant="outline" className="bg-surface text-foreground">
                  Vista: {viewMode === 'table' ? 'Tabla' : 'Accordion'}
                </Badge>
                {filters.canal ? (
                  <Badge variant="outline" className="bg-surface text-foreground">
                    Canal: {filters.canal}
                  </Badge>
                ) : null}
                {filters.etapa ? (
                  <Badge variant="outline" className="bg-surface text-foreground">
                    Etapa: {filters.etapa}
                  </Badge>
                ) : null}
                {filters.vendedor ? (
                  <Badge variant="outline" className="bg-surface text-foreground">
                    Vendedor: {filters.vendedor}
                  </Badge>
                ) : null}
                {!filters.canal && !filters.etapa && !filters.vendedor ? (
                  <span>Sin filtros activos</span>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={viewMode === 'table' ? 'secondary' : 'ghost'}
                  onClick={() => setViewMode('table')}
                >
                  <TableIcon className="mr-2 h-4 w-4" />
                  Tabla
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={viewMode === 'accordion' ? 'secondary' : 'ghost'}
                  onClick={() => setViewMode('accordion')}
                >
                  <LayoutList className="mr-2 h-4 w-4" />
                  Accordion
                </Button>
              </div>
            </div>
            <form className="grid gap-4 md:grid-cols-2 lg:grid-cols-4" onSubmit={handleSubmitFilters}>
              <div className="flex flex-col gap-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-muted">
                <span>Buscar</span>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={formValues.search}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        search: event.target.value,
                      }))
                    }
                    placeholder="Nombre, correo, teléfono..."
                    className="pl-9 border-border bg-surface-alt text-foreground"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-muted">
                <span>Canal</span>
                <Select
                  value={formValues.canal || 'all'}
                  onValueChange={(value) =>
                    setFormValues((current) => ({
                      ...current,
                      canal: value === 'all' ? '' : value,
                    }))
                  }
                >
                  <SelectTrigger className="border-border bg-surface-alt text-foreground">
                    <SelectValue placeholder="Todos los canales" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los canales</SelectItem>
                    {canalOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-muted">
                <span>Etapa</span>
                <Select
                  value={formValues.etapa || 'all'}
                  onValueChange={(value) =>
                    setFormValues((current) => ({
                      ...current,
                      etapa: value === 'all' ? '' : value,
                    }))
                  }
                >
                  <SelectTrigger className="border-border bg-surface-alt text-foreground">
                    <SelectValue placeholder="Todas las etapas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las etapas</SelectItem>
                    {etapaOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.categoria ? `${option.label} • ${option.categoria}` : option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-muted">
                <span>Vendedor</span>
                <Select
                  value={formValues.vendedor || 'all'}
                  onValueChange={(value) =>
                    setFormValues((current) => ({
                      ...current,
                      vendedor: value === 'all' ? '' : value,
                    }))
                  }
                >
                  <SelectTrigger className="border-border bg-surface-alt text-foreground">
                    <SelectValue placeholder="Todos los vendedores" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los vendedores</SelectItem>
                    {vendedorOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-wrap items-center gap-3 md:col-span-2 lg:col-span-4">
                <Button type="submit" disabled={isLoading}>
                  Aplicar filtros
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleResetFilters}
                  disabled={isLoading}
                >
                  Limpiar
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleRefresh}
                  disabled={isLoading}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Actualizar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {error ? (
          <Alert
            variant="destructive"
            className="border border-destructive/40 bg-destructive/10 text-destructive shadow-panel-soft"
          >
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error al cargar leads</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {showEmptyState ? (
          <Alert className="border border-border bg-surface shadow-panel-soft">
            <AlertCircle className="h-4 w-4 text-primary" />
            <AlertTitle>No hay resultados</AlertTitle>
            <AlertDescription>
              Ajusta los filtros o busca por otro término para visualizar leads.
            </AlertDescription>
          </Alert>
        ) : null}

        <Card className="border-border bg-surface shadow-panel">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl font-semibold">Listado de leads</CardTitle>
            <p className="text-sm text-muted-foreground">{summaryText}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {showSkeleton ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={`lead-skeleton-${index}`} className="rounded-lg border border-border bg-surface-alt p-4 shadow-panel-soft">
                    <div className="flex flex-col gap-3">
                      <Skeleton className="h-5 w-1/3" />
                      <Skeleton className="h-4 w-1/2" />
                      <Skeleton className="h-4 w-1/4" />
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {!showSkeleton && viewMode === 'table' ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-border bg-surface-alt">
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">Lead</TableHead>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">Contacto</TableHead>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">Canal</TableHead>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">Etapa</TableHead>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">Vendedor</TableHead>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">Score</TableHead>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">Creado</TableHead>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((lead) => {
                      const metadataTags = lead.tags && lead.tags.length ? lead.tags : extractMetadataTags(lead.metadata)
                      return (
                        <TableRow key={lead.id} className="border-b border-border">
                          <TableCell className="px-4 py-3 align-top">
                            <div className="flex flex-col gap-1">
                              <span className="font-semibold text-foreground">{lead.contacto.nombre || 'Sin nombre'}</span>
                              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                <Flag className="h-4 w-4 text-primary/80" />
                                <span>{lead.tablero?.nombre || 'Tablero general'}</span>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="px-4 py-3 align-top">
                            <div className="flex flex-col gap-1 text-sm text-foreground">
                              <div className="flex items-center gap-2">
                                <Mail className="h-4 w-4 text-muted-foreground" />
                                <span>{lead.contacto.correo || 'Sin correo'}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Phone className="h-4 w-4 text-muted-foreground" />
                                <span>{lead.contacto.telefono || 'Sin teléfono'}</span>
                              </div>
                              {lead.contacto.empresa ? (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <Building2 className="h-4 w-4" />
                                  <span>{lead.contacto.empresa}</span>
                                </div>
                              ) : null}
                              {lead.contacto.notasIA ? (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <NotebookPen className="h-4 w-4" />
                                  <span className="line-clamp-2">{lead.contacto.notasIA}</span>
                                </div>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="px-4 py-3 align-top text-sm text-foreground">
                            {lead.canal ? (
                              <Badge variant="outline" className="bg-surface text-foreground">
                                {lead.canal}
                              </Badge>
                            ) : (
                              '—'
                            )}
                          </TableCell>
                          <TableCell className="px-4 py-3 align-top text-sm text-foreground">
                            {lead.etapa?.nombre || 'Sin etapa'}
                          </TableCell>
                          <TableCell className="px-4 py-3 align-top text-sm text-foreground">
                            <div className="flex flex-col gap-1">
                              <span>{lead.asignado?.nombre || lead.asignado?.correo || 'Sin asignar'}</span>
                              {lead.asignado?.correo ? (
                                <span className="text-xs text-muted-foreground">{lead.asignado.correo}</span>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="px-4 py-3 align-top text-sm text-foreground">
                            {formatScore(lead.lead_score)}
                            {lead.probabilidad !== null && lead.probabilidad !== undefined ? (
                              <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                                <BadgePercent className="h-3 w-3" />
                                <span>{numberFormatter.format(lead.probabilidad)}%</span>
                              </div>
                            ) : null}
                          </TableCell>
                          <TableCell className="px-4 py-3 align-top text-sm text-foreground">
                            <div className="flex flex-col gap-1">
                              <span>{formatDateTime(lead.creado_en)}</span>
                              {lead.siguiente_accion ? (
                                <span className="text-xs text-muted-foreground">
                                  Próxima acción: {lead.siguiente_accion}
                                </span>
                              ) : null}
                              {metadataTags.length ? (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {metadataTags.slice(0, 4).map((tag) => (
                                    <Badge key={`${lead.id}-tag-${tag}`} variant="outline" className="bg-surface text-foreground">
                                      <Tags className="mr-1 h-3 w-3" />
                                      {normalizeTagLabel(tag)}
                                    </Badge>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="px-4 py-3 align-top">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8"
                                  disabled={isSubmitting || deleteLoadingId === lead.id}
                                >
                                  {deleteLoadingId === lead.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <MoreHorizontal className="h-4 w-4" />
                                  )}
                                  <span className="sr-only">Abrir acciones</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onSelect={() => openEditDialog(lead)}>
                                  Editar
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onSelect={(event) => {
                                    event.preventDefault()
                                    requestDeleteLead(lead)
                                  }}
                                  disabled={deleteLoadingId === lead.id}
                                  className="text-destructive focus:text-destructive"
                                >
                                  Eliminar
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : null}

            {!showSkeleton && viewMode === 'accordion' ? (
              <Accordion type="multiple" className="space-y-3">
                {items.map((lead) => {
                  const metadataTags = lead.tags && lead.tags.length ? lead.tags : extractMetadataTags(lead.metadata)
                  return (
                    <AccordionItem key={`lead-accordion-${lead.id}`} value={lead.id}>
                      <AccordionTrigger>
                        <div className="flex flex-1 flex-col gap-1 text-left">
                          <span className="text-sm font-semibold text-foreground">{lead.contacto.nombre || 'Sin nombre'}</span>
                          <span className="text-xs text-muted-foreground">
                            {lead.etapa?.nombre || 'Sin etapa'} •{' '}
                            {lead.asignado?.nombre || lead.asignado?.correo || 'Sin asignar'}
                          </span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-3 text-sm text-foreground">
                            <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                              Contacto
                            </h4>
                            <div className="flex items-center gap-2">
                              <Mail className="h-4 w-4 text-muted-foreground" />
                              <span>{lead.contacto.correo || 'Sin correo'}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Phone className="h-4 w-4 text-muted-foreground" />
                              <span>{lead.contacto.telefono || 'Sin teléfono'}</span>
                            </div>
                            {lead.contacto.empresa ? (
                              <div className="flex items-center gap-2">
                                <Building2 className="h-4 w-4 text-muted-foreground" />
                                <span>{lead.contacto.empresa}</span>
                              </div>
                            ) : null}
                            <div className="flex items-center gap-2">
                              <TableIcon className="h-4 w-4 text-muted-foreground" />
                              <span>Canal: {lead.canal || '—'}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <UserRound className="h-4 w-4 text-muted-foreground" />
                              <span>
                                Asignado: {lead.asignado?.nombre || lead.asignado?.correo || 'Sin asignar'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Flag className="h-4 w-4 text-muted-foreground" />
                              <span>Etapa: {lead.etapa?.nombre || 'Sin etapa'}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <BadgePercent className="h-4 w-4 text-muted-foreground" />
                              <span>Score: {formatScore(lead.lead_score)}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Tags className="h-4 w-4 text-muted-foreground" />
                              <span>Creado: {formatDateTime(lead.creado_en)}</span>
                            </div>
                          </div>
                          <div className="space-y-3 text-sm text-foreground">
                            <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                              Detalles y notas
                            </h4>
                            {lead.siguiente_accion ? (
                              <div className="rounded-md border border-border bg-surface-alt p-3 text-sm">
                                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                                  Próxima acción
                                </span>
                                <p className="mt-1 whitespace-pre-wrap">{lead.siguiente_accion}</p>
                              </div>
                            ) : null}
                            {lead.contacto.notasIA ? (
                              <div className="rounded-md border border-border bg-surface-alt p-3 text-sm">
                                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                                  Notas IA
                                </span>
                                <p className="mt-1 whitespace-pre-wrap">{lead.contacto.notasIA}</p>
                              </div>
                            ) : null}
                            {lead.contacto.resumenIA ? (
                              <div className="rounded-md border border-border bg-surface-alt p-3 text-sm">
                                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                                  Resumen IA
                                </span>
                                <p className="mt-1 whitespace-pre-wrap">{lead.contacto.resumenIA}</p>
                              </div>
                            ) : null}
                            {metadataTags.length ? (
                              <div className="flex flex-wrap gap-2">
                                {metadataTags.map((tag) => (
                                  <Badge key={`${lead.id}-tag-pill-${tag}`} variant="outline" className="bg-surface text-foreground">
                                    {normalizeTagLabel(tag)}
                                  </Badge>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </div>
                        {lead.metadata && Object.keys(lead.metadata).length ? (
                          <div className="mt-4 rounded-md border border-border bg-surface-alt p-4 text-xs text-muted-foreground">
                            <span className="font-semibold uppercase tracking-[0.08em]">Metadata</span>
                            <pre className="mt-2 whitespace-pre-wrap">
                              {JSON.stringify(lead.metadata, null, 2)}
                            </pre>
                          </div>
                        ) : null}
                        <div className="mt-4 flex items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => openEditDialog(lead)}
                            disabled={isSubmitting || deleteLoadingId === lead.id}
                          >
                            Editar lead
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => requestDeleteLead(lead)}
                            disabled={deleteLoadingId === lead.id || isSubmitting}
                          >
                            {deleteLoadingId === lead.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              'Eliminar'
                            )}
                          </Button>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  )
                })}
              </Accordion>
            ) : null}

            <div className="flex items-center justify-between gap-4 border-t border-border bg-surface-alt px-4 py-3 text-sm text-muted">
              <span>
                {total > 0
                  ? `${numberFormatter.format(Math.min(items.length, total))} de ${numberFormatter.format(total)} leads`
                  : '0 leads'}
              </span>
              <Button
                type="button"
                variant="outline"
                onClick={handleLoadMore}
                disabled={!hasMore || isLoadingMore || isLoading}
              >
                {isLoadingMore ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Cargando...
                  </>
                ) : hasMore ? (
                  'Cargar más'
                ) : (
                  'Sin más resultados'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Dialog open={Boolean(editLead)} onOpenChange={(open) => (open ? null : closeEditDialog())}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Editar lead</DialogTitle>
              <DialogDescription>
                Actualiza la información del lead para mantener la trazabilidad al día.
              </DialogDescription>
            </DialogHeader>
            {editLead ? (
              <form className="space-y-6" onSubmit={handleSubmitEdit}>
                <Tabs value={editTab} onValueChange={setEditTab}>
                  <TabsList className="w-full">
                    <TabsTrigger value="general" className="flex-1">
                      Contacto
                    </TabsTrigger>
                    <TabsTrigger value="seguimiento" className="flex-1">
                      Seguimiento
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="general">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                        <span>Nombre del contacto</span>
                        <Input
                          value={editForm.nombre}
                          onChange={(event) =>
                            setEditForm((current) => ({ ...current, nombre: event.target.value }))
                          }
                          placeholder="Nombre completo"
                          disabled={isSubmitting}
                        />
                      </div>
                      <div className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                        <span>Correo electrónico</span>
                        <Input
                          type="email"
                          value={editForm.correo}
                          onChange={(event) =>
                            setEditForm((current) => ({ ...current, correo: event.target.value }))
                          }
                          placeholder="correo@ejemplo.com"
                          disabled={isSubmitting}
                        />
                      </div>
                      <div className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                        <span>Teléfono</span>
                        <Input
                          value={editForm.telefono}
                          onChange={(event) =>
                            setEditForm((current) => ({ ...current, telefono: event.target.value }))
                          }
                          placeholder="+52..."
                          disabled={isSubmitting}
                        />
                      </div>
                      <div className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                        <span>Etapa</span>
                        <Select
                          value={editForm.etapa}
                          onValueChange={(value) =>
                            setEditForm((current) => ({ ...current, etapa: value }))
                          }
                          disabled={isSubmitting}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona etapa…" />
                          </SelectTrigger>
                          <SelectContent>
                            {etapaOptions.map((option) => (
                              <SelectItem key={`edit-etapa-${option.value}`} value={option.value}>
                                {option.categoria ? `${option.label} • ${option.categoria}` : option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="md:col-span-2 flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                        <span>Vendedor asignado</span>
                        <Select
                          value={editForm.asignado}
                          onValueChange={(value) =>
                            setEditForm((current) => ({ ...current, asignado: value }))
                          }
                          disabled={isSubmitting}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Sin asignar" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">Sin asignar</SelectItem>
                            {vendedorOptions.map((option) => (
                              <SelectItem key={`edit-vendedor-${option.value}`} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </TabsContent>
                  <TabsContent value="seguimiento">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                        <span>Lead score</span>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={editForm.leadScore}
                          onChange={(event) =>
                            setEditForm((current) => ({ ...current, leadScore: event.target.value }))
                          }
                          placeholder="0-100"
                          disabled={isSubmitting}
                        />
                      </div>
                      <div className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                        <span>Probabilidad (%)</span>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step={0.1}
                          value={editForm.probabilidad}
                          onChange={(event) =>
                            setEditForm((current) => ({ ...current, probabilidad: event.target.value }))
                          }
                          placeholder="0-100"
                          disabled={isSubmitting}
                        />
                      </div>
                    </div>
                    <div className="mt-4 grid gap-4">
                      <div className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                        <span>Siguiente acción</span>
                        <Textarea
                          value={editForm.siguienteAccion}
                          onChange={(event) =>
                            setEditForm((current) => ({ ...current, siguienteAccion: event.target.value }))
                          }
                          placeholder="Describe la siguiente acción acordada"
                          disabled={isSubmitting}
                        />
                      </div>
                      <div className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                        <span>Tags (separados por coma)</span>
                        <Input
                          value={editForm.tags}
                          onChange={(event) =>
                            setEditForm((current) => ({ ...current, tags: event.target.value }))
                          }
                          placeholder="Ej. demo, seguimiento, prioridad"
                          disabled={isSubmitting}
                        />
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={closeEditDialog}
                    disabled={isSubmitting}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Guardando...
                      </>
                    ) : (
                      'Guardar cambios'
                    )}
                  </Button>
                </div>
              </form>
            ) : null}
          </DialogContent>
        </Dialog>
        <AlertDialog
          open={Boolean(leadToDelete)}
          onOpenChange={(open) => {
            if (!open && !isDeleting) {
              setLeadToDelete(null)
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminar lead</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acción eliminará el lead{' '}
                <span className="font-semibold">
                  {leadToDelete?.contacto.nombre || leadToDelete?.id || ''}
                </span>
                . No podrás deshacerlo.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                disabled={isDeleting}
                onClick={(event) => {
                  event.preventDefault()
                  void handleConfirmDelete()
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive"
              >
                {isDeleting && leadToDelete ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Eliminando...
                  </>
                ) : (
                  'Eliminar'
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
