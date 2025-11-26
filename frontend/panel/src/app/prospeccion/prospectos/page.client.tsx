"use client"

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react"
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconLoader,
  IconPhoneCheck,
  IconRefresh,
  IconSearch,
  IconSend2,
} from "@tabler/icons-react"

import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import {
  contactarProspectos,
  listProspectos,
  type ProspectoItem,
  verificarProspectos,
} from "@/lib/prospeccion/prospectos-client"

type FuenteFilter = "" | "google_places" | "denue"
type LookupFilter = "" | "pendiente" | "verificado" | "sin_numero" | "error"
type OrderOption = "creado" | "nombre"

type Filters = {
  search: string
  fuente: FuenteFilter
  lookupStatus: LookupFilter
  segmento: string
  order: OrderOption
}

type BannerState = {
  type: "success" | "error"
  message: string
}

const initialFilters: Filters = {
  search: "",
  fuente: "",
  lookupStatus: "",
  segmento: "",
  order: "creado",
}

const initialContactForm = {
  correoAsunto: "",
  correoCuerpo: "",
  whatsappMensaje: "",
  llamadaNotas: "",
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
}

const PAGE_SIZE_OPTIONS = [10, 25, 50] as const
const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Mexico_City",
})

export default function ProspectosClientPage() {
  return (
    <AppViewLayout title="Prospección · Prospectos">
      <div className="px-4 pb-10 pt-4 md:px-6 lg:px-8">
        <ProspectosView />
      </div>
    </AppViewLayout>
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

  useEffect(() => {
    if (!contactDialogOpen) {
      setContactError(null)
      setContactForm(initialContactForm)
    }
  }, [contactDialogOpen])

  const selectedIds = useMemo(() => Array.from(selected.values()), [selected])
  const selectedCount = selectedIds.length
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
      const totalAcciones = response.contactos?.length ?? payload.prospecto_ids.length
      setBanner({
        type: "success",
        message: `Se registraron ${totalAcciones} acciones de contacto.`,
      })
      setContactDialogOpen(false)
      await fetchProspectos(offset)
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo programar el contacto."
      setContactError(message)
    } finally {
      setAction(null)
    }
  }, [contactForm, fetchProspectos, offset, selectedIds])

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
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
              <Label>Segmento</Label>
              <Input
                value={filters.segmento}
                onChange={(event) => setFilters((prev) => ({ ...prev, segmento: event.target.value }))}
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
                <SelectTrigger>
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
            <Button
              size="sm"
              onClick={() => setContactDialogOpen(true)}
              disabled={!selectedCount || action === "contact"}
            >
              <IconSend2 className="mr-1.5 size-4" />
              Programar contacto
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    <IconLoader className="mr-2 inline size-4 animate-spin" />
                    Cargando prospectos...
                  </TableCell>
                </TableRow>
              ) : null}
              {!loading && !items.length ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    No hay prospectos con los filtros actuales.
                  </TableCell>
                </TableRow>
              ) : null}
              {!loading
                ? items.map((prospecto) => (
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
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{prospecto.phone_e164 || prospecto.phone || "—"}</div>
                        {prospecto.email ? (
                          <div className="text-xs text-muted-foreground">{prospecto.email}</div>
                        ) : null}
                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                          {prospecto.whatsapp_permitido ? (
                            <Badge variant="secondary">WhatsApp permitido</Badge>
                          ) : (
                            <span>WhatsApp pendiente</span>
                          )}
                          {prospecto.llamada_permitida === false ? (
                            <Badge variant="outline">Sin llamadas</Badge>
                          ) : null}
                        </div>
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
                    </TableRow>
                  ))
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
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Programar contacto</DialogTitle>
            <DialogDescription>
              Define los mensajes a enviar por correo o WhatsApp. También puedes dejar notas para llamadas. Solo se
              enviará cada canal con contenido configurado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Asunto del correo</Label>
                <Input
                  value={contactForm.correoAsunto}
                  onChange={(event) => setContactForm((prev) => ({ ...prev, correoAsunto: event.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Notas para llamada</Label>
                <Textarea
                  value={contactForm.llamadaNotas}
                  onChange={(event) => setContactForm((prev) => ({ ...prev, llamadaNotas: event.target.value }))}
                  rows={3}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Cuerpo del correo</Label>
              <Textarea
                value={contactForm.correoCuerpo}
                onChange={(event) => setContactForm((prev) => ({ ...prev, correoCuerpo: event.target.value }))}
                rows={4}
                placeholder="Hola {{nombre}}, vimos que..."
              />
            </div>
            <div className="space-y-1">
              <Label>Mensaje de WhatsApp</Label>
              <Textarea
                value={contactForm.whatsappMensaje}
                onChange={(event) => setContactForm((prev) => ({ ...prev, whatsappMensaje: event.target.value }))}
                rows={4}
                placeholder="Hola, soy del equipo Tal-IA..."
              />
            </div>
            {contactError ? (
              <p className="text-sm text-destructive">{contactError}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {selectedCount
                  ? `${selectedCount} prospectos serán procesados al guardar.`
                  : "Selecciona prospectos antes de programar contacto."}
              </p>
            )}
          </div>
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

function formatDate(value?: string | null) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return DATE_TIME_FORMATTER.format(date)
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
