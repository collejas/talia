"use client"

import { useMemo, useState, type FormEvent } from "react"
import { IconCheck, IconEdit, IconPlus, IconShieldLock, IconX } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  createPriceListAction,
  deactivatePriceListAction,
  fetchPriceListPermissions,
  type PriceList,
  type PriceListPermissionOptions,
  type PriceListPermissions,
  updatePriceListPermissionsAction,
  updatePriceListAction,
} from "@/app/settings/account/actions"

type Props = { initialLists: PriceList[]; permissionOptions: PriceListPermissionOptions }
type Status = { kind: "success" | "error"; message: string } | null

export function PriceListsManager({ initialLists, permissionOptions }: Props) {
  const [lists, setLists] = useState(() => [...initialLists].sort((a, b) => a.nombre.localeCompare(b.nombre)))
  const [name, setName] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState("")
  const [status, setStatus] = useState<Status>(null)
  const [saving, setSaving] = useState(false)
  const [permissionsFor, setPermissionsFor] = useState<string | null>(null)
  const [permissionState, setPermissionState] = useState<PriceListPermissions | null>(null)
  const [loadingPermissions, setLoadingPermissions] = useState(false)

  const activeCount = useMemo(() => lists.filter((item) => item.activo).length, [lists])

  const showError = (error: unknown, fallback: string) => {
    setStatus({ kind: "error", message: error instanceof Error ? error.message : fallback })
  }

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setStatus(null)
    setSaving(true)
    try {
      const created = await createPriceListAction({ nombre: name })
      setLists((current) => [...current, created].sort((a, b) => a.nombre.localeCompare(b.nombre)))
      setName("")
      setStatus({ kind: "success", message: "Lista de precios creada correctamente." })
    } catch (error) {
      showError(error, "No se pudo crear la lista de precios.")
    } finally {
      setSaving(false)
    }
  }

  const handleUpdate = async (id: string) => {
    setStatus(null)
    setSaving(true)
    try {
      const updated = await updatePriceListAction(id, { nombre: editingName })
      setLists((current) => current.map((item) => (item.id === id ? updated : item)).sort((a, b) => a.nombre.localeCompare(b.nombre)))
      setEditingId(null)
      setEditingName("")
      setStatus({ kind: "success", message: "Nombre de lista actualizado correctamente." })
    } catch (error) {
      showError(error, "No se pudo actualizar la lista de precios.")
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (item: PriceList) => {
    setStatus(null)
    setSaving(true)
    try {
      const updated = item.activo
        ? await deactivatePriceListAction(item.id)
        : await updatePriceListAction(item.id, { nombre: item.nombre, activo: true })
      setLists((current) => current.map((entry) => (entry.id === item.id ? updated : entry)))
      setStatus({ kind: "success", message: updated.activo ? "Lista reactivada." : "Lista desactivada." })
    } catch (error) {
      showError(error, "No se pudo cambiar el estado de la lista.")
    } finally {
      setSaving(false)
    }
  }

  const handleOpenPermissions = async (item: PriceList) => {
    setStatus(null)
    setPermissionsFor(item.id)
    setPermissionState(null)
    setLoadingPermissions(true)
    try {
      setPermissionState(await fetchPriceListPermissions(item.id))
    } catch (error) {
      showError(error, "No se pudieron consultar los permisos de la lista.")
      setPermissionsFor(null)
    } finally {
      setLoadingPermissions(false)
    }
  }

  const togglePermission = (key: keyof PriceListPermissions, id: string) => {
    setPermissionState((current) => {
      if (!current) return current
      const values = new Set(current[key])
      if (values.has(id)) values.delete(id)
      else values.add(id)
      return { ...current, [key]: Array.from(values) }
    })
  }

  const handleSavePermissions = async () => {
    if (!permissionsFor || !permissionState) return
    setStatus(null)
    setSaving(true)
    try {
      setPermissionState(await updatePriceListPermissionsAction(permissionsFor, permissionState))
      setStatus({ kind: "success", message: "Permisos de lista actualizados correctamente." })
    } catch (error) {
      showError(error, "No se pudieron guardar los permisos de la lista.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>Listas de precios</CardTitle>
            <CardDescription>
              Define los nombres que podrán utilizarse para capturar precios por producto y cotizar por línea.
            </CardDescription>
          </div>
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-right">
            <p className="text-xs text-muted-foreground">Listas activas</p>
            <p className="text-lg font-semibold">{activeCount}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <form className="flex flex-col gap-3 rounded-md border border-dashed border-border p-4 sm:flex-row sm:items-end" onSubmit={handleCreate}>
          <div className="flex-1 space-y-2">
            <Label htmlFor="new-price-list-name">Nueva lista</Label>
            <Input
              id="new-price-list-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ej. Precio distribuidor"
              maxLength={120}
              disabled={saving}
            />
          </div>
          <Button type="submit" className="gap-2" disabled={saving || !name.trim()}>
            <IconPlus className="size-4" />
            Agregar lista
          </Button>
        </form>

        {status ? (
          <p className={status.kind === "error" ? "text-sm text-destructive" : "text-sm text-emerald-600"} role="status">
            {status.message}
          </p>
        ) : null}

        {lists.length ? (
          <div className="overflow-x-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-[280px] text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lists.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      {editingId === item.id ? (
                        <Input
                          value={editingName}
                          onChange={(event) => setEditingName(event.target.value)}
                          maxLength={120}
                          autoFocus
                          disabled={saving}
                        />
                      ) : (
                        <span className={item.activo ? "font-medium" : "text-muted-foreground line-through"}>{item.nombre}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className={item.activo ? "text-emerald-600" : "text-muted-foreground"}>
                        {item.activo ? "Activa" : "Inactiva"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        {editingId === item.id ? (
                          <>
                            <Button type="button" size="sm" onClick={() => void handleUpdate(item.id)} disabled={saving || !editingName.trim()}>
                              <IconCheck className="mr-1 size-4" />
                              Guardar
                            </Button>
                            <Button type="button" variant="ghost" size="sm" onClick={() => setEditingId(null)} disabled={saving}>
                              <IconX className="mr-1 size-4" />
                              Cancelar
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setEditingId(item.id)
                                setEditingName(item.nombre)
                              }}
                              disabled={saving}
                            >
                              <IconEdit className="mr-1 size-4" />
                              Editar
                            </Button>
                            <Button type="button" variant="ghost" size="sm" onClick={() => void handleToggle(item)} disabled={saving}>
                              {item.activo ? "Desactivar" : "Activar"}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => void handleOpenPermissions(item)}
                              disabled={saving || !item.activo}
                            >
                              <IconShieldLock className="mr-1 size-4" />
                              Permisos
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border px-4 py-8 text-center">
            <p className="font-medium">Todavía no hay listas de precios</p>
            <p className="mt-1 text-sm text-muted-foreground">Crea la primera para comenzar a capturar precios por producto.</p>
          </div>
        )}

        {permissionsFor ? (
          <div className="rounded-md border border-border bg-muted/20 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">Quién puede aplicar esta lista</h3>
                <p className="text-sm text-muted-foreground">
                  La selección se valida también en el backend al consultar y aplicar precios en una cotización.
                </p>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setPermissionsFor(null)} disabled={saving}>
                Cerrar
              </Button>
            </div>
            {loadingPermissions || !permissionState ? (
              <p className="mt-4 text-sm text-muted-foreground">Cargando permisos…</p>
            ) : (
              <div className="mt-4 grid gap-4 lg:grid-cols-3">
                <PermissionGroup
                  title="Roles"
                  emptyMessage="No hay roles disponibles."
                  items={permissionOptions.roles.map((role) => ({ id: role.id, label: `${role.nombre} (${role.codigo})` }))}
                  selected={permissionState.roleIds}
                  onToggle={(id) => togglePermission("roleIds", id)}
                />
                <PermissionGroup
                  title="Usuarios"
                  emptyMessage="No hay usuarios disponibles."
                  items={permissionOptions.usuarios.map((user) => ({ id: user.id, label: `${user.nombre} · ${user.correo}` }))}
                  selected={permissionState.userIds}
                  onToggle={(id) => togglePermission("userIds", id)}
                />
                <PermissionGroup
                  title="Empleados"
                  emptyMessage="No hay empleados disponibles."
                  items={permissionOptions.usuarios
                    .filter((user) => user.esEmpleado)
                    .map((user) => ({ id: user.id, label: `${user.nombre} · ${user.correo}` }))}
                  selected={permissionState.employeeUserIds}
                  onToggle={(id) => togglePermission("employeeUserIds", id)}
                />
              </div>
            )}
            {permissionState ? (
              <div className="mt-4 flex justify-end">
                <Button type="button" onClick={() => void handleSavePermissions()} disabled={saving || loadingPermissions}>
                  Guardar permisos
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function PermissionGroup({
  title,
  emptyMessage,
  items,
  selected,
  onToggle,
}: {
  title: string
  emptyMessage: string
  items: { id: string; label: string }[]
  selected: string[]
  onToggle: (id: string) => void
}) {
  const selectedSet = new Set(selected)
  return (
    <fieldset className="min-w-0 rounded-md border border-border bg-background p-3">
      <legend className="px-1 text-sm font-medium">{title}</legend>
      <div className="mt-2 max-h-52 space-y-2 overflow-y-auto">
        {items.length ? (
          items.map((item) => (
            <label key={item.id} className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={selectedSet.has(item.id)} onChange={() => onToggle(item.id)} className="mt-0.5" />
              <span className="min-w-0 break-words">{item.label}</span>
            </label>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        )}
      </div>
    </fieldset>
  )
}
