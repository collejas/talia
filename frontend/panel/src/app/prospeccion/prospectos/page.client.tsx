"use client"

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react"
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconDotsVertical,
  IconLoader,
  IconPencil,
  IconPhoneCheck,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSend2,
  IconTrash,
} from "@tabler/icons-react"

import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import {
  actualizarProspecto,
  crearProspectoManual,
  contactarProspectos,
  eliminarProspecto,
  listProspectos,
  type ProspectoItem,
  type ProspectoManualInput,
  type ProspectoContactoResumen,
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

type ContactResultWithName = ProspectoContactoResumen & { display_name?: string | null }

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
  const [lastBatchId, setLastBatchId] = useState<string | null>(null)
  const [lastContactResults, setLastContactResults] = useState<ContactResultWithName[]>([])

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

  useEffect(() => {
    if (!contactDialogOpen) {
      setContactError(null)
      setContactForm(initialContactForm)
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

  useEffect(() => {
    if (!deleteDialogOpen) {
      setDeleteTarget(null)
      setDeleteError(null)
      setDeleteLoading(false)
    }
  }, [deleteDialogOpen])

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
      const nameMap = new Map(items.map((item) => [item.id, item.display_name]))
      setLastBatchId(response.batch_id ?? null)
      setLastContactResults(
        (response.contactos ?? []).map((resumen) => ({
          ...resumen,
          display_name: nameMap.get(resumen.prospecto_id) ?? null,
        }))
      )
      setBanner({
        type: "success",
        message: response.batch_id
          ? `Se creó el lote ${response.batch_id} con ${totalAcciones} acciones.`
          : `Se registraron ${totalAcciones} acciones de contacto.`,
      })
      setContactDialogOpen(false)
      await fetchProspectos(offset)
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo programar el contacto."
      setContactError(message)
    } finally {
      setAction(null)
    }
  }, [contactForm, fetchProspectos, items, offset, selectedIds])

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

  const handleClearContactResults = () => {
    setLastBatchId(null)
    setLastContactResults([])
  }

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

      {lastContactResults.length ? (
        <section className="rounded-lg border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Último envío de contacto</p>
              <p className="text-xs text-muted-foreground">
                {lastBatchId ? `Lote ${lastBatchId}` : "Ejecución reciente"}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={handleClearContactResults}>
              Ocultar
            </Button>
          </div>
          <div className="mt-4 space-y-3">
            {lastContactResults.map((resultado) => (
              <div
                key={`${resultado.prospecto_id}-${resultado.display_name ?? "anon"}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
              >
                <div>
                  <div className="font-medium">{resultado.display_name || "Prospecto"}</div>
                  <p className="text-xs text-muted-foreground">{resultado.prospecto_id}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {["correo", "whatsapp", "llamada"].map((canal) => {
                    const estado = resultado[canal as keyof ProspectoContactoResumen] as string | undefined
                    if (!estado) return null
                    return (
                      <Badge key={canal} variant={contactStatusVariant(estado)}>
                        {canalLabel(canal)}: {contactStatusLabel(estado)}
                      </Badge>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
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

function contactStatusLabel(value: string | undefined) {
  if (!value) return "Pendiente"
  const normalized = value.toLowerCase()
  switch (normalized) {
    case "enviado":
      return "Enviado"
    case "omitido":
      return "Omitido"
    case "error":
      return "Error"
    case "pendiente":
      return "Pendiente"
    default:
      return normalized
  }
}

function contactStatusVariant(value: string | undefined): "default" | "secondary" | "destructive" | "outline" {
  if (!value) return "secondary"
  const normalized = value.toLowerCase()
  switch (normalized) {
    case "enviado":
      return "secondary"
    case "omitido":
      return "outline"
    case "error":
      return "destructive"
    default:
      return "default"
  }
}

function canalLabel(value: string) {
  switch (value) {
    case "correo":
      return "Correo"
    case "whatsapp":
      return "WhatsApp"
    case "llamada":
      return "Llamada"
    default:
      return value
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
