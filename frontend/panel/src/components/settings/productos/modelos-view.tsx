"use client"

import { useCallback, useMemo, useState, useTransition } from "react"
import { useForm } from "react-hook-form"
import { IconArrowsUpDown, IconChevronDown, IconChevronUp } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { getActiveTimeZone } from "@/lib/timezone"

import {
  FamiliaProducto,
  LineaDeNegocio,
  ModeloProducto,
  createModeloProducto,
  deleteModelosProductoBulk,
  deleteModeloProducto,
  updateModeloProducto,
} from "@/app/settings/productos/actions"
import {
  MediaEditor,
  buildMetadataWithMedia,
  normalizeMediaList,
  type MediaEntry,
} from "@/components/settings/productos/media-editor"
import { formatDeleteErrorMessage } from "@/app/settings/productos/delete-error-messages"

type ModelosViewProps = {
  modelos: ModeloProducto[]
  familias: FamiliaProducto[]
  lineas: LineaDeNegocio[]
}

type ModeloFormValues = {
  nombre: string
  descripcion: string
  activo: boolean
  familiaId: string
}

const MODELO_FORM_DEFAULTS: ModeloFormValues = {
  nombre: "",
  descripcion: "",
  activo: true,
  familiaId: "",
}

type Feedback = { type: "success" | "error"; message: string }
type PendingAction = "save" | "delete" | "bulk-delete"
type SortKey = "nombre" | "familia" | "linea" | "estado" | "actualizado"
type SortState = { id: SortKey; desc: boolean } | null

const formatter = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: getActiveTimeZone(),
})
const MODELO_COLLATOR = new Intl.Collator("es", { sensitivity: "base", numeric: true })
const ALL_LINEA_OPTION = "__all_lines__"
const ALL_FAMILIA_OPTION = "__all_families__"

function formatDate(value: string): string {
  const parsed = value ? new Date(value) : null
  if (!parsed || Number.isNaN(parsed.getTime())) {
    return "—"
  }
  return formatter.format(parsed)
}

function sortModelos(
  modelos: ModeloProducto[],
  familiaMap: Map<string, FamiliaProducto>,
  lineaMap: Map<string, LineaDeNegocio>,
  sortState: SortState,
): ModeloProducto[] {
  return [...modelos].sort((a, b) => {
    const direction = sortState?.desc ? -1 : 1
    if (!sortState) {
      return MODELO_COLLATOR.compare(a.nombre, b.nombre)
    }
    let comparison = 0
    switch (sortState.id) {
      case "nombre":
        comparison = MODELO_COLLATOR.compare(a.nombre, b.nombre)
        break
      case "familia":
        comparison = MODELO_COLLATOR.compare(
          familiaMap.get(a.familiaId ?? "")?.nombre ?? "",
          familiaMap.get(b.familiaId ?? "")?.nombre ?? "",
        )
        break
      case "linea":
        comparison = MODELO_COLLATOR.compare(
          lineaMap.get(familiaMap.get(a.familiaId ?? "")?.lineaId ?? "")?.nombre ?? "",
          lineaMap.get(familiaMap.get(b.familiaId ?? "")?.lineaId ?? "")?.nombre ?? "",
        )
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
      comparison = MODELO_COLLATOR.compare(a.nombre, b.nombre)
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

export function ModelosView({ modelos, familias, lineas }: ModelosViewProps) {
  const familiaMap = useMemo(() => {
    const map = new Map<string, FamiliaProducto>()
    familias.forEach((familia) => map.set(familia.id, familia))
    return map
  }, [familias])
  const lineaMap = useMemo(() => {
    const map = new Map<string, LineaDeNegocio>()
    lineas.forEach((linea) => map.set(linea.id, linea))
    return map
  }, [lineas])
  const [modelosState, setModelosState] = useState(modelos)
  const [sortState, setSortState] = useState<SortState>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<ModeloProducto | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [isPending, startTransition] = useTransition()
  const form = useForm<ModeloFormValues>({ defaultValues: MODELO_FORM_DEFAULTS })
  const [metadataSeed, setMetadataSeed] = useState<Record<string, unknown>>({})
  const [mediaItems, setMediaItems] = useState<MediaEntry[]>([])
  const [selectedModelos, setSelectedModelos] = useState<string[]>([])
  const [listFeedback, setListFeedback] = useState<Feedback | null>(null)
  const [filterLinea, setFilterLinea] = useState("")
  const [filterFamilia, setFilterFamilia] = useState("")

  const handleOpenSheet = useCallback(
    (modelo?: ModeloProducto) => {
      if (modelo) {
        form.reset({
          nombre: modelo.nombre,
          descripcion: modelo.descripcion ?? "",
          activo: modelo.activo,
          familiaId: modelo.familiaId ?? "",
        })
        setEditing(modelo)
        const baseMetadata =
          modelo.metadata && typeof modelo.metadata === "object"
            ? JSON.parse(JSON.stringify(modelo.metadata))
            : {}
        setMetadataSeed(baseMetadata)
        setMediaItems(normalizeMediaList(baseMetadata))
      } else {
        form.reset(MODELO_FORM_DEFAULTS)
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
      form.reset(MODELO_FORM_DEFAULTS)
      setEditing(null)
      setFeedback(null)
      setMetadataSeed({})
      setMediaItems([])
    }, 200)
  }, [form])

  const handleSubmit = form.handleSubmit((values) => {
    const payload = {
      nombre: values.nombre.trim(),
      descripcion: values.descripcion.trim() || null,
      activo: values.activo,
      familiaId: values.familiaId || null,
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
        ? updateModeloProducto(editing.id, { ...payload, metadata: metadataPayload })
        : createModeloProducto({ ...payload, metadata: metadataPayload })
      action
        .then((result) => {
          setFeedback({
            type: "success",
            message: editing ? "Modelo actualizado." : "Modelo creado.",
          })
          setModelosState((prev) => {
            if (editing) {
              return prev.map((item) => (item.id === result.id ? result : item))
            }
            return [result, ...prev]
          })
          closeSheet()
        })
        .catch((error) => {
          console.error("[modelos] save failed", error)
          setFeedback({
            type: "error",
            message:
              error instanceof Error
                ? error.message
                : "No se pudo guardar el modelo. Intenta nuevamente.",
          })
        })
        .finally(() => setPendingAction(null))
    })
  })

  const summaryText = useMemo(() => {
    const activos = modelosState.filter((modelo) => modelo.activo).length
    return `${modelosState.length} modelos (${activos} activos)`
  }, [modelosState])

  const visibleFamilias = useMemo(() => {
    if (!filterLinea) {
      return familias
    }
    return familias.filter((familia) => familia.lineaId === filterLinea)
  }, [familias, filterLinea])

  const filteredModelos = useMemo(() => {
    return modelosState.filter((modelo) => {
      if (filterFamilia && modelo.familiaId !== filterFamilia) {
        return false
      }
      if (filterLinea && modelo.familiaId) {
        const familia = familias.find((entry) => entry.id === modelo.familiaId)
        return familia?.lineaId === filterLinea
      }
      return true
    })
  }, [modelosState, filterFamilia, filterLinea, familias])

  const visibleModelos = useMemo(
    () => sortModelos(filteredModelos, familiaMap, lineaMap, sortState),
    [familiaMap, filteredModelos, lineaMap, sortState],
  )

  const modelosIds = useMemo(() => modelosState.map((modelo) => modelo.id), [modelosState])
  const allModelosSelected = modelosIds.length > 0 && selectedModelos.length === modelosIds.length
  const selectedModelosSet = useMemo(() => new Set(selectedModelos), [selectedModelos])
  const selectedCount = selectedModelos.length
  const isProcessing = pendingAction !== null

  const toggleSelectModelo = useCallback((id: string) => {
    setSelectedModelos((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id)
      }
      return [...prev, id]
    })
  }, [])

  const handleToggleSelectAllModelos = useCallback(() => {
    setSelectedModelos(allModelosSelected ? [] : [...modelosIds])
  }, [allModelosSelected, modelosIds])

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

  const handleDeleteModelo = (modelo: ModeloProducto) => {
    if (
      !window.confirm(
        `¿Eliminar el modelo "${modelo.nombre}"? Esta acción no se puede deshacer.`,
      )
    ) {
      return
    }
    setFeedback(null)
    setPendingAction("delete")
    startTransition(() => {
      void (async () => {
        try {
          const result = await deleteModeloProducto(modelo.id)
          if (!result.ok) {
            const message = formatDeleteErrorMessage(result.error)
            setListFeedback({ type: "error", message })
            return
          }
          setModelosState((prev) => prev.filter((item) => item.id !== modelo.id))
          setSelectedModelos((prev) => prev.filter((id) => id !== modelo.id))
          setListFeedback({ type: "success", message: "Modelo eliminado correctamente." })
        } catch (error) {
          console.error("[modelos] delete failed", error)
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

  const handleBulkDeleteModelos = () => {
    if (!selectedModelos.length) {
      return
    }
    if (
      !window.confirm(
        `Eliminarás ${selectedModelos.length} modelo(s). ¿Quieres continuar?`,
      )
    ) {
      return
    }
    setFeedback(null)
    setPendingAction("bulk-delete")
    startTransition(() => {
      void (async () => {
        try {
          const result = await deleteModelosProductoBulk(selectedModelos)
          const deletedIds = result.deleted_ids
          if (deletedIds.length) {
            const deletedSet = new Set(deletedIds)
            setModelosState((prev) => prev.filter((item) => !deletedSet.has(item.id)))
            setSelectedModelos((prev) => prev.filter((id) => !deletedSet.has(id)))
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
              message: `Se eliminaron ${deletedIds.length} modelo(s).`,
            })
          }
        } catch (error) {
          console.error("[modelos] bulk delete failed", error)
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
        <h1 className="text-2xl font-semibold">Modelos y variantes</h1>
        <p className="text-sm text-muted-foreground max-w-3xl">
          Establece modelos reutilizables para mantener la consistencia de productos similares.
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
          <p className="text-xs uppercase tracking-wide">Modelos registrados</p>
          <p className="text-lg font-semibold">{summaryText}</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => handleOpenSheet()}>
          Nuevo modelo
        </Button>
      </div>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg">Listado</CardTitle>
              <CardDescription>
                {modelosState.length
                  ? "Actualiza un modelo para cambiar su descripción o estado."
                  : "Crea un modelo para reutilizarlo en tus productos."}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={handleBulkDeleteModelos}
                disabled={!selectedCount || isProcessing}
              >
                Eliminar seleccionadas ({selectedCount})
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleToggleSelectAllModelos}
                disabled={!modelosIds.length}
              >
                {allModelosSelected ? "Deseleccionar todo" : "Seleccionar todo"}
              </Button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-3">
            <Select
              value={filterLinea ? filterLinea : ALL_LINEA_OPTION}
              onValueChange={(value) => {
                const normalized = value === ALL_LINEA_OPTION ? "" : value
                setFilterLinea(normalized)
                if (!normalized) {
                  setFilterFamilia("")
                }
              }}
            >
              <SelectTrigger className="min-w-[200px]">
                <SelectValue placeholder="Todas las líneas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_LINEA_OPTION}>Todas las líneas</SelectItem>
                {lineas.map((linea) => (
                  <SelectItem key={linea.id} value={linea.id}>
                    {linea.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filterFamilia ? filterFamilia : ALL_FAMILIA_OPTION}
              onValueChange={(value) => {
                const normalized = value === ALL_FAMILIA_OPTION ? "" : value
                setFilterFamilia(normalized)
              }}
            >
              <SelectTrigger className="min-w-[200px]">
                <SelectValue placeholder="Todas las familias" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_FAMILIA_OPTION}>Todas las familias</SelectItem>
                {visibleFamilias.map((familia) => (
                  <SelectItem key={familia.id} value={familia.id}>
                    {familia.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {modelosState.length === 0 ? (
            <div className="rounded-xl border border-dashed border-muted/60 bg-muted/5 p-6 text-sm text-muted-foreground">
              Aprovecha los modelos para documentar variantes homologadas de productos o servicios.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border">
              <Table className="table-fixed">
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="w-12 px-3">
                      <Checkbox
                        checked={allModelosSelected}
                        onCheckedChange={handleToggleSelectAllModelos}
                        aria-label="Seleccionar todos los modelos"
                      />
                    </TableHead>
                    <TableHead className="w-[360px]">
                      <SortButton
                        label="Modelo"
                        active={sortState?.id === "nombre"}
                        desc={sortState?.id === "nombre" ? sortState.desc : false}
                        onClick={() => handleSort("nombre")}
                      />
                    </TableHead>
                    <TableHead className="w-[260px]">
                      <SortButton
                        label="Familia"
                        active={sortState?.id === "familia"}
                        desc={sortState?.id === "familia" ? sortState.desc : false}
                        onClick={() => handleSort("familia")}
                      />
                    </TableHead>
                    <TableHead className="w-[240px]">
                      <SortButton
                        label="Línea"
                        active={sortState?.id === "linea"}
                        desc={sortState?.id === "linea" ? sortState.desc : false}
                        onClick={() => handleSort("linea")}
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
                  {visibleModelos.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                        No hay modelos registrados.
                      </TableCell>
                    </TableRow>
                  ) : (
                    visibleModelos.map((modelo) => (
                      <TableRow key={modelo.id} className={cn(!modelo.activo && "bg-muted/30")}>
                        <TableCell className="px-3">
                          <Checkbox
                            checked={selectedModelosSet.has(modelo.id)}
                            onCheckedChange={() => toggleSelectModelo(modelo.id)}
                            aria-label={`Seleccionar modelo ${modelo.nombre}`}
                          />
                        </TableCell>
                        <TableCell className="overflow-hidden">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="h-12 w-12 overflow-hidden rounded-md border border-muted/40 bg-muted/10">
                              {modelo.fotoUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={modelo.fotoUrl}
                                  alt={modelo.nombre}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                                  Sin imagen
                                </div>
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-medium">{modelo.nombre}</p>
                              <p className="truncate text-sm text-muted-foreground">
                                {modelo.descripcion ?? "Sin descripción disponible"}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="truncate text-sm text-muted-foreground">
                          {modelo.familiaId ? familiaMap.get(modelo.familiaId)?.nombre ?? "—" : "Sin familia"}
                        </TableCell>
                        <TableCell className="truncate text-sm text-muted-foreground">
                          {modelo.familiaId
                            ? lineaMap.get(familiaMap.get(modelo.familiaId)?.lineaId ?? "")?.nombre ?? "—"
                            : "Sin línea"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={modelo.activo ? "secondary" : "outline"}>
                            {modelo.activo ? "Activo" : "Archivado"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(modelo.actualizadoEn)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="sm" onClick={() => handleOpenSheet(modelo)}>
                              Editar
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteModelo(modelo)}
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
        <SheetContent position="right" size="content" className="h-full max-w-xl">
          <SheetHeader>
            <SheetTitle>{editing ? "Editar modelo" : "Nuevo modelo"}</SheetTitle>
          </SheetHeader>
          <form className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-4" onSubmit={handleSubmit}>
            <div className="space-y-1">
              <Label htmlFor="modelo-nombre">Nombre</Label>
              <Input id="modelo-nombre" {...form.register("nombre")} autoFocus />
            </div>
            <div className="space-y-1">
              <Label htmlFor="modelo-descripcion">Descripción</Label>
              <Textarea id="modelo-descripcion" {...form.register("descripcion")} rows={4} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="modelo-familia">Familia</Label>
              <select
                id="modelo-familia"
                {...form.register("familiaId")}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <option value="">Sin familia</option>
                {familias.map((familia) => (
                  <option key={familia.id} value={familia.id}>
                    {familia.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="modelo-activo" {...form.register("activo")} />
              <Label htmlFor="modelo-activo">Activo</Label>
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
              title="Imágenes del modelo"
              description="Define qué imágenes acompañan este modelo y cuál debe ser la principal."
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
