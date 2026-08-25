"use client"

import { useCallback, useMemo, useState, useTransition } from "react"
import { useForm } from "react-hook-form"
import { IconArrowsUpDown, IconChevronDown, IconChevronUp } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { getActiveTimeZone } from "@/lib/timezone"

import {
  LineaDeNegocio,
  FamiliaProducto,
  createLineaDeNegocio,
  deleteLineaDeNegocio,
  deleteLineasDeNegocioBulk,
  updateLineaDeNegocio,
} from "@/app/settings/productos/actions"
import {
  MediaEditor,
  buildMetadataWithMedia,
  normalizeMediaList,
  type MediaEntry,
} from "@/components/settings/productos/media-editor"
import { formatDeleteErrorMessage } from "@/app/settings/productos/delete-error-messages"

type LineasViewProps = {
  lineas: LineaDeNegocio[]
  familias: FamiliaProducto[]
}

type LineaFormValues = {
  codigo: string
  nombre: string
  descripcion: string
  activo: boolean
}

const LINEA_FORM_DEFAULTS: LineaFormValues = {
  codigo: "",
  nombre: "",
  descripcion: "",
  activo: true,
}

type Feedback = { type: "success" | "error"; message: string }
type PendingAction = "save" | "delete" | "bulk-delete"
type SortKey = "nombre" | "familias" | "estado" | "actualizado"
type SortState = { id: SortKey; desc: boolean } | null

const LINEA_COLLATOR = new Intl.Collator("es", { sensitivity: "base", numeric: true })
const LINEA_UPDATED_FORMATTER = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: getActiveTimeZone(),
})

function sortLineas(
  lineas: LineaDeNegocio[],
  familiasPorLinea: Map<string, number>,
  sortState: SortState,
): LineaDeNegocio[] {
  return [...lineas].sort((a, b) => {
    const direction = sortState?.desc ? -1 : 1
    if (!sortState) {
      return LINEA_COLLATOR.compare(a.nombre, b.nombre)
    }
    let comparison = 0
    switch (sortState.id) {
      case "nombre":
        comparison = LINEA_COLLATOR.compare(a.nombre, b.nombre)
        break
      case "familias":
        comparison = (familiasPorLinea.get(a.id) ?? 0) - (familiasPorLinea.get(b.id) ?? 0)
        break
      case "estado":
        comparison = Number(a.activo) - Number(b.activo)
        break
      case "actualizado":
        comparison = new Date(a.actualizadoEn).getTime() - new Date(b.actualizadoEn).getTime()
        break
      default:
        comparison = 0
    }
    if (comparison === 0) {
      comparison = LINEA_COLLATOR.compare(a.nombre, b.nombre)
    }
    return comparison * direction
  })
}

function SortButton({
  label,
  active,
  desc,
  onClick,
}: {
  label: string
  active: boolean
  desc: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-1 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground"
    >
      <span>{label}</span>
      {active ? (
        desc ? <IconChevronDown className="size-3" /> : <IconChevronUp className="size-3" />
      ) : (
        <IconArrowsUpDown className="size-3" />
      )}
    </button>
  )
}

export function LineasView({ lineas, familias }: LineasViewProps) {
  const [lineasState, setLineasState] = useState(lineas)
  const [sortState, setSortState] = useState<SortState>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<LineaDeNegocio | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [listFeedback, setListFeedback] = useState<Feedback | null>(null)
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [isPending, startTransition] = useTransition()
  const form = useForm<LineaFormValues>({ defaultValues: LINEA_FORM_DEFAULTS })
  const [metadataSeed, setMetadataSeed] = useState<Record<string, unknown>>({})
  const [mediaItems, setMediaItems] = useState<MediaEntry[]>([])
  const [selectedLineas, setSelectedLineas] = useState<string[]>([])
  const lineasIds = useMemo(() => lineasState.map((linea) => linea.id), [lineasState])
  const allLineasSelected = lineasIds.length > 0 && selectedLineas.length === lineasIds.length
  const selectedLineasSet = useMemo(() => new Set(selectedLineas), [selectedLineas])
  const selectedCount = selectedLineas.length
  const isProcessing = pendingAction !== null

  const familiasPorLinea = useMemo(() => {
    const map = new Map<string, number>()
    for (const familia of familias) {
      if (!familia.lineaId) continue
      map.set(familia.lineaId, (map.get(familia.lineaId) ?? 0) + 1)
    }
    return map
  }, [familias])

  const visibleLineas = useMemo(
    () => sortLineas(lineasState, familiasPorLinea, sortState),
    [familiasPorLinea, lineasState, sortState],
  )

  const handleOpenSheet = useCallback(
    (linea?: LineaDeNegocio) => {
      if (linea) {
        form.reset({
          codigo: linea.codigo ?? "",
          nombre: linea.nombre,
          descripcion: linea.descripcion ?? "",
          activo: linea.activo,
        })
        setEditing(linea)
        const baseMetadata =
          linea.metadata && typeof linea.metadata === "object"
            ? JSON.parse(JSON.stringify(linea.metadata))
            : {}
        setMetadataSeed(baseMetadata)
        setMediaItems(normalizeMediaList(baseMetadata))
      } else {
        form.reset(LINEA_FORM_DEFAULTS)
        setEditing(null)
        setMetadataSeed({})
        setMediaItems([])
      }
      setSheetOpen(true)
    },
    [form],
  )

  const closeSheet = useCallback(() => {
    setSheetOpen(false)
    setTimeout(() => {
      form.reset(LINEA_FORM_DEFAULTS)
      setEditing(null)
      setFeedback(null)
      setMetadataSeed({})
      setMediaItems([])
    }, 200)
  }, [form])

  const handleSubmit = form.handleSubmit((values) => {
    if (!editing && !values.codigo.trim()) {
      setFeedback({ type: "error", message: "El código estable es obligatorio al crear una línea." })
      return
    }
    const payload = {
      codigo: values.codigo.trim() || null,
      nombre: values.nombre.trim(),
      descripcion: values.descripcion.trim() || null,
      activo: values.activo,
    }
    if (!payload.nombre) {
      setFeedback({ type: "error", message: "El nombre es obligatorio." })
      return
    }
    setFeedback(null)
    setPendingAction("save")
    startTransition(() => {
      const metadataPayload = buildMetadataWithMedia(metadataSeed, mediaItems)
      const action = editing
        ? updateLineaDeNegocio(editing.id, { ...payload, metadata: metadataPayload })
        : createLineaDeNegocio({ ...payload, metadata: metadataPayload })
      action
        .then((result) => {
          setFeedback({
            type: "success",
            message: editing ? "Línea actualizada." : "Línea creada.",
          })
          setLineasState((prev) => {
            if (editing) {
              return prev.map((item) => (item.id === result.id ? result : item))
            }
            return [result, ...prev]
          })
          closeSheet()
        })
        .catch((error) => {
          console.error("[lineas] save failed", error)
          setFeedback({
            type: "error",
            message:
              error instanceof Error
                ? error.message
                : "No se pudo guardar la línea. Intenta nuevamente.",
          })
        })
        .finally(() => setPendingAction(null))
    })
  })

  const stats = useMemo(() => {
    const activos = lineasState.filter((linea) => linea.activo).length
    return {
      total: lineasState.length,
      activos,
      archivadas: lineasState.length - activos,
    }
  }, [lineasState])

  const toggleSelectLinea = useCallback((id: string) => {
    setSelectedLineas((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id)
      }
      return [...prev, id]
    })
  }, [])

  const handleToggleSelectAll = useCallback(() => {
    setSelectedLineas(allLineasSelected ? [] : [...lineasIds])
  }, [allLineasSelected, lineasIds])

  const handleSort = useCallback((id: SortKey) => {
    setSortState((current) => {
      if (!current || current.id !== id) {
        return { id, desc: false }
      }
      if (!current.desc) {
        return { id, desc: true }
      }
      return null
    })
  }, [])

  const handleDeleteLinea = (linea: LineaDeNegocio) => {
    if (!window.confirm(`¿Eliminar la línea "${linea.nombre}"? Esta acción no se puede deshacer.`)) {
      return
    }
    setFeedback(null)
    setPendingAction("delete")
    startTransition(() => {
      void (async () => {
        try {
          await deleteLineaDeNegocio(linea.id)
          setLineasState((prev) => prev.filter((item) => item.id !== linea.id))
          setSelectedLineas((prev) => prev.filter((id) => id !== linea.id))
          setListFeedback({ type: "success", message: "Línea eliminada correctamente." })
        } catch (error) {
          console.error("[lineas] delete failed", error)
          const message = formatDeleteErrorMessage(
            error instanceof Error ? error.message : String(error),
          )
          setListFeedback({
            type: "error",
            message,
          })
        } finally {
          setPendingAction(null)
        }
      })()
    })
  }

  const handleBulkDelete = () => {
    if (!selectedLineas.length) {
      return
    }
    if (
      !window.confirm(
        `Eliminarás ${selectedLineas.length} línea(s) de negocio. ¿Quieres continuar?`,
      )
    ) {
      return
    }
    setFeedback(null)
    setPendingAction("bulk-delete")
    startTransition(() => {
      void (async () => {
        try {
          const result = await deleteLineasDeNegocioBulk(selectedLineas)
          const deletedIds = result.deleted_ids
          if (deletedIds.length) {
            const deletedSet = new Set(deletedIds)
            setLineasState((prev) => prev.filter((item) => !deletedSet.has(item.id)))
            setSelectedLineas((prev) => prev.filter((id) => !deletedSet.has(id)))
          }
          if (result.failed > 0) {
            const firstError = result.errors[0]
            const message = formatDeleteErrorMessage(
              firstError?.detail || "No se pudieron eliminar algunos registros.",
            )
            setListFeedback({ type: "error", message })
          } else if (deletedIds.length) {
            setListFeedback({
              type: "success",
              message: `Se eliminaron ${deletedIds.length} línea(s).`,
            })
          }
        } catch (error) {
          console.error("[lineas] bulk delete failed", error)
          const message = formatDeleteErrorMessage(
            error instanceof Error ? error.message : String(error),
          )
          setListFeedback({
            type: "error",
            message,
          })
        } finally {
          setPendingAction(null)
        }
      })()
    })
  }

  return (
    <div className="space-y-6 px-4 py-6 lg:px-6">
      <header className="space-y-1">
        <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Productos y servicios
        </p>
        <h1 className="text-2xl font-semibold">Líneas de negocio</h1>
        <p className="text-sm text-muted-foreground max-w-3xl">
          Administra las líneas estratégicas por organización, visualiza cuántas familias están
          asignadas y crea nuevas entradas con sus estados.
        </p>
    </header>
    {listFeedback ? (
      <div
        className={`rounded-xl border px-4 py-3 text-sm ${
          listFeedback.type === "success"
            ? "border-emerald-300 bg-emerald-50 text-emerald-900"
            : "border-destructive/60 bg-destructive/10 text-destructive-900"
        }`}
      >
        {listFeedback.message}
      </div>
    ) : null}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="text-sm text-muted-foreground">
          <p className="text-xs uppercase tracking-wide">Líneas registradas</p>
          <p className="text-lg font-semibold">
            {stats.total} ({stats.activos} activas · {stats.archivadas} archivadas)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="destructive"
            size="sm"
            onClick={handleBulkDelete}
            disabled={!selectedCount || isProcessing}
          >
            Eliminar seleccionadas ({selectedCount})
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleToggleSelectAll}
            disabled={!lineasIds.length}
          >
            {allLineasSelected ? "Deseleccionar todo" : "Seleccionar todo"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleOpenSheet()}>
            Nueva línea
          </Button>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Listado</CardTitle>
          <CardDescription>
            {lineasState.length
              ? "Edita una línea para actualizar su descripción o estado."
              : "No hay líneas registradas; comienza creando la primera."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {lineasState.length === 0 ? (
            <div className="rounded-xl border border-dashed border-muted/60 bg-muted/5 p-6 text-sm text-muted-foreground">
              Cada línea agrupa familias y productos. Crea al menos una para poder asociar el resto
              del catálogo.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border">
              <Table className="table-fixed">
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="w-12 px-3">
                      <Checkbox
                        checked={allLineasSelected}
                        onCheckedChange={handleToggleSelectAll}
                        aria-label="Seleccionar todas las líneas"
                      />
                    </TableHead>
                    <TableHead className="w-[420px]">
                      <SortButton
                        label="Línea"
                        active={sortState?.id === "nombre"}
                        desc={sortState?.id === "nombre" ? sortState.desc : false}
                        onClick={() => handleSort("nombre")}
                      />
                    </TableHead>
                    <TableHead className="w-[160px]">
                      <SortButton
                        label="Familias"
                        active={sortState?.id === "familias"}
                        desc={sortState?.id === "familias" ? sortState.desc : false}
                        onClick={() => handleSort("familias")}
                      />
                    </TableHead>
                    <TableHead className="w-[140px]">
                      <SortButton
                        label="Estado"
                        active={sortState?.id === "estado"}
                        desc={sortState?.id === "estado" ? sortState.desc : false}
                        onClick={() => handleSort("estado")}
                      />
                    </TableHead>
                    <TableHead className="w-[180px]">
                      <SortButton
                        label="Actualizado"
                        active={sortState?.id === "actualizado"}
                        desc={sortState?.id === "actualizado" ? sortState.desc : false}
                        onClick={() => handleSort("actualizado")}
                      />
                    </TableHead>
                    <TableHead className="w-[140px] text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleLineas.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                        No hay líneas registradas.
                      </TableCell>
                    </TableRow>
                  ) : (
                    visibleLineas.map((linea) => (
                      <TableRow key={linea.id} className={cn(!linea.activo && "bg-muted/30")}>
                        <TableCell className="px-3">
                          <Checkbox
                            checked={selectedLineasSet.has(linea.id)}
                            onCheckedChange={() => toggleSelectLinea(linea.id)}
                            aria-label={`Seleccionar línea ${linea.nombre}`}
                          />
                        </TableCell>
                        <TableCell className="overflow-hidden">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="h-12 w-12 overflow-hidden rounded-md border border-muted/40 bg-muted/10">
                              {linea.fotoUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={linea.fotoUrl}
                                  alt={linea.nombre}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                                  Sin imagen
                                </div>
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-medium">{linea.nombre}</p>
                              <p className="truncate text-sm text-muted-foreground">
                                {linea.descripcion || "Sin descripción proporcionada"}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium tabular-nums">
                          {familiasPorLinea.get(linea.id) ?? 0}
                        </TableCell>
                        <TableCell>
                          <Badge variant={linea.activo ? "secondary" : "outline"}>
                            {linea.activo ? "Activa" : "Archivada"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {linea.actualizadoEn ? LINEA_UPDATED_FORMATTER.format(new Date(linea.actualizadoEn)) : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="sm" onClick={() => handleOpenSheet(linea)}>
                              Editar
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteLinea(linea)}
                              disabled={isProcessing}
                              className="text-destructive"
                            >
                              Eliminar
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent position="right" size="content">
          <SheetHeader>
            <SheetTitle>{editing ? "Editar línea" : "Nueva línea"}</SheetTitle>
          </SheetHeader>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-1">
              <Label htmlFor="linea-codigo">Código estable</Label>
              <Input id="linea-codigo" {...form.register("codigo")} placeholder="LIN-001" />
              <p className="text-xs text-muted-foreground">Permite renombrar la línea sin crear otra.</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="linea-nombre">Nombre</Label>
              <Input id="linea-nombre" {...form.register("nombre")} autoFocus />
            </div>
            <div className="space-y-1">
              <Label htmlFor="linea-descripcion">Descripción</Label>
              <Textarea id="linea-descripcion" {...form.register("descripcion")} rows={4} />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="linea-activo" {...form.register("activo")} />
              <Label htmlFor="linea-activo">Activa</Label>
            </div>
            {feedback ? (
              <p
                className={`text-sm ${
                  feedback.type === "success" ? "text-emerald-600" : "text-destructive"
                }`}
              >
                {feedback.message}
              </p>
            ) : null}
            <MediaEditor
              items={mediaItems}
              onChange={setMediaItems}
              title="Imágenes de la línea"
              description="Adjunta imágenes que representen esta línea estratégica y marca una como predeterminada."
            />
            <SheetFooter className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={closeSheet} type="button">
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                variant="default"
                disabled={isPending && pendingAction === "save"}
              >
                {editing ? "Actualizar" : "Crear"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  )
}
