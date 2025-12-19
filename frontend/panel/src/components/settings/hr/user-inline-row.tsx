"use client"

import { useActionState, useMemo, useState } from "react"
import { useFormStatus } from "react-dom"

import {
  CrudActionState,
  createUserAction,
  deleteUserAction,
  updateUserAction,
} from "@/app/settings/hr/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TableCell, TableRow } from "@/components/ui/table"
import { formatDateTime } from "@/lib/formatters"
import { HrUserItem } from "@/lib/settings/hr-types"
import { cn } from "@/lib/utils"

const INITIAL_STATE: CrudActionState = { status: "idle" }

type UserInlineRowProps = {
  user: HrUserItem
}

export function UserCreateRow() {
  const [state, action] = useActionState(createUserAction, INITIAL_STATE)
  return (
    <TableRow className="bg-muted/30">
      <TableCell colSpan={8}>
        <form action={action} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="user-new-name">Nombre completo</Label>
              <Input id="user-new-name" name="nombre_completo" placeholder="Nombre" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="user-new-email">Correo</Label>
              <Input
                id="user-new-email"
                name="correo"
                type="email"
                placeholder="usuario@empresa.com"
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="user-new-phone">Teléfono</Label>
              <Input id="user-new-phone" name="telefono" placeholder="+521234567890" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="user-new-estado">Estado</Label>
              <select
                id="user-new-estado"
                name="estado"
                defaultValue="activo"
                className={cn(
                  "h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
                  "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                )}
              >
                <option value="activo">Activo</option>
                <option value="bloqueado">Bloqueado</option>
              </select>
            </div>
          </div>
          <InlineStateMessage state={state} />
          <div className="flex justify-end">
            <InlineSubmitButton label="Crear usuario" pendingLabel="Guardando..." />
          </div>
        </form>
      </TableCell>
    </TableRow>
  )
}

export function UserInlineRow({ user }: UserInlineRowProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const [editState, editAction] = useActionState(updateUserAction, INITIAL_STATE)
  const [deleteState, deleteAction] = useActionState(deleteUserAction, INITIAL_STATE)

  const estadoVariant = useMemo(() => getEstadoVariant(user.estado), [user.estado])

  return (
    <>
      <TableRow>
        <TableCell>
          <div className="flex flex-col gap-1">
            <span className="font-medium">{user.nombre}</span>
            <span className="text-xs text-muted-foreground">{user.correo || "—"}</span>
            <span className="text-[0.65rem] font-mono text-muted-foreground/80">
              {user.id}
            </span>
          </div>
        </TableCell>
        <TableCell className="hidden lg:table-cell">
          {user.roles.length ? (
            <div className="flex flex-wrap gap-1">
              {user.roles.map((role) => (
                <Badge key={role} variant="secondary">
                  {role}
                </Badge>
              ))}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">Sin rol</span>
          )}
        </TableCell>
        <TableCell className="hidden md:table-cell">{user.departamento}</TableCell>
        <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
          {user.puesto}
        </TableCell>
        <TableCell>
          <Badge variant={estadoVariant}>{user.estado}</Badge>
        </TableCell>
        <TableCell className="hidden xl:table-cell text-xs text-muted-foreground">
          {formatDateTime(user.ultimoAcceso)}
        </TableCell>
        <TableCell className="hidden xl:table-cell text-xs text-muted-foreground">
          {formatDateTime(user.creadoEn)}
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
                  <input type="hidden" name="id" value={user.id} />
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
          <TableCell colSpan={8}>
            <form action={editAction} className="space-y-4">
              <input type="hidden" name="id" value={user.id} />
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor={`user-edit-name-${user.id}`}>Nombre completo</Label>
                  <Input
                    id={`user-edit-name-${user.id}`}
                    name="nombre_completo"
                    defaultValue={user.nombre}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`user-edit-email-${user.id}`}>Correo</Label>
                  <Input
                    id={`user-edit-email-${user.id}`}
                    name="correo"
                    type="email"
                    defaultValue={user.correo}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`user-edit-phone-${user.id}`}>Teléfono</Label>
                  <Input
                    id={`user-edit-phone-${user.id}`}
                    name="telefono"
                    defaultValue={user.telefono}
                  />
                </div>
                <div className="space-y-1">
              <Label htmlFor={`user-edit-estado-${user.id}`}>Estado</Label>
              <select
                id={`user-edit-estado-${user.id}`}
                name="estado"
                defaultValue={user.estado}
                className={cn(
                  "h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
                  "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                )}
              >
                <option value="activo">Activo</option>
                <option value="bloqueado">Bloqueado</option>
              </select>
            </div>
          </div>
              {editState.status === "error" && (
                <p className="text-sm text-destructive">{editState.message}</p>
              )}
              {editState.status === "success" && (
                <p className="text-sm text-emerald-600 dark:text-emerald-400">
                  Cambios guardados.
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setIsEditing(false)}
                >
                  Cancelar
                </Button>
                <InlineSubmitButton
                  label="Guardar cambios"
                  pendingLabel="Guardando..."
                />
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

function getEstadoVariant(
  estado: string,
): "secondary" | "outline" | "destructive" {
  if (estado === "activo") return "secondary"
  if (estado === "bloqueado") return "destructive"
  return "outline"
}

function InlineStateMessage({ state }: { state: CrudActionState }) {
  if (state.status === "idle") return null
  if (state.status === "error") {
    return <p className="text-sm text-destructive">{state.message}</p>
  }
  if (state.status === "success") {
    return (
      <p className="text-sm text-emerald-600 dark:text-emerald-400">
        {state.message ?? "Usuario creado."}
      </p>
    )
  }
  return null
}
