'use client'

import * as React from "react"

import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

const DEFAULT_RANGE_DAYS = 60

type Resource = {
  id: string
  name: string
  timezone: string
  slot_minutes: number
  buffer_minutes: number
  capacity_per_slot: number
  max_days_visible: number
  is_active: boolean
}

type ExceptionItem = {
  id: string
  resource_id: string
  kind: "block" | "extra"
  start_at: string
  end_at: string
  capacity: number | null
  reason: string | null
}

type ExceptionForm = {
  id: string | null
  kind: "block" | "extra"
  startAt: string
  endAt: string
  capacity: string
  reason: string
}

const EMPTY_FORM: ExceptionForm = {
  id: null,
  kind: "block",
  startAt: "",
  endAt: "",
  capacity: "",
  reason: "",
}

export function AgendaAvailabilityManager() {
  const [loading, setLoading] = React.useState(true)
  const [savingResource, setSavingResource] = React.useState(false)
  const [savingException, setSavingException] = React.useState(false)
  const [resources, setResources] = React.useState<Resource[]>([])
  const [resourceId, setResourceId] = React.useState("")
  const [form, setForm] = React.useState<ExceptionForm>(EMPTY_FORM)
  const [exceptions, setExceptions] = React.useState<ExceptionItem[]>([])
  const [kindFilter, setKindFilter] = React.useState<"all" | "block" | "extra">("all")
  const [fromDate, setFromDate] = React.useState(defaultFromDate())
  const [toDate, setToDate] = React.useState(defaultToDate())
  const [resourceConfig, setResourceConfig] = React.useState({
    timezone: "",
    slot_minutes: "",
    buffer_minutes: "",
    capacity_per_slot: "",
    max_days_visible: "",
  })

  const selectedResource = React.useMemo(
    () => resources.find((item) => item.id === resourceId) ?? null,
    [resources, resourceId],
  )

  const loadResources = React.useCallback(async () => {
    const response = await fetch("/api/agenda/disponibilidad/resources", {
      method: "GET",
      cache: "no-store",
    })
    if (!response.ok) {
      throw new Error(await parseApiError(response))
    }
    const data = (await response.json()) as {
      default_resource_id?: string | null
      items?: Array<Resource>
    }
    const items = data.items ?? []
    setResources(items)

    if (!items.length) {
      setResourceId("")
      return
    }

    const preferred =
      items.find((item) => item.id === data.default_resource_id)?.id ?? items[0]?.id ?? ""

    setResourceId((current) => {
      if (current && items.some((item) => item.id === current)) {
        return current
      }
      return preferred
    })
  }, [])

  const loadExceptions = React.useCallback(async () => {
    if (!resourceId) {
      setExceptions([])
      return
    }
    const params = new URLSearchParams({
      resource_id: resourceId,
      from: fromDate,
      to: toDate,
      limit: "500",
    })
    if (kindFilter !== "all") {
      params.set("kind", kindFilter)
    }

    const response = await fetch(`/api/agenda/disponibilidad/exceptions?${params.toString()}`, {
      method: "GET",
      cache: "no-store",
    })
    if (!response.ok) {
      throw new Error(await parseApiError(response))
    }
    const data = (await response.json()) as { items?: ExceptionItem[] }
    setExceptions(data.items ?? [])
  }, [resourceId, fromDate, toDate, kindFilter])

  React.useEffect(() => {
    let cancelled = false
    async function bootstrap() {
      setLoading(true)
      try {
        await loadResources()
      } catch (error) {
        if (cancelled) return
        const message = error instanceof Error ? error.message : "No se pudieron cargar recursos"
        toast.error(message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    bootstrap()
    return () => {
      cancelled = true
    }
  }, [loadResources])

  React.useEffect(() => {
    if (!selectedResource) {
      setResourceConfig({
        timezone: "",
        slot_minutes: "",
        buffer_minutes: "",
        capacity_per_slot: "",
        max_days_visible: "",
      })
      return
    }
    setResourceConfig({
      timezone: selectedResource.timezone || "",
      slot_minutes: String(selectedResource.slot_minutes ?? 30),
      buffer_minutes: String(selectedResource.buffer_minutes ?? 0),
      capacity_per_slot: String(selectedResource.capacity_per_slot ?? 1),
      max_days_visible: String(selectedResource.max_days_visible ?? DEFAULT_RANGE_DAYS),
    })
  }, [selectedResource])

  React.useEffect(() => {
    let cancelled = false
    async function refresh() {
      try {
        await loadExceptions()
      } catch (error) {
        if (cancelled) return
        const message = error instanceof Error ? error.message : "No se pudieron cargar excepciones"
        toast.error(message)
      }
    }
    refresh()
    return () => {
      cancelled = true
    }
  }, [loadExceptions])

  function resetForm() {
    setForm(EMPTY_FORM)
  }

  async function saveResource() {
    if (!resourceId) return

    const slotMinutes = Number(resourceConfig.slot_minutes)
    const bufferMinutes = Number(resourceConfig.buffer_minutes)
    const capacity = Number(resourceConfig.capacity_per_slot)
    const maxDays = Number(resourceConfig.max_days_visible)

    if (!resourceConfig.timezone.trim()) {
      toast.error("Timezone es obligatoria.")
      return
    }
    if (!Number.isFinite(slotMinutes) || slotMinutes < 5 || slotMinutes > 240) {
      toast.error("slot_minutes debe estar entre 5 y 240.")
      return
    }
    if (!Number.isFinite(bufferMinutes) || bufferMinutes < 0 || bufferMinutes > 180) {
      toast.error("buffer_minutes debe estar entre 0 y 180.")
      return
    }
    if (!Number.isFinite(capacity) || capacity < 1 || capacity > 200) {
      toast.error("capacity_per_slot debe estar entre 1 y 200.")
      return
    }
    if (!Number.isFinite(maxDays) || maxDays < 1 || maxDays > 60) {
      toast.error("max_days_visible debe estar entre 1 y 60.")
      return
    }

    try {
      setSavingResource(true)
      const response = await fetch(`/api/agenda/disponibilidad/resources/${resourceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timezone: resourceConfig.timezone.trim(),
          slot_minutes: slotMinutes,
          buffer_minutes: bufferMinutes,
          capacity_per_slot: capacity,
          max_days_visible: maxDays,
        }),
      })
      if (!response.ok) {
        throw new Error(await parseApiError(response))
      }

      setResources((current) =>
        current.map((item) =>
          item.id === resourceId
            ? {
                ...item,
                timezone: resourceConfig.timezone.trim(),
                slot_minutes: slotMinutes,
                buffer_minutes: bufferMinutes,
                capacity_per_slot: capacity,
                max_days_visible: maxDays,
              }
            : item,
        ),
      )
      toast.success("Recurso actualizado.")
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo actualizar el recurso"
      toast.error(message)
    } finally {
      setSavingResource(false)
    }
  }

  async function saveException() {
    if (!resourceId) return
    if (!form.startAt || !form.endAt) {
      toast.error("Inicio y fin son obligatorios.")
      return
    }

    const startAt = toIsoFromLocalInput(form.startAt)
    const endAt = toIsoFromLocalInput(form.endAt)
    if (!startAt || !endAt) {
      toast.error("Formato de fecha/hora inválido.")
      return
    }
    if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
      toast.error("El fin debe ser mayor al inicio.")
      return
    }

    const payload: Record<string, unknown> = {
      kind: form.kind,
      start_at: startAt,
      end_at: endAt,
      reason: form.reason.trim() || null,
    }

    const capacityRaw = form.capacity.trim()
    if (capacityRaw) {
      const capacity = Number(capacityRaw)
      if (!Number.isFinite(capacity) || capacity < 0 || capacity > 200) {
        toast.error("La capacidad debe estar entre 0 y 200.")
        return
      }
      payload.capacity = capacity
    }

    try {
      setSavingException(true)
      if (form.id) {
        const response = await fetch(`/api/agenda/disponibilidad/exceptions/${form.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        if (!response.ok) {
          throw new Error(await parseApiError(response))
        }
        toast.success("Excepción actualizada.")
      } else {
        const response = await fetch("/api/agenda/disponibilidad/exceptions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payload,
            resource_id: resourceId,
          }),
        })
        if (!response.ok) {
          throw new Error(await parseApiError(response))
        }
        toast.success("Excepción creada.")
      }

      resetForm()
      await loadExceptions()
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo guardar la excepción"
      toast.error(message)
    } finally {
      setSavingException(false)
    }
  }

  async function deleteException(exceptionId: string) {
    try {
      const response = await fetch(`/api/agenda/disponibilidad/exceptions/${exceptionId}`, {
        method: "DELETE",
      })
      if (!response.ok) {
        throw new Error(await parseApiError(response))
      }
      if (form.id === exceptionId) {
        resetForm()
      }
      toast.success("Excepción eliminada.")
      await loadExceptions()
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo eliminar la excepción"
      toast.error(message)
    }
  }

  function startEdit(item: ExceptionItem) {
    setForm({
      id: item.id,
      kind: item.kind,
      startAt: toLocalDateTimeInput(item.start_at),
      endAt: toLocalDateTimeInput(item.end_at),
      capacity: item.capacity != null ? String(item.capacity) : "",
      reason: item.reason ?? "",
    })
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Configuración del recurso</CardTitle>
            <CardDescription>
              Ajusta timezone, duración de slots, buffer, capacidad y días visibles.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="resource-select">Recurso</Label>
              <Select value={resourceId} onValueChange={setResourceId} disabled={loading || resources.length === 0}>
                <SelectTrigger id="resource-select" className="w-full">
                  <SelectValue placeholder="Selecciona un recurso" />
                </SelectTrigger>
                <SelectContent>
                  {resources.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <div className="space-y-2 xl:col-span-2">
                <Label htmlFor="resource-timezone">Timezone</Label>
                <Input
                  id="resource-timezone"
                  value={resourceConfig.timezone}
                  onChange={(event) =>
                    setResourceConfig((current) => ({ ...current, timezone: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="resource-slot">Slot (min)</Label>
                <Input
                  id="resource-slot"
                  type="number"
                  value={resourceConfig.slot_minutes}
                  onChange={(event) =>
                    setResourceConfig((current) => ({ ...current, slot_minutes: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="resource-buffer">Buffer (min)</Label>
                <Input
                  id="resource-buffer"
                  type="number"
                  value={resourceConfig.buffer_minutes}
                  onChange={(event) =>
                    setResourceConfig((current) => ({ ...current, buffer_minutes: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="resource-capacity">Capacidad</Label>
                <Input
                  id="resource-capacity"
                  type="number"
                  value={resourceConfig.capacity_per_slot}
                  onChange={(event) =>
                    setResourceConfig((current) => ({ ...current, capacity_per_slot: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="resource-days">Días visibles</Label>
                <Input
                  id="resource-days"
                  type="number"
                  min={1}
                  max={60}
                  value={resourceConfig.max_days_visible}
                  onChange={(event) =>
                    setResourceConfig((current) => ({ ...current, max_days_visible: event.target.value }))
                  }
                />
              </div>
            </div>

            <div>
              <Button type="button" onClick={saveResource} disabled={savingResource || !resourceId}>
                {savingResource ? "Guardando..." : "Guardar configuración"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Filtros</CardTitle>
            <CardDescription>Controla el rango de excepciones a consultar.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="f-from">Desde</Label>
              <Input id="f-from" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="f-to">Hasta</Label>
              <Input id="f-to" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={kindFilter} onValueChange={(value: "all" | "block" | "extra") => setKindFilter(value)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="block">Bloqueos</SelectItem>
                  <SelectItem value="extra">Horarios extra</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="button" variant="outline" onClick={loadExceptions} disabled={!resourceId} className="w-full">
              Recargar excepciones
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{form.id ? "Editar excepción" : "Crear excepción"}</CardTitle>
            <CardDescription>Alta rápida de bloques u horarios extra.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select
                  value={form.kind}
                  onValueChange={(value: "block" | "extra") =>
                    setForm((current) => ({ ...current, kind: value }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="block">Bloqueo</SelectItem>
                    <SelectItem value="extra">Horario extra</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="x-capacity">Capacidad (opcional)</Label>
                <Input
                  id="x-capacity"
                  type="number"
                  value={form.capacity}
                  onChange={(event) => setForm((current) => ({ ...current, capacity: event.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="x-start">Inicio</Label>
                <Input
                  id="x-start"
                  type="datetime-local"
                  value={form.startAt}
                  onChange={(event) => setForm((current) => ({ ...current, startAt: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="x-end">Fin</Label>
                <Input
                  id="x-end"
                  type="datetime-local"
                  value={form.endAt}
                  onChange={(event) => setForm((current) => ({ ...current, endAt: event.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="x-reason">Motivo</Label>
              <Textarea
                id="x-reason"
                value={form.reason}
                onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))}
                placeholder="Vacaciones, reunión interna, horario extendido, etc."
              />
            </div>

            <div className="flex gap-2">
              <Button type="button" onClick={saveException} disabled={savingException || !resourceId}>
                {savingException ? "Guardando..." : form.id ? "Guardar cambios" : "Crear excepción"}
              </Button>
              <Button type="button" variant="ghost" onClick={resetForm}>
                Limpiar
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Excepciones ({exceptions.length})</CardTitle>
            <CardDescription>Selecciona una para editarla o eliminarla.</CardDescription>
          </CardHeader>
          <CardContent>
            {!exceptions.length ? (
              <p className="text-sm text-muted-foreground">No hay registros para este filtro.</p>
            ) : (
              <div className="max-h-[34rem] space-y-2 overflow-auto pr-1">
                {exceptions.map((item) => (
                  <div key={item.id} className="rounded-md border border-border/70 p-3">
                    <p className="text-sm font-medium">
                      {item.kind === "block" ? "Bloqueo" : "Horario extra"}
                    </p>
                    <p className="text-muted-foreground text-xs">{formatRange(item.start_at, item.end_at)}</p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {item.reason || "Sin motivo"}
                      {item.capacity != null ? ` · Capacidad ${item.capacity}` : ""}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => startEdit(item)}>
                        Editar
                      </Button>
                      <Button type="button" size="sm" variant="destructive" onClick={() => deleteException(item.id)}>
                        Eliminar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function defaultFromDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function defaultToDate(): string {
  const target = new Date()
  target.setDate(target.getDate() + DEFAULT_RANGE_DAYS)
  return target.toISOString().slice(0, 10)
}

function toIsoFromLocalInput(value: string): string | null {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

function toLocalDateTimeInput(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ""
  const tzOffset = parsed.getTimezoneOffset() * 60_000
  return new Date(parsed.getTime() - tzOffset).toISOString().slice(0, 16)
}

function formatRange(startAt: string, endAt: string): string {
  try {
    const formatter = new Intl.DateTimeFormat("es-MX", {
      dateStyle: "short",
      timeStyle: "short",
    })
    return `${formatter.format(new Date(startAt))} - ${formatter.format(new Date(endAt))}`
  } catch {
    return `${startAt} - ${endAt}`
  }
}

async function parseApiError(response: Response): Promise<string> {
  const text = await response.text()
  if (!text) return `Error HTTP ${response.status}`
  try {
    const parsed = JSON.parse(text) as { error?: string; detail?: string }
    if (parsed.error) return parsed.error
    if (parsed.detail) return parsed.detail
  } catch {
    // noop
  }
  return text
}
