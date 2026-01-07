"use client"

import { useCallback, useMemo, useState, useTransition } from "react"
import { useForm } from "react-hook-form"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"

import {
  FamiliaProducto,
  LineaDeNegocio,
  ModeloProducto,
  createModeloProducto,
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

const formatter = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Mexico_City",
})
const ALL_LINEA_OPTION = "__all_lines__"
const ALL_FAMILIA_OPTION = "__all_families__"

function formatDate(value: string): string {
  const parsed = value ? new Date(value) : null
  if (!parsed || Number.isNaN(parsed.getTime())) {
    return "—"
  }
  return formatter.format(parsed)
}

export function ModelosView({ modelos, familias, lineas }: ModelosViewProps) {
  const familiaMap = useMemo(() => {
    const map = new Map<string, FamiliaProducto>()
    familias.forEach((familia) => map.set(familia.id, familia))
    return map
  }, [familias])
  const [modelosState, setModelosState] = useState(modelos)
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
          await deleteModeloProducto(modelo.id)
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
          const operations = selectedModelos.map(async (id) => {
            await deleteModeloProducto(id)
            return id
          })
          const results = await Promise.allSettled(operations)
          const deletedIds = results
            .filter((res): res is PromiseFulfilledResult<string> => res.status === "fulfilled")
            .map((res) => res.value)
          if (deletedIds.length) {
            const deletedSet = new Set(deletedIds)
            setModelosState((prev) => prev.filter((item) => !deletedSet.has(item.id)))
            setSelectedModelos((prev) => prev.filter((id) => !deletedSet.has(id)))
          }
          const failed = results.find((res) => res.status === "rejected") as
            | PromiseRejectedResult
            | undefined
          if (failed) {
            const message = formatDeleteErrorMessage(
              failed.reason instanceof Error ? failed.reason.message : String(failed.reason),
            )
            setListFeedback({ type: "error", message })
          } else {
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
            <ScrollArea className="max-h-[600px] rounded-xl bg-background p-4">
              <div className="space-y-4">
                {filteredModelos.map((modelo) => (
                  <Card key={modelo.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <Checkbox
                            checked={selectedModelosSet.has(modelo.id)}
                            onCheckedChange={() => toggleSelectModelo(modelo.id)}
                            aria-label={`Seleccionar modelo ${modelo.nombre}`}
                            className="mt-1"
                          />
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
                          <div>
                            <CardTitle className="text-lg">{modelo.nombre}</CardTitle>
                            <CardDescription>
                              {modelo.descripcion ?? "Sin descripción disponible"}
                            </CardDescription>
                            {modelo.familiaId ? (
                              <p className="text-sm text-muted-foreground">
                                Familia: {familiaMap.get(modelo.familiaId)?.nombre ?? "—"}
                              </p>
                            ) : null}
                          </div>
                        </div>
                        <Badge variant={modelo.activo ? "secondary" : "outline"}>
                          {modelo.activo ? "Activo" : "Archivado"}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Actualizado</p>
                        <p className="text-base font-medium">{formatDate(modelo.actualizadoEn)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => handleOpenSheet(modelo)}>
                          Editar modelo
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
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
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
