"use client"

import { useActionState, useState } from "react"
import { useFormStatus } from "react-dom"

import {
  CrudActionState,
  createDepartmentAction,
  deleteDepartmentAction,
  updateDepartmentAction,
} from "@/app/settings/hr/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TableCell, TableRow } from "@/components/ui/table"
import { formatDateTime } from "@/lib/formatters"
import { HrDepartmentItem } from "@/lib/settings/hr-types"
import { cn } from "@/lib/utils"

const INITIAL_STATE: CrudActionState = { status: "idle" }

type DepartmentSelectOption = {
  id: string
  nombre: string
}

export function DepartmentCreateSection({
  departments,
}: {
  departments: DepartmentSelectOption[]
}) {
  const [state, action] = useActionState(createDepartmentAction, INITIAL_STATE)
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-4">
      <form action={action} className="mx-auto max-w-4xl space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="department-new-nombre">Nombre</Label>
            <Input
              id="department-new-nombre"
              name="nombre"
              placeholder="Departamento de ventas"
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="department-new-padre">Departamento padre</Label>
            <select
              id="department-new-padre"
              name="departamento_padre_id"
              defaultValue=""
              className={cn(
                "h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
                "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              )}
            >
              <option value="">Sin departamento padre</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>
        <InlineStateMessage state={state} />
        <div className="flex justify-end">
          <InlineSubmitButton label="Crear departamento" pendingLabel="Guardando..." />
        </div>
      </form>
    </div>
  )
}

export function DepartmentInlineRow({
  department,
  departments,
}: {
  department: HrDepartmentItem
  departments: DepartmentSelectOption[]
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const [editState, editAction] = useActionState(updateDepartmentAction, INITIAL_STATE)
  const [deleteState, deleteAction] = useActionState(deleteDepartmentAction, INITIAL_STATE)

  return (
    <>
      <TableRow>
        <TableCell>
          <span className="font-medium">{department.nombre}</span>
        </TableCell>
        <TableCell className="hidden md:table-cell">
          <span className="text-sm text-muted-foreground">{department.padreNombre}</span>
        </TableCell>
        <TableCell className="w-24 text-center">{department.puestos}</TableCell>
        <TableCell className="w-24 text-center">{department.empleados}</TableCell>
        <TableCell className="hidden lg:table-cell w-32 text-xs text-muted-foreground">
          {formatDateTime(department.creadoEn)}
        </TableCell>
        <TableCell className="text-right">
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setIsEditing((value) => !value)
                setConfirmDelete(false)
              }}
            >
              {isEditing ? "Cerrar" : "Editar"}
            </Button>
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <form
                  action={deleteAction}
                  className="inline-flex items-center gap-2"
                  onSubmit={() => setConfirmDelete(false)}
                >
                  <input type="hidden" name="id" value={department.id} />
                  <InlineSubmitButton
                    label="Confirmar"
                    pendingLabel="Eliminando..."
                    variant="destructive"
                    size="sm"
                  />
                </form>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancelar
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  setConfirmDelete(true)
                  setIsEditing(false)
                }}
              >
                Eliminar
              </Button>
            )}
          </div>
          {deleteState.status === "error" && (
            <p className="mt-2 text-xs text-destructive">{deleteState.message}</p>
          )}
        </TableCell>
      </TableRow>
      {isEditing && (
        <TableRow className="bg-muted/40">
          <TableCell colSpan={6}>
            <form action={editAction} className="space-y-4">
              <input type="hidden" name="id" value={department.id} />
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor={`department-edit-nombre-${department.id}`}>Nombre</Label>
                  <Input
                    id={`department-edit-nombre-${department.id}`}
                    name="nombre"
                    defaultValue={department.nombre}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`department-edit-padre-${department.id}`}>
                    Departamento padre
                  </Label>
                  <select
                    id={`department-edit-padre-${department.id}`}
                    name="departamento_padre_id"
                    defaultValue={department.padreId ?? ""}
                    className={cn(
                      "h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
                      "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    )}
                  >
                    <option value="">Sin departamento padre</option>
                    {departments
                      .filter((candidate) => candidate.id !== department.id)
                      .map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {candidate.nombre}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
              <InlineStateMessage state={editState} successMessage="Cambios guardados." />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setIsEditing(false)}>
                  Cancelar
                </Button>
                <InlineSubmitButton label="Guardar cambios" pendingLabel="Guardando..." />
              </div>
            </form>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

function InlineSubmitButton({
  label,
  pendingLabel,
  variant,
  size,
}: {
  label: string
  pendingLabel: string
  variant?: React.ComponentProps<typeof Button>["variant"]
  size?: React.ComponentProps<typeof Button>["size"]
}) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant={variant} size={size} disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  )
}

function InlineStateMessage({
  state,
  successMessage,
}: {
  state: CrudActionState
  successMessage?: string
}) {
  if (state.status === "idle") return null
  if (state.status === "error") {
    return <p className="text-sm text-destructive">{state.message}</p>
  }
  if (state.status === "success") {
    return (
      <p className="text-sm text-emerald-600 dark:text-emerald-400">
        {state.message ?? successMessage ?? "Operación completada."}
      </p>
    )
  }
  return null
}
