"use client"

import { useActionState, useMemo, useState } from "react"
import { useFormStatus } from "react-dom"

import {
  CrudActionState,
  createEmployeeAction,
  deleteEmployeeAction,
  updateEmployeeAction,
} from "@/app/settings/hr/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { TableCell, TableRow } from "@/components/ui/table"
import { formatDateTime } from "@/lib/formatters"
import {
  HrDepartmentOption,
  HrEmployeeItem,
  HrEmployeeUserOption,
  HrPositionOption,
} from "@/lib/settings/hr-types"
import { cn } from "@/lib/utils"

const INITIAL_STATE: CrudActionState = { status: "idle" }

type AssignmentOptions = {
  departments: HrDepartmentOption[]
  positions: HrPositionOption[]
}

type EmployeeCreateOptions = AssignmentOptions & {
  userOptions: HrEmployeeUserOption[]
}

type EmployeeInlineRowProps = AssignmentOptions & {
  employee: HrEmployeeItem
}

export function EmployeeCreateRow({ departments, positions, userOptions }: EmployeeCreateOptions) {
  const [state, action] = useActionState(createEmployeeAction, INITIAL_STATE)
  const [blockingMessage, setBlockingMessage] = useState<string | null>(null)

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    if (userOptions.length === 0) {
      event.preventDefault()
      setBlockingMessage(
        "Antes de registrar un empleado debes crear primero el usuario en Settings → Usuarios.",
      )
      return
    }
  }
  return (
    <TableRow className="bg-muted/30">
      <TableCell colSpan={8}>
        <form action={action} className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="employee-new-user">Usuario</Label>
              <AssignmentSelect
                id="employee-new-user"
                name="usuario_id"
                placeholder={
                  userOptions.length
                    ? "Selecciona un usuario disponible"
                    : "No hay usuarios disponibles"
                }
                options={userOptions.map((user) => ({
                  id: user.id,
                  label: `${user.nombre}${
                    user.correo ? ` · ${user.correo}` : ""
                  }`,
                }))}
                disabled={userOptions.length === 0}
                required
              />
              <p className="text-xs text-muted-foreground">
                {userOptions.length
                  ? "Sólo aparecen usuarios que aún no tienen registro de empleado."
                  : "Crea el usuario en Settings → Usuarios y vuelve a intentarlo."}
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="employee-new-depto">Departamento</Label>
              <AssignmentSelect
                id="employee-new-depto"
                name="departamento_id"
                placeholder="Sin departamento"
                options={departments.map((dept) => ({
                  id: dept.id,
                  label: dept.nombre,
                }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="employee-new-puesto">Puesto</Label>
              <AssignmentSelect
                id="employee-new-puesto"
                name="puesto_id"
                placeholder="Sin puesto"
                options={positions.map((puesto) => ({
                  id: puesto.id,
                  label: `${puesto.nombre} · ${puesto.departamentoNombre}`,
                }))}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-4 rounded-md border border-border/60 p-3">
            <InlineCheckbox id="employee-new-gestor" name="es_gestor" label="Gestor" />
            <InlineCheckbox
              id="employee-new-vendedor"
              name="es_vendedor"
              label="Vendedor"
            />
          </div>
          <InlineStateMessage state={state} />
          <div className="flex justify-end">
            <InlineSubmitButton label="Crear empleado" pendingLabel="Guardando..." />
          </div>
        </form>
        <Dialog open={Boolean(blockingMessage)} onOpenChange={(open) => !open && setBlockingMessage(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Usuario requerido</DialogTitle>
              <DialogDescription>
                {blockingMessage ??
                  "Crea primero el usuario en Settings → Usuarios antes de asignarlo como empleado."}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" onClick={() => setBlockingMessage(null)}>
                Entendido
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </TableCell>
    </TableRow>
  )
}

export function EmployeeInlineRow({ employee, departments, positions }: EmployeeInlineRowProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const [editState, editAction] = useActionState(updateEmployeeAction, INITIAL_STATE)
  const [deleteState, deleteAction] = useActionState(deleteEmployeeAction, INITIAL_STATE)

  const estadoVariant = useMemo(() => getEstadoVariant(employee.estado), [employee.estado])
  const departamentoNombre = useMemo(() => {
    if (!employee.departamentoId) return "Sin departamento"
    return (
      departments.find((dept) => dept.id === employee.departamentoId)?.nombre ??
      employee.departamento ??
      "Sin departamento"
    )
  }, [employee.departamento, employee.departamentoId, departments])
  const puestoNombre = useMemo(() => {
    if (!employee.puestoId) return "Sin puesto"
    return (
      positions.find((puesto) => puesto.id === employee.puestoId)?.nombre ??
      employee.puesto ??
      "Sin puesto"
    )
  }, [employee.puesto, employee.puestoId, positions])

  return (
    <>
      <TableRow>
        <TableCell>
          <div className="flex flex-col gap-1">
            <span className="font-medium">{employee.nombre}</span>
            <span className="text-xs text-muted-foreground">{employee.correo || "—"}</span>
            <span className="text-[0.65rem] font-mono text-muted-foreground/80">
              {employee.id}
            </span>
          </div>
        </TableCell>
        <TableCell className="hidden md:table-cell">{departamentoNombre}</TableCell>
        <TableCell className="hidden lg:table-cell">{puestoNombre}</TableCell>
        <TableCell>
          <Badge variant={employee.esGestor ? "secondary" : "outline"}>
            {employee.esGestor ? "Sí" : "No"}
          </Badge>
        </TableCell>
        <TableCell>
          <Badge variant={employee.esVendedor ? "secondary" : "outline"}>
            {employee.esVendedor ? "Sí" : "No"}
          </Badge>
        </TableCell>
        <TableCell className="hidden lg:table-cell">
          <Badge variant={estadoVariant}>{employee.estado}</Badge>
        </TableCell>
        <TableCell className="hidden xl:table-cell text-xs text-muted-foreground">
          {formatDateTime(employee.creadoEn)}
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
                  <input type="hidden" name="usuario_id" value={employee.id} />
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
              <input type="hidden" name="usuario_id" value={employee.id} />
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor={`employee-edit-depto-${employee.id}`}>Departamento</Label>
                  <AssignmentSelect
                    id={`employee-edit-depto-${employee.id}`}
                    name="departamento_id"
                    defaultValue={employee.departamentoId ?? ""}
                    placeholder="Sin departamento"
                    options={departments.map((dept) => ({
                      id: dept.id,
                      label: dept.nombre,
                    }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`employee-edit-puesto-${employee.id}`}>Puesto</Label>
                  <AssignmentSelect
                    id={`employee-edit-puesto-${employee.id}`}
                    name="puesto_id"
                    defaultValue={employee.puestoId ?? ""}
                    placeholder="Sin puesto"
                    options={positions.map((puesto) => ({
                      id: puesto.id,
                      label: `${puesto.nombre} · ${puesto.departamentoNombre}`,
                    }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Marcadores</Label>
                  <div className="flex flex-wrap gap-4 rounded-md border border-border/60 p-3">
                    <InlineCheckbox
                      id={`employee-edit-gestor-${employee.id}`}
                      name="es_gestor"
                      label="Gestor"
                      defaultChecked={employee.esGestor}
                    />
                    <InlineCheckbox
                      id={`employee-edit-vendedor-${employee.id}`}
                      name="es_vendedor"
                      label="Vendedor"
                      defaultChecked={employee.esVendedor}
                    />
                  </div>
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

function InlineCheckbox({
  id,
  label,
  name,
  defaultChecked,
}: {
  id: string
  label: string
  name: string
  defaultChecked?: boolean
}) {
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm font-medium">
      <input
        id={id}
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        className="h-4 w-4 rounded border-border"
      />
      {label}
    </label>
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

function getEstadoVariant(
  estado: string,
): "secondary" | "outline" | "destructive" {
  if (estado === "activo") return "secondary"
  if (estado === "bloqueado") return "destructive"
  return "outline"
}

function AssignmentSelect({
  id,
  name,
  options,
  defaultValue,
  placeholder,
  disabled,
  required,
}: {
  id: string
  name: string
  options: Array<{ id: string; label: string }>
  defaultValue?: string
  placeholder: string
  disabled?: boolean
  required?: boolean
}) {
  return (
    <select
      id={id}
      name={name}
      defaultValue={defaultValue ?? ""}
      disabled={disabled}
      required={required}
      className={cn(
        "h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
        "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </select>
  )
}
