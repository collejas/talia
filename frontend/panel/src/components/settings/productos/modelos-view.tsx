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
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"

import {
  ModeloProducto,
  createModeloProducto,
  updateModeloProducto,
} from "@/app/settings/productos/actions"
import {
  MediaEditor,
  buildMetadataWithMedia,
  normalizeMediaList,
  type MediaEntry,
} from "@/components/settings/productos/media-editor"

type ModelosViewProps = {
  modelos: ModeloProducto[]
}

type ModeloFormValues = {
  nombre: string
  descripcion: string
  activo: boolean
}

const MODELO_FORM_DEFAULTS: ModeloFormValues = {
  nombre: "",
  descripcion: "",
  activo: true,
}

type Feedback = { type: "success" | "error"; message: string }

const formatter = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short",
})

function formatDate(value: string): string {
  const parsed = value ? new Date(value) : null
  if (!parsed || Number.isNaN(parsed.getTime())) {
    return "—"
  }
  return formatter.format(parsed)
}

export function ModelosView({ modelos }: ModelosViewProps) {
  const [modelosState, setModelosState] = useState(modelos)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<ModeloProducto | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [pendingAction, setPendingAction] = useState<"save" | null>(null)
  const [isPending, startTransition] = useTransition()
  const form = useForm<ModeloFormValues>({ defaultValues: MODELO_FORM_DEFAULTS })
  const [metadataSeed, setMetadataSeed] = useState<Record<string, unknown>>({})
  const [mediaItems, setMediaItems] = useState<MediaEntry[]>([])

  const handleOpenSheet = useCallback(
    (modelo?: ModeloProducto) => {
      if (modelo) {
        form.reset({
          nombre: modelo.nombre,
          descripcion: modelo.descripcion ?? "",
          activo: modelo.activo,
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
                {modelosState.map((modelo) => (
                  <Card key={modelo.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-start gap-3">
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
                      <Button variant="ghost" size="sm" onClick={() => handleOpenSheet(modelo)}>
                        Editar modelo
                      </Button>
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
            <SheetTitle>{editing ? "Editar modelo" : "Nuevo modelo"}</SheetTitle>
          </SheetHeader>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-1">
              <Label htmlFor="modelo-nombre">Nombre</Label>
              <Input id="modelo-nombre" {...form.register("nombre")} autoFocus />
            </div>
            <div className="space-y-1">
              <Label htmlFor="modelo-descripcion">Descripción</Label>
              <Textarea id="modelo-descripcion" {...form.register("descripcion")} rows={4} />
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
