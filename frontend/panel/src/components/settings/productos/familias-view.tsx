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
  updateFamiliaProducto,
} from "@/app/settings/productos/actions"

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

export function FamiliasView({ lineas, familias }: FamiliasViewProps) {
  const [familiasState, setFamiliasState] = useState(familias)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<FamiliaProducto | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [pendingAction, setPendingAction] = useState<"save" | null>(null)
  const [isPending, startTransition] = useTransition()
  const form = useForm<FamiliaFormValues>({ defaultValues: FAMILIA_FORM_DEFAULTS })
  const selectedLineaId = useWatch({ control: form.control, name: "lineaId" }) ?? ""

  const lineaMap = useMemo(() => new Map(lineas.map((linea) => [linea.id, linea.nombre])), [lineas])

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
      } else {
        form.reset({
          ...FAMILIA_FORM_DEFAULTS,
          lineaId: lineas[0]?.id ?? "",
        })
        setEditing(null)
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
      const action = editing
        ? updateFamiliaProducto(editing.id, payload)
        : createFamiliaProducto(payload)
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
          </div>
        </CardHeader>
        <CardContent>
          {familiasState.length === 0 ? (
            <div className="rounded-xl border border-dashed border-muted/60 bg-muted/5 p-6 text-sm text-muted-foreground">
              Una familia necesita una línea. Crea primero una línea para poder asignarla.
            </div>
          ) : (
            <ScrollArea className="max-h-[600px] rounded-xl bg-background p-4">
              <div className="space-y-4">
                {familiasState.map((familia) => (
                  <Card key={familia.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <CardTitle className="text-lg">{familia.nombre}</CardTitle>
                          <CardDescription>
                            {familia.descripcion ?? "Sin descripción disponible"}
                          </CardDescription>
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
                      <Button variant="ghost" size="sm" onClick={() => handleOpenSheet(familia)}>
                        Editar familia
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
