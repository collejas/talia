"use client"

import { useMemo, useState, useActionState } from "react"

import { updateRolePermissionsAction, type CrudActionState } from "@/app/settings/hr/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const INITIAL_STATE: CrudActionState = { status: "idle" }

type RolePermissionMatrixProps = {
  roles: { id: string; codigo: string; nombre: string }[]
  permisos: { id: string; codigo: string; descripcion: string }[]
  assignments: Record<string, string[]>
  errors: string[]
}

export function RolePermissionMatrix({
  roles,
  permisos,
  assignments,
  errors,
}: RolePermissionMatrixProps) {
  const [state, formAction] = useActionState(updateRolePermissionsAction, INITIAL_STATE)
  const [selectedRoleId, setSelectedRoleId] = useState<string>(roles[0]?.id ?? "")
  const [filter, setFilter] = useState("")

  const assignedSet = useMemo(() => {
    return new Set(assignments[selectedRoleId] ?? [])
  }, [assignments, selectedRoleId])

  const [selection, setSelection] = useState<Set<string>>(assignedSet)

  const filteredPermisos = useMemo(() => {
    const normalized = filter.trim().toLowerCase()
    if (!normalized) return permisos
    return permisos.filter((permiso) => {
      const code = permiso.codigo.toLowerCase()
      const desc = permiso.descripcion.toLowerCase()
      return code.includes(normalized) || desc.includes(normalized)
    })
  }, [filter, permisos])

  function handleRoleChange(roleId: string) {
    setSelectedRoleId(roleId)
    setSelection(new Set(assignments[roleId] ?? []))
  }

  function togglePermission(id: string) {
    setSelection((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function selectAll() {
    setSelection(new Set(permisos.map((permiso) => permiso.id)))
  }

  function clearAll() {
    setSelection(new Set())
  }

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle>Asignar permisos a roles</CardTitle>
        <CardDescription>
          Selecciona un rol y marca los permisos que puede usar. Los cambios se aplican al guardar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {errors.length > 0 && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {errors.map((message) => (
              <p key={message}>{message}</p>
            ))}
          </div>
        )}
        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="space-y-2">
            <Label htmlFor="role-permissions-role">Rol</Label>
            <select
              id="role-permissions-role"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={selectedRoleId}
              onChange={(event) => handleRoleChange(event.target.value)}
            >
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.nombre} ({role.codigo})
                </option>
              ))}
            </select>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">Asignados: {selection.size}</Badge>
              <Badge variant="outline">Total: {permisos.length}</Badge>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Filtrar por codigo o descripcion"
              />
              <Button type="button" variant="outline" onClick={selectAll}>
                Seleccionar todo
              </Button>
              <Button type="button" variant="ghost" onClick={clearAll}>
                Limpiar
              </Button>
            </div>
            <form action={formAction} className="space-y-3">
              <input type="hidden" name="role_id" value={selectedRoleId} />
              <div className="max-h-[420px] overflow-y-auto rounded-lg border border-border/60 p-3">
                <div className="grid gap-2 md:grid-cols-2">
                  {filteredPermisos.map((permiso) => {
                    const checked = selection.has(permiso.id)
                    return (
                      <label
                        key={permiso.id}
                        className="flex items-start gap-2 rounded-md border border-border/60 p-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          name="permiso_ids"
                          value={permiso.id}
                          checked={checked}
                          onChange={() => togglePermission(permiso.id)}
                          className="mt-1"
                        />
                        <span className="space-y-1">
                          <span className="block font-medium">{permiso.codigo}</span>
                          <span className="block text-xs text-muted-foreground">{permiso.descripcion}</span>
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
              {state.status === "error" && (
                <p className="text-sm text-destructive">{state.message}</p>
              )}
              {state.status === "success" && (
                <p className="text-sm text-emerald-600 dark:text-emerald-400">
                  {state.message ?? "Permisos actualizados."}
                </p>
              )}
              <div className="flex justify-end">
                <Button type="submit">Guardar cambios</Button>
              </div>
            </form>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
