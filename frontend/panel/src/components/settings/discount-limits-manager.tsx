"use client"

import { useMemo, useState } from "react"

import {
  updateDiscountLimitsAction,
  type DiscountLimit,
  type DiscountLimitInput,
  type PriceList,
  type PriceListPermissionOptions,
} from "@/app/settings/account/actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type TargetType = "rol" | "usuario" | "empleado"
type Target = { type: TargetType; id: string; label: string }
type EditableLimit = Target & { porcentaje: string }
type Props = {
  lists: PriceList[]
  permissionOptions: PriceListPermissionOptions
  initialBaseLimits: DiscountLimit[]
  initialListLimits: Record<string, DiscountLimit[]>
}
type Status = { kind: "success" | "error"; message: string } | null

export function DiscountLimitsManager({ lists, permissionOptions, initialBaseLimits, initialListLimits }: Props) {
  const targets = useMemo<Target[]>(
    () => [
      ...permissionOptions.roles.map((item) => ({ type: "rol" as const, id: item.id, label: `Rol: ${item.nombre}` })),
      ...permissionOptions.usuarios.map((item) => ({ type: "usuario" as const, id: item.id, label: `Usuario: ${item.nombre}` })),
      ...permissionOptions.usuarios
        .filter((item) => item.esEmpleado)
        .map((item) => ({ type: "empleado" as const, id: item.id, label: `Empleado: ${item.nombre}` })),
    ],
    [permissionOptions],
  )
  const initial = useMemo(() => {
    const map: Record<string, EditableLimit[]> = {}
    const add = (key: string, row: DiscountLimit) => {
      const type: TargetType = row.rolId ? "rol" : row.usuarioId ? "usuario" : "empleado"
      const id = row.rolId || row.usuarioId || row.empleadoUsuarioId || ""
      const target = targets.find((item) => item.type === type && item.id === id)
      if (target) (map[key] ||= []).push({ ...target, porcentaje: String(row.descuentoMaximoPorcentaje) })
    }
    for (const row of initialBaseLimits) add("base", row)
    for (const [listId, rows] of Object.entries(initialListLimits)) for (const row of rows) add(listId, row)
    return map
  }, [initialBaseLimits, initialListLimits, targets])
  const [values, setValues] = useState(initial)
  const [status, setStatus] = useState<Status>(null)
  const [savingKey, setSavingKey] = useState<string | null>(null)

  const addRow = (key: string) => {
    const available = targets.find((target) => !(values[key] || []).some((row) => row.type === target.type && row.id === target.id))
    if (!available) return
    setValues((current) => ({ ...current, [key]: [...(current[key] || []), { ...available, porcentaje: "0" }] }))
  }

  const removeRow = (key: string, index: number) => {
    setValues((current) => ({ ...current, [key]: (current[key] || []).filter((_, rowIndex) => rowIndex !== index) }))
  }

  const save = async (key: string) => {
    setStatus(null)
    setSavingKey(key)
    try {
      const rows = values[key] || []
      const payload: DiscountLimitInput[] = rows.map((row) => ({
        tipo_precio: key === "base" ? "base" : "lista",
        lista_precio_id: key === "base" ? null : key,
        rol_id: row.type === "rol" ? row.id : null,
        usuario_id: row.type === "usuario" ? row.id : null,
        empleado_usuario_id: row.type === "empleado" ? row.id : null,
        descuento_maximo_porcentaje: Math.max(0, Math.min(100, Number(row.porcentaje) || 0)),
        activo: true,
      }))
      const saved = await updateDiscountLimitsAction(
        key === "base" ? { tipoPrecio: "base" } : { tipoPrecio: "lista", listaPrecioId: key },
        payload,
      )
      setValues((current) => ({
        ...current,
        [key]: saved.flatMap((row) => {
          const type: TargetType = row.rolId ? "rol" : row.usuarioId ? "usuario" : "empleado"
          const id = row.rolId || row.usuarioId || row.empleadoUsuarioId || ""
          const target = targets.find((item) => item.type === type && item.id === id)
          return target ? [{ ...target, porcentaje: String(row.descuentoMaximoPorcentaje) }] : []
        }),
      }))
      setStatus({ kind: "success", message: "Límites de descuento actualizados." })
    } catch (error) {
      setStatus({ kind: "error", message: error instanceof Error ? error.message : "No se pudieron guardar los límites." })
    } finally {
      setSavingKey(null)
    }
  }

  const sections = [{ key: "base", name: "Precio base" }, ...lists.filter((item) => item.activo).map((item) => ({ key: item.id, name: item.nombre }))]
  return (
    <Card>
      <CardHeader>
        <CardTitle>Límites de descuento</CardTitle>
        <CardDescription>Configura el porcentaje máximo permitido sobre el precio seleccionado. El acceso a una lista y el descuento son permisos independientes.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {status ? <p className={status.kind === "error" ? "text-sm text-destructive" : "text-sm text-emerald-600"} role="status">{status.message}</p> : null}
        {sections.map((section) => {
          const rows = values[section.key] || []
          return (
            <section key={section.key} className="rounded-md border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-semibold">{section.name}</h3>
                  <p className="text-xs text-muted-foreground">Descuento calculado sobre este precio.</p>
                </div>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => addRow(section.key)} disabled={savingKey !== null || rows.length >= targets.length}>Agregar regla</Button>
                  <Button type="button" size="sm" onClick={() => void save(section.key)} disabled={savingKey !== null}>{savingKey === section.key ? "Guardando…" : "Guardar"}</Button>
                </div>
              </div>
              {rows.length ? (
                <div className="mt-3 space-y-2">
                  {rows.map((row, index) => (
                    <div key={`${row.type}-${row.id}`} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px_auto] sm:items-end">
                      <div className="space-y-1"><Label className="text-xs">Sujeto</Label><select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={`${row.type}:${row.id}`} onChange={(event) => { const [type, id] = event.target.value.split(":"); const target = targets.find((item) => item.type === type && item.id === id); if (target) setValues((current) => ({ ...current, [section.key]: (current[section.key] || []).map((entry, rowIndex) => rowIndex === index ? { ...target, porcentaje: entry.porcentaje } : entry) })) }}>{targets.map((target) => <option key={`${target.type}:${target.id}`} value={`${target.type}:${target.id}`}>{target.label}</option>)}</select></div>
                      <div className="space-y-1"><Label className="text-xs">Máximo (%)</Label><Input type="number" min="0" max="100" step="0.01" value={row.porcentaje} onChange={(event) => setValues((current) => ({ ...current, [section.key]: (current[section.key] || []).map((entry, rowIndex) => rowIndex === index ? { ...entry, porcentaje: event.target.value } : entry) }))} /></div>
                      <Button type="button" size="sm" variant="ghost" onClick={() => removeRow(section.key, index)}>Quitar</Button>
                    </div>
                  ))}
                </div>
              ) : <p className="mt-3 text-sm text-muted-foreground">Sin límites configurados; no se permitirá aplicar descuentos.</p>}
            </section>
          )
        })}
      </CardContent>
    </Card>
  )
}
