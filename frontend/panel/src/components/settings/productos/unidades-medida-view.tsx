"use client"

import { useMemo, useState, useTransition, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

import {
  createUnidadMedida,
  deleteUnidadMedida,
  type UnidadMedida,
  updateUnidadMedida,
} from "@/app/settings/productos/actions"

type UnitsViewProps = {
  initialUnits: UnidadMedida[]
}

type FormState = {
  codigo: string
  nombre: string
  simbolo: string
  activo: boolean
  esBase: boolean
}

const EMPTY_FORM: FormState = {
  codigo: "",
  nombre: "",
  simbolo: "",
  activo: true,
  esBase: false,
}

function toFormState(unit: UnidadMedida): FormState {
  return {
    codigo: unit.codigo,
    nombre: unit.nombre,
    simbolo: unit.simbolo ?? "",
    activo: unit.activo,
    esBase: unit.esBase,
  }
}

export function UnidadesMedidaView({ initialUnits }: UnitsViewProps) {
  const [units, setUnits] = useState<UnidadMedida[]>(initialUnits)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null)
  const [isPending, startTransition] = useTransition()

  const activeCount = useMemo(() => units.filter((unit) => unit.activo).length, [units])

  const resetForm = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  const openCreate = () => {
    resetForm()
    setFeedback(null)
  }

  const openEdit = (unit: UnidadMedida) => {
    setEditingId(unit.id)
    setForm(toFormState(unit))
    setFeedback(null)
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const payload = {
      codigo: form.codigo.trim(),
      nombre: form.nombre.trim(),
      simbolo: form.simbolo.trim() || null,
      activo: form.activo,
      esBase: form.esBase,
    }
    if (!payload.codigo || !payload.nombre) {
      setFeedback({ type: "error", message: "El código y el nombre son obligatorios." })
      return
    }
    setFeedback(null)
    startTransition(() => {
      const action = editingId
        ? updateUnidadMedida(editingId, payload)
        : createUnidadMedida(payload)
      action
        .then((unit) => {
          setUnits((current) => {
            if (editingId) {
              return current.map((row) => (row.id === unit.id ? unit : row))
            }
            return [unit, ...current]
          })
          setFeedback({
            type: "success",
            message: editingId ? "Unidad actualizada." : "Unidad creada.",
          })
          resetForm()
        })
        .catch((error) => {
          setFeedback({
            type: "error",
            message: error instanceof Error ? error.message : "No se pudo guardar la unidad.",
          })
        })
    })
  }

  const handleDelete = (unit: UnidadMedida) => {
    if (!window.confirm(`¿Eliminar la unidad "${unit.codigo}"?`)) {
      return
    }
    setFeedback(null)
    startTransition(() => {
      deleteUnidadMedida(unit.id)
        .then(() => {
          setUnits((current) => current.filter((row) => row.id !== unit.id))
          if (editingId === unit.id) {
            resetForm()
          }
          setFeedback({ type: "success", message: "Unidad eliminada." })
        })
        .catch((error) => {
          setFeedback({
            type: "error",
            message: error instanceof Error ? error.message : "No se pudo eliminar la unidad.",
          })
        })
    })
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>{editingId ? "Editar unidad" : "Nueva unidad"}</CardTitle>
          <CardDescription>
            Define aquí las unidades que luego aparecerán en el select de productos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="unidad-codigo">Código</Label>
              <Input
                id="unidad-codigo"
                value={form.codigo}
                onChange={(event) => setForm((current) => ({ ...current, codigo: event.target.value }))}
                placeholder="pieza"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="unidad-nombre">Nombre</Label>
              <Input
                id="unidad-nombre"
                value={form.nombre}
                onChange={(event) => setForm((current) => ({ ...current, nombre: event.target.value }))}
                placeholder="Pieza"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="unidad-simbolo">Símbolo</Label>
              <Input
                id="unidad-simbolo"
                value={form.simbolo}
                onChange={(event) => setForm((current) => ({ ...current, simbolo: event.target.value }))}
                placeholder="pz"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <Checkbox
                  checked={form.activo}
                  onCheckedChange={(checked) => setForm((current) => ({ ...current, activo: Boolean(checked) }))}
                />
                Activa
              </label>
              <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <Checkbox
                  checked={form.esBase}
                  onCheckedChange={(checked) => setForm((current) => ({ ...current, esBase: Boolean(checked) }))}
                />
                Base
              </label>
            </div>
            {feedback ? (
              <div
                className={`rounded-md border px-3 py-2 text-sm ${
                  feedback.type === "success"
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-900"
                    : "border-red-500/40 bg-red-500/10 text-red-900"
                }`}
              >
                {feedback.message}
              </div>
            ) : null}
            <div className="flex gap-2">
              <Button type="submit" disabled={isPending}>
                {editingId ? "Guardar" : "Crear"}
              </Button>
              <Button type="button" variant="outline" onClick={openCreate}>
                Nuevo
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Unidades registradas</CardTitle>
              <CardDescription>Estas unidades se pueden usar en productos e inventario.</CardDescription>
            </div>
            <Badge variant="outline">
              {units.length} total · {activeCount} activas
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Símbolo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!units.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    No hay unidades registradas.
                  </TableCell>
                </TableRow>
              ) : (
                units.map((unit) => (
                  <TableRow key={unit.id} className={unit.esBase ? "bg-muted/20" : undefined}>
                    <TableCell className="font-mono text-xs">{unit.codigo}</TableCell>
                    <TableCell>{unit.nombre}</TableCell>
                    <TableCell>{unit.simbolo ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={unit.activo ? "default" : "outline"}>
                        {unit.activo ? "Activa" : "Inactiva"}
                      </Badge>
                      {unit.esBase ? (
                        <Badge variant="secondary" className="ml-2">
                          Base
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => openEdit(unit)}>
                          Editar
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => handleDelete(unit)}>
                          Eliminar
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
