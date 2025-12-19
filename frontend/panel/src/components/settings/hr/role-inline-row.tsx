"use client"

import { useActionState, useState } from "react"
import { useFormStatus } from "react-dom"

import {
  CrudActionState,
  deleteRoleAction,
  updateRoleAction,
} from "@/app/settings/hr/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { TableCell, TableRow } from "@/components/ui/table"
import { formatDateTime } from "@/lib/formatters"
import { HrRoleItem } from "@/lib/settings/hr-types"

const INITIAL_STATE: CrudActionState = { status: "idle" }

type RoleInlineRowProps = {
  role: HrRoleItem
}

export function RoleInlineRow({ role }: RoleInlineRowProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const [editState, editAction] = useActionState(updateRoleAction, INITIAL_STATE)
  const [deleteState, deleteAction] = useActionState(deleteRoleAction, INITIAL_STATE)

  return (
    <>
      <TableRow>
        <TableCell>
          <span className="font-mono text-sm text-muted-foreground">{role.codigo}</span>
        </TableCell>
        <TableCell>
          <div className="flex flex-col gap-1">
            <span className="font-medium">{role.nombre}</span>
            <span className="text-[0.65rem] font-mono text-muted-foreground/80">{role.id}</span>
          </div>
        </TableCell>
        <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
          {role.descripcion}
        </TableCell>
        <TableCell className="hidden lg:table-cell">
          {role.permisos.length ? (
            <div className="flex flex-wrap gap-1">
              {role.permisos.map((permiso) => (
                <Badge key={permiso} variant="outline">
                  {permiso}
                </Badge>
              ))}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">Sin permisos</span>
          )}
        </TableCell>
        <TableCell className="text-sm text-muted-foreground">{role.usuarios}</TableCell>
        <TableCell className="hidden xl:table-cell text-xs text-muted-foreground">
          {formatDateTime(role.creadoEn)}
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
                  <input type="hidden" name="id" value={role.id} />
                  <InlineSubmitButton
                    label="Confirmar"
                    pendingLabel="Eliminando..."
                    variant="destructive"
                    size="sm"
                  />
                </form>
                <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
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
          <TableCell colSpan={7}>
            <form action={editAction} className="space-y-4">
              <input type="hidden" name="id" value={role.id} />
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor={`role-edit-nombre-${role.id}`}>Nombre</Label>
                  <Input
                    id={`role-edit-nombre-${role.id}`}
                    name="nombre"
                    defaultValue={role.nombre}
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label htmlFor={`role-edit-descripcion-${role.id}`}>Descripción</Label>
                  <Textarea
                    id={`role-edit-descripcion-${role.id}`}
                    name="descripcion"
                    defaultValue={role.descripcion === "—" ? "" : role.descripcion}
                  />
                </div>
              </div>
              {editState.status === "error" && (
                <p className="text-sm text-destructive">{editState.message}</p>
              )}
              {editState.status === "success" && (
                <p className="text-sm text-emerald-600 dark:text-emerald-400">Cambios guardados.</p>
              )}
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
