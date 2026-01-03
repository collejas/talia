"use client"

import { useCallback, useMemo, useState, useTransition } from "react"
import { useForm } from "react-hook-form"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"

import {
  LineaDeNegocio,
  FamiliaProducto,
  createLineaDeNegocio,
  updateLineaDeNegocio,
} from "@/app/settings/productos/actions"

type LineasViewProps = {
  lineas: LineaDeNegocio[]
  familias: FamiliaProducto[]
}

type LineaFormValues = {
  nombre: string
  descripcion: string
  activo: boolean
}

const LINEA_FORM_DEFAULTS: LineaFormValues = {
  nombre: "",
  descripcion: "",
  activo: true,
}

type Feedback = { type: "success" | "error"; message: string }

export function LineasView({ lineas, familias }: LineasViewProps) {
  const [lineasState, setLineasState] = useState(lineas)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<LineaDeNegocio | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [pendingAction, setPendingAction] = useState<"save" | null>(null)
  const [isPending, startTransition] = useTransition()
  const form = useForm<LineaFormValues>({ defaultValues: LINEA_FORM_DEFAULTS })

  const familiasPorLinea = useMemo(() => {
    const map = new Map<string, number>()
    for (const familia of familias) {
      if (!familia.lineaId) continue
      map.set(familia.lineaId, (map.get(familia.lineaId) ?? 0) + 1)
    }
    return map
  }, [familias])

  const handleOpenSheet = useCallback(
    (linea?: LineaDeNegocio) => {
      if (linea) {
        form.reset({
          nombre: linea.nombre,
          descripcion: linea.descripcion ?? "",
          activo: linea.activo,
        })
        setEditing(linea)
      } else {
        form.reset(LINEA_FORM_DEFAULTS)
        setEditing(null)
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
      const action = editing
        ? updateLineaDeNegocio(editing.id, payload)
        : createLineaDeNegocio(payload)
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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="text-sm text-muted-foreground">
          <p className="text-xs uppercase tracking-wide">Líneas registradas</p>
          <p className="text-lg font-semibold">
            {stats.total} ({stats.activos} activas · {stats.archivadas} archivadas)
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => handleOpenSheet()}>
          Nueva línea
        </Button>
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
            <ScrollArea className="max-h-[520px] rounded-xl bg-background p-4">
              <div className="space-y-4">
                {lineasState.map((linea) => (
                  <div
                    key={linea.id}
                    className="rounded-2xl border border-border/80 bg-card px-4 py-3 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-lg font-semibold">{linea.nombre}</p>
                        <p className="text-sm text-muted-foreground">
                          {linea.descripcion || "Sin descripción proporcionada"}
                        </p>
                      </div>
                      <Badge variant={linea.activo ? "secondary" : "outline"}>
                        {linea.activo ? "Activa" : "Archivada"}
                      </Badge>
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-4">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Familias asociadas
                        </p>
                        <p className="text-2xl font-semibold">
                          {familiasPorLinea.get(linea.id) ?? 0}
                        </p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => handleOpenSheet(linea)}>
                        Editar línea
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
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
