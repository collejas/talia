"use client"

import { useCallback, useMemo, useState, useTransition } from "react"
import { useForm, useWatch } from "react-hook-form"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardDescription, CardTitle } from "@/components/ui/card"
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
  createFamiliaProducto,
  deleteFamiliaProducto,
  updateFamiliaProducto,
} from "@/app/settings/productos/actions"
import {
  MediaEditor,
  buildMetadataWithMedia,
  normalizeMediaList,
  type MediaEntry,
} from "@/components/settings/productos/media-editor"
import { formatDeleteErrorMessage } from "@/app/settings/productos/delete-error-messages"

type FamiliasViewProps = {
  lineas: LineaDeNegocio[]
  familias: FamiliaProducto[]
}

type FamiliaFormValues = {
  nombre: string
  descripcion: string
  lineaId: string
  activo: boolean
}

const FAMILIA_FORM_DEFAULTS: FamiliaFormValues = {
  nombre: "",
  descripcion: "",
  lineaId: "",
  activo: true,
}

type Feedback = { type: "success" | "error"; message: string }
type PendingAction = "save" | "delete" | "bulk-delete"

export function FamiliasView({ lineas, familias }: FamiliasViewProps) {
  const [familiasState, setFamiliasState] = useState(familias)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<FamiliaProducto | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [isPending, startTransition] = useTransition()
  const form = useForm<FamiliaFormValues>({ defaultValues: FAMILIA_FORM_DEFAULTS })
  const selectedLineaId = useWatch({ control: form.control, name: "lineaId" }) ?? ""
  const [metadataSeed, setMetadataSeed] = useState<Record<string, unknown>>({})
  const [mediaItems, setMediaItems] = useState<MediaEntry[]>([])
  const [selectedFamilias, setSelectedFamilias] = useState<string[]>([])
  const [listFeedback, setListFeedback] = useState<Feedback | null>(null)
  const [filterLinea, setFilterLinea] = useState("")

  const lineaMap = useMemo(() => new Map(lineas.map((linea) => [linea.id, linea.nombre])), [lineas])
  const ALL_LINEA_OPTION = "__all__"

  const handleOpenSheet = useCallback(
    (familia?: FamiliaProducto) => {
      if (familia) {
        form.reset({
          nombre: familia.nombre,
          descripcion: familia.descripcion ?? "",
          lineaId: familia.lineaId ?? "",
          activo: familia.activo,
        })
        setEditing(familia)
        const baseMetadata =
          familia.metadata && typeof familia.metadata === "object"
            ? JSON.parse(JSON.stringify(familia.metadata))
            : {}
        setMetadataSeed(baseMetadata)
        setMediaItems(normalizeMediaList(baseMetadata))
      } else {
        form.reset({
          ...FAMILIA_FORM_DEFAULTS,
          lineaId: lineas[0]?.id ?? "",
        })
        setEditing(null)
        setMetadataSeed({})
        setMediaItems([])
      }
      setSheetOpen(true)
    },
    [form, lineas],
  )

  const closeSheet = useCallback(() => {
    setSheetOpen(false)
    setTimeout(() => {
      form.reset(FAMILIA_FORM_DEFAULTS)
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
      lineaId: values.lineaId,
      activo: values.activo,
    }
    if (!payload.nombre) {
      setFeedback({ type: "error", message: "El nombre es obligatorio." })
      return
    }
    if (!payload.lineaId) {
      setFeedback({ type: "error", message: "Selecciona una línea asociada." })
      return
    }
    setFeedback(null)
    setPendingAction("save")
    startTransition(() => {
      const metadataPayload = buildMetadataWithMedia(metadataSeed, mediaItems)
      const action = editing
        ? updateFamiliaProducto(editing.id, { ...payload, metadata: metadataPayload })
        : createFamiliaProducto({ ...payload, metadata: metadataPayload })
      action
        .then((result) => {
          setFeedback({
            type: "success",
            message: editing ? "Familia actualizada." : "Familia creada.",
          })
          setFamiliasState((prev) => {
            if (editing) {
              return prev.map((item) => (item.id === result.id ? result : item))
            }
            return [result, ...prev]
          })
          closeSheet()
        })
        .catch((error) => {
          console.error("[familias] save failed", error)
          setFeedback({
            type: "error",
            message:
              error instanceof Error
                ? error.message
                : "No se pudo guardar la familia. Intenta nuevamente.",
          })
        })
        .finally(() => setPendingAction(null))
    })
  })

  const visibleFamilias = useMemo(() => {
    if (!filterLinea) {
      return familiasState
    }
    return familiasState.filter((familia) => familia.lineaId === filterLinea)
  }, [familiasState, filterLinea])

  const familiasIds = useMemo(() => familiasState.map((familia) => familia.id), [familiasState])
  const allFamiliasSelected = familiasIds.length > 0 && selectedFamilias.length === familiasIds.length
  const selectedFamiliasSet = useMemo(() => new Set(selectedFamilias), [selectedFamilias])
  const selectedCount = selectedFamilias.length
  const isProcessing = pendingAction !== null

  const toggleSelectFamilia = useCallback((id: string) => {
    setSelectedFamilias((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id)
      }
      return [...prev, id]
    })
  }, [])

  const handleToggleSelectAllFamilias = useCallback(() => {
    setSelectedFamilias(allFamiliasSelected ? [] : [...familiasIds])
  }, [allFamiliasSelected, familiasIds])

  const handleDeleteFamilia = (familia: FamiliaProducto) => {
    if (
      !window.confirm(
        `¿Eliminar la familia "${familia.nombre}"? Esta acción no se puede deshacer.`,
      )
    ) {
      return
    }
    setFeedback(null)
    setPendingAction("delete")
    startTransition(() => {
      void (async () => {
        try {
          await deleteFamiliaProducto(familia.id)
          setFamiliasState((prev) => prev.filter((item) => item.id !== familia.id))
          setSelectedFamilias((prev) => prev.filter((id) => id !== familia.id))
          setListFeedback({ type: "success", message: "Familia eliminada correctamente." })
        } catch (error) {
          console.error("[familias] delete failed", error)
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

  const handleBulkDeleteFamilias = () => {
    if (!selectedFamilias.length) {
      return
    }
    if (
      !window.confirm(
        `Eliminarás ${selectedFamilias.length} familia(s) de productos. ¿Quieres continuar?`,
      )
    ) {
      return
    }
    setFeedback(null)
    setPendingAction("bulk-delete")
    startTransition(() => {
      void (async () => {
        try {
          const operations = selectedFamilias.map(async (id) => {
            await deleteFamiliaProducto(id)
            return id
          })
          const results = await Promise.allSettled(operations)
          const deletedIds = results
            .filter((res): res is PromiseFulfilledResult<string> => res.status === "fulfilled")
            .map((res) => res.value)
          if (deletedIds.length) {
            const deletedSet = new Set(deletedIds)
            setFamiliasState((prev) => prev.filter((item) => !deletedSet.has(item.id)))
            setSelectedFamilias((prev) => prev.filter((id) => !deletedSet.has(id)))
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
              message: `Se eliminaron ${deletedIds.length} familia(s).`,
            })
          }
        } catch (error) {
          console.error("[familias] bulk delete failed", error)
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

  const lineaOptions = useMemo(
    () =>
      lineas.map((linea) => ({
        label: linea.nombre,
        value: linea.id,
      })),
    [lineas],
  )

  return (
    <div className="space-y-6 px-4 py-6 lg:px-6">
      <header className="space-y-1">
        <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Productos y servicios
        </p>
        <h1 className="text-2xl font-semibold">Familias de productos</h1>
        <p className="text-sm text-muted-foreground max-w-3xl">
          Agrupa productos dentro de cada línea para aplicar reglas compartidas en cotizaciones.
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
          <p className="text-xs uppercase tracking-wide">Familias registradas</p>
          <p className="text-lg font-semibold">
            {familiasState.length} ({familiasState.filter((item) => item.activo).length} activas)
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleOpenSheet()}
          disabled={lineas.length === 0}
        >
          Nueva familia
        </Button>
      </div>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg">Listado</CardTitle>
              <CardDescription>
                {familiasState.length
                  ? "Edita una familia para ajustar su línea o estado."
                  : "Crea una familia asignada a una línea existente."}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={handleBulkDeleteFamilias}
                disabled={!selectedCount || isProcessing}
              >
                Eliminar seleccionadas ({selectedCount})
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleToggleSelectAllFamilias}
                disabled={!familiasIds.length}
              >
                {allFamiliasSelected ? "Deseleccionar todo" : "Seleccionar todo"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleOpenSheet()}
                disabled={lineas.length === 0}
              >
                Nueva familia
              </Button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-3">
            <Select
              value={filterLinea ? filterLinea : ALL_LINEA_OPTION}
              onValueChange={(value) => {
                const normalized = value === ALL_LINEA_OPTION ? "" : value
                setFilterLinea(normalized)
              }}
            >
              <SelectTrigger className="min-w-[220px]">
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
          </div>
        </CardHeader>
        <CardContent>
          {familiasState.length === 0 ? (
            <div className="rounded-xl border border-dashed border-muted/60 bg-muted/5 p-6 text-sm text-muted-foreground">
              Una familia necesita una línea. Crea primero una línea para poder asignarla.
            </div>
          ) : (
            <ScrollArea
              className="h-[min(60vh,600px)] max-h-[600px] rounded-xl bg-background p-4"
            >
              <div className="space-y-4">
                {visibleFamilias.map((familia) => (
                  <Card key={familia.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <Checkbox
                            checked={selectedFamiliasSet.has(familia.id)}
                            onCheckedChange={() => toggleSelectFamilia(familia.id)}
                            aria-label={`Seleccionar familia ${familia.nombre}`}
                            className="mt-1"
                          />
                          <div className="h-12 w-12 overflow-hidden rounded-md border border-muted/40 bg-muted/10">
                            {familia.fotoUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={familia.fotoUrl}
                                alt={familia.nombre}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                                Sin imagen
                              </div>
                            )}
                          </div>
                          <div>
                            <CardTitle className="text-lg">{familia.nombre}</CardTitle>
                            <CardDescription>
                              {familia.descripcion ?? "Sin descripción disponible"}
                            </CardDescription>
                          </div>
                        </div>
                        <Badge variant={familia.activo ? "secondary" : "outline"}>
                          {familia.activo ? "Activa" : "Archivada"}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Línea asociada</p>
                        <p className="text-base font-medium">
                          {lineaMap.get(familia.lineaId ?? "") ?? "Sin línea"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => handleOpenSheet(familia)}>
                          Editar familia
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteFamilia(familia)}
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
        <SheetContent position="right" size="content">
          <SheetHeader>
            <SheetTitle>{editing ? "Editar familia" : "Nueva familia"}</SheetTitle>
          </SheetHeader>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-1">
              <Label htmlFor="familia-nombre">Nombre</Label>
              <Input id="familia-nombre" {...form.register("nombre")} autoFocus />
            </div>
            <div className="space-y-1">
              <Label htmlFor="familia-descripcion">Descripción</Label>
              <Textarea id="familia-descripcion" {...form.register("descripcion")} rows={4} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="familia-linea">Línea asociada</Label>
              <Select
                onValueChange={(value) => form.setValue("lineaId", value)}
                value={selectedLineaId}
              >
                <SelectTrigger size="sm" id="familia-linea">
                  <SelectValue placeholder="Selecciona una línea" />
                </SelectTrigger>
                <SelectContent>
                  {lineaOptions.map((linea) => (
                    <SelectItem key={linea.value} value={linea.value}>
                      {linea.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="familia-activo" {...form.register("activo")} />
              <Label htmlFor="familia-activo">Activa</Label>
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
              title="Imágenes de la familia"
              description="Agrega fotos representativas y elige cuál se usa por defecto."
            />
            <SheetFooter className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={closeSheet} type="button">
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                variant={lineas.length === 0 ? "ghost" : "default"}
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
