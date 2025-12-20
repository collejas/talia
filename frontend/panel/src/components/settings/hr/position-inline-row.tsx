"use client"

import { useActionState, useState } from "react"
import { useFormStatus } from "react-dom"

import {
  CrudActionState,
  createPositionAction,
  deletePositionAction,
  updatePositionAction,
} from "@/app/settings/hr/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TableCell, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { formatDateTime } from "@/lib/formatters"
import { HrDepartmentOption, HrPositionItem } from "@/lib/settings/hr-types"
import { cn } from "@/lib/utils"

const INITIAL_STATE: CrudActionState = { status: "idle" }

type PositionBaseProps = {
  departments: HrDepartmentOption[]
}

type PositionInlineRowProps = PositionBaseProps & {
  position: HrPositionItem
}

export function PositionCreateSection({ departments }: PositionBaseProps) {
  const [state, action] = useActionState(createPositionAction, INITIAL_STATE)

  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-4">
      <form action={action} className="mx-auto max-w-4xl space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="position-new-nombre">Nombre</Label>
            <Input
              id="position-new-nombre"
              name="nombre"
              placeholder="Coordinador de operaciones"
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="position-new-depto">Departamento</Label>
            <DepartmentSelect
              id="position-new-depto"
              name="departamento_id"
              departments={departments}
              placeholder="Sin departamento"
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="position-new-desc">Descripción</Label>
          <Textarea
            id="position-new-desc"
            name="descripcion"
            placeholder="Responsabilidades principales"
            rows={3}
          />
        </div>
        <InlineStateMessage state={state} />
        <div className="flex justify-end">
          <InlineSubmitButton label="Crear puesto" pendingLabel="Guardando..." />
        </div>
      </form>
    </div>
  )
}

export function PositionInlineRow({ position, departments }: PositionInlineRowProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editState, editAction] = useActionState(updatePositionAction, INITIAL_STATE)
  const [deleteState, deleteAction] = useActionState(deletePositionAction, INITIAL_STATE)

  return (
    <>
      <TableRow>
        <TableCell>
          <div className="flex flex-col gap-1">
            <span className="font-medium">{position.nombre}</span>
            <InlineCode>{position.id}</InlineCode>
          </div>
        </TableCell>
        <TableCell className="hidden md:table-cell">{position.departamento}</TableCell>
        <TableCell className="hidden lg:table-cell max-w-[320px] text-sm text-muted-foreground">
          {position.descripcion}
        </TableCell>
        <TableCell>{position.empleados}</TableCell>
        <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
          {formatDateTime(position.creadoEn)}
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
                  <input type="hidden" name="id" value={position.id} />
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
              <input type="hidden" name="id" value={position.id} />
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor={`position-edit-nombre-${position.id}`}>Nombre</Label>
                  <Input
                    id={`position-edit-nombre-${position.id}`}
                    name="nombre"
                    defaultValue={position.nombre}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`position-edit-depto-${position.id}`}>Departamento</Label>
                  <DepartmentSelect
                    id={`position-edit-depto-${position.id}`}
                    name="departamento_id"
                    departments={departments}
                    defaultValue={position.departamentoId ?? ""}
                    placeholder="Sin departamento"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor={`position-edit-desc-${position.id}`}>Descripción</Label>
                <Textarea
                  id={`position-edit-desc-${position.id}`}
                  name="descripcion"
                  defaultValue={position.descripcion === "—" ? "" : position.descripcion}
                  rows={3}
                />
              </div>
              <InlineStateMessage
                state={editState}
                successMessage="Cambios guardados."
              />
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

function InlineCode({ children }: { children: React.ReactNode }) {
  return <span className="text-[0.65rem] font-mono text-muted-foreground/80">{children}</span>
}

function DepartmentSelect({
  id,
  name,
  departments,
  defaultValue,
  placeholder,
}: {
  id: string
  name: string
  departments: HrDepartmentOption[]
  defaultValue?: string
  placeholder: string
}) {
  return (
    <select
      id={id}
      name={name}
      defaultValue={defaultValue ?? ""}
      className={cn(
        "h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
        "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      )}
    >
      <option value="">{placeholder}</option>
      {departments.map((dept) => (
        <option key={dept.id} value={dept.id}>
          {dept.nombre}
        </option>
      ))}
    </select>
  )
}
