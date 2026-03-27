"use client"

import { useActionState, useState } from "react"
import { useFormStatus } from "react-dom"

import {
  createPermissionAction,
  CrudActionState,
  deletePermissionAction,
  updatePermissionAction,
} from "@/app/settings/hr/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TableCell, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { formatDateTime } from "@/lib/formatters"
import { HrPermissionItem } from "@/lib/settings/hr-types"

const INITIAL_STATE: CrudActionState = { status: "idle" }

export function PermissionCreateSection() {
  const [state, formAction] = useActionState(createPermissionAction, INITIAL_STATE)
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-4">
      <form action={formAction} className="mx-auto max-w-4xl grid gap-4 md:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="permission-new-codigo">Código</Label>
          <Input
            id="permission-new-codigo"
            name="codigo"
            placeholder="crm.leads.read"
            required
          />
        </div>
        <div className="space-y-1 md:col-span-2">
          <Label htmlFor="permission-new-descripcion">Descripción</Label>
          <Textarea
            id="permission-new-descripcion"
            name="descripcion"
            placeholder="Describe qué permite hacer"
          />
        </div>
        {state.status === "error" && (
          <p className="md:col-span-3 text-sm text-destructive">{state.message}</p>
        )}
        {state.status === "success" && (
          <p className="md:col-span-3 text-sm text-emerald-600 dark:text-emerald-400">
            {state.message ?? "Permiso registrado."}
          </p>
        )}
        <div className="md:col-span-3 flex justify-end">
          <InlineSubmitButton label="Guardar permiso" pendingLabel="Guardando..." />
        </div>
      </form>
    </div>
  )
}

type PermissionInlineRowProps = {
  permission: HrPermissionItem
}

export function PermissionInlineRow({ permission }: PermissionInlineRowProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editState, editAction] = useActionState(updatePermissionAction, INITIAL_STATE)
  const [deleteState, deleteAction] = useActionState(deletePermissionAction, INITIAL_STATE)

  return (
    <>
      <TableRow>
        <TableCell>
          <span className="font-medium">{permission.codigo}</span>
        </TableCell>
        <TableCell className="max-w-[280px] whitespace-normal">
          {permission.descripcion}
        </TableCell>
        <TableCell className="hidden lg:table-cell max-w-[280px] whitespace-normal">
          {permission.roles.length ? (
            <div className="flex flex-wrap gap-1">
              {permission.roles.map((rol) => (
                <Badge key={rol} variant="outline">
                  {rol}
                </Badge>
              ))}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">Sin rol</span>
          )}
        </TableCell>
        <TableCell className="hidden xl:table-cell text-xs text-muted-foreground">
          {formatDateTime(permission.creadoEn)}
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
                  <input type="hidden" name="id" value={permission.id} />
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
          <TableCell colSpan={5}>
            <form action={editAction} className="space-y-4">
              <input type="hidden" name="id" value={permission.id} />
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1 md:col-span-2">
                  <Label htmlFor={`permission-edit-codigo-${permission.id}`}>Código</Label>
                  <Input
                    id={`permission-edit-codigo-${permission.id}`}
                    name="codigo"
                    defaultValue={permission.codigo}
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label htmlFor={`permission-edit-descripcion-${permission.id}`}>Descripción</Label>
                  <Textarea
                    id={`permission-edit-descripcion-${permission.id}`}
                    name="descripcion"
                    defaultValue={permission.descripcion === "—" ? "" : permission.descripcion}
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
