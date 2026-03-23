'use client'

import * as React from "react"
import Link from "next/link"

import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
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

type CalendarResource = {
  id: string
  name: string
  timezone: string
  max_days_visible: number
  is_active: boolean
}

type CalendarException = {
  id: string
  resource_id: string
  kind: "block" | "extra"
  start_at: string
  end_at: string
  capacity: number | null
  reason: string | null
}

type ExceptionFormState = {
  id: string | null
  kind: "block" | "extra"
  startAt: string
  endAt: string
  capacity: string
  reason: string
}

const EMPTY_EXCEPTION_FORM: ExceptionFormState = {
  id: null,
  kind: "block",
  startAt: "",
  endAt: "",
  capacity: "",
  reason: "",
}

export function AgendaAvailabilityQuickModal() {
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [savingException, setSavingException] = React.useState(false)
  const [savingResource, setSavingResource] = React.useState(false)
  const [resources, setResources] = React.useState<CalendarResource[]>([])
  const [selectedResourceId, setSelectedResourceId] = React.useState<string>("")
  const [maxDaysVisible, setMaxDaysVisible] = React.useState<string>("")
  const [exceptions, setExceptions] = React.useState<CalendarException[]>([])
  const [exceptionForm, setExceptionForm] = React.useState<ExceptionFormState>(EMPTY_EXCEPTION_FORM)
  const [rangeFrom, setRangeFrom] = React.useState(defaultFromDate())
  const [rangeTo, setRangeTo] = React.useState(defaultToDate())

  const selectedResource = React.useMemo(
    () => resources.find((item) => item.id === selectedResourceId) ?? null,
    [resources, selectedResourceId],
  )

  const resetExceptionForm = React.useCallback(() => {
    setExceptionForm(EMPTY_EXCEPTION_FORM)
  }, [])

  const loadResources = React.useCallback(async () => {
    const response = await fetch("/api/agenda/disponibilidad/resources", {
      method: "GET",
      cache: "no-store",
    })
    if (!response.ok) {
      throw new Error(await response.text())
    }
    const data = (await response.json()) as {
      items?: Array<{
        id: string
        name: string
        timezone: string
        max_days_visible: number
        is_active: boolean
      }>
      default_resource_id?: string | null
    }
    const mapped = (data.items ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      timezone: item.timezone,
      max_days_visible: Number(item.max_days_visible ?? 60),
      is_active: Boolean(item.is_active),
    }))
    setResources(mapped)

    if (!mapped.length) {
      setSelectedResourceId("")
      setMaxDaysVisible("")
      return
    }

    const preferredId =
      mapped.find((item) => item.id === data.default_resource_id)?.id ?? mapped[0]?.id ?? ""
    setSelectedResourceId((current) => {
      if (current && mapped.some((item) => item.id === current)) {
        return current
      }
      return preferredId
    })
  }, [])

  const loadExceptions = React.useCallback(async (resourceId: string) => {
    if (!resourceId) {
      setExceptions([])
      return
    }
    const params = new URLSearchParams({
      resource_id: resourceId,
      from: rangeFrom,
      to: rangeTo,
      limit: "300",
    })
    const response = await fetch(`/api/agenda/disponibilidad/exceptions?${params.toString()}`, {
      method: "GET",
      cache: "no-store",
    })
    if (!response.ok) {
      throw new Error(await response.text())
    }
    const data = (await response.json()) as {
      items?: Array<{
        id: string
        resource_id: string
        kind: "block" | "extra"
        start_at: string
        end_at: string
        capacity: number | null
        reason: string | null
      }>
    }
    setExceptions(data.items ?? [])
  }, [rangeFrom, rangeTo])

  React.useEffect(() => {
    if (!open) return
    let cancelled = false
    async function bootstrap() {
      setLoading(true)
      try {
        await loadResources()
      } catch (error) {
        if (cancelled) return
        const message = error instanceof Error ? error.message : "No se pudo cargar la disponibilidad."
        toast.error(message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    bootstrap()
    return () => {
      cancelled = true
    }
  }, [open, loadResources])

  React.useEffect(() => {
    if (!open || !selectedResourceId) return
    let cancelled = false
    async function refresh() {
      try {
        await loadExceptions(selectedResourceId)
      } catch (error) {
        if (cancelled) return
        const message = error instanceof Error ? error.message : "No se pudieron cargar excepciones."
        toast.error(message)
      }
    }
    refresh()
    return () => {
      cancelled = true
    }
  }, [open, selectedResourceId, rangeFrom, rangeTo, loadExceptions])

  React.useEffect(() => {
    if (!selectedResource) return
    setMaxDaysVisible(String(selectedResource.max_days_visible ?? DEFAULT_RANGE_DAYS))
  }, [selectedResource])

  async function handleSaveResourceSettings() {
    if (!selectedResourceId) return
    const parsed = Number(maxDaysVisible)
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 60) {
      toast.error("`max_days_visible` debe estar entre 1 y 60.")
      return
    }

    try {
      setSavingResource(true)
      const response = await fetch(`/api/agenda/disponibilidad/resources/${selectedResourceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ max_days_visible: parsed }),
      })
      if (!response.ok) {
        throw new Error(await response.text())
      }
      setResources((current) =>
        current.map((item) =>
          item.id === selectedResourceId ? { ...item, max_days_visible: parsed } : item,
        ),
      )
      toast.success("Configuración del recurso actualizada.")
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudo actualizar el recurso de agenda."
      toast.error(message)
    } finally {
      setSavingResource(false)
    }
  }

  async function handleSaveException() {
    if (!selectedResourceId) return
    if (!exceptionForm.startAt || !exceptionForm.endAt) {
      toast.error("Debes indicar inicio y fin para la excepción.")
      return
    }
    const startAtIso = toIsoFromLocalInput(exceptionForm.startAt)
    const endAtIso = toIsoFromLocalInput(exceptionForm.endAt)
    if (!startAtIso || !endAtIso) {
      toast.error("Formato de fecha/hora inválido.")
      return
    }
    if (new Date(endAtIso).getTime() <= new Date(startAtIso).getTime()) {
      toast.error("La fecha de fin debe ser posterior al inicio.")
      return
    }

    const capacityValue = exceptionForm.capacity.trim()
    const payload: Record<string, unknown> = {
      kind: exceptionForm.kind,
      start_at: startAtIso,
      end_at: endAtIso,
      reason: exceptionForm.reason.trim() || null,
    }
    if (capacityValue) {
      const parsedCapacity = Number(capacityValue)
      if (!Number.isFinite(parsedCapacity) || parsedCapacity < 0 || parsedCapacity > 200) {
        toast.error("La capacidad debe estar entre 0 y 200.")
        return
      }
      payload.capacity = parsedCapacity
    }

    try {
      setSavingException(true)
      if (exceptionForm.id) {
        const response = await fetch(
          `/api/agenda/disponibilidad/exceptions/${exceptionForm.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        )
        if (!response.ok) {
          throw new Error(await response.text())
        }
        toast.success("Excepción actualizada.")
      } else {
        const response = await fetch("/api/agenda/disponibilidad/exceptions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, resource_id: selectedResourceId }),
        })
        if (!response.ok) {
          throw new Error(await response.text())
        }
        toast.success("Excepción creada.")
      }
      resetExceptionForm()
      await loadExceptions(selectedResourceId)
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo guardar la excepción."
      toast.error(message)
    } finally {
      setSavingException(false)
    }
  }

  async function handleDeleteException(exceptionId: string) {
    if (!selectedResourceId) return
    try {
      const response = await fetch(`/api/agenda/disponibilidad/exceptions/${exceptionId}`, {
        method: "DELETE",
      })
      if (!response.ok) {
        throw new Error(await response.text())
      }
      toast.success("Excepción eliminada.")
      if (exceptionForm.id === exceptionId) {
        resetExceptionForm()
      }
      await loadExceptions(selectedResourceId)
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo eliminar la excepción."
      toast.error(message)
    }
  }

  function handleEditException(item: CalendarException) {
    setExceptionForm({
      id: item.id,
      kind: item.kind,
      startAt: toLocalDateTimeInput(item.start_at),
      endAt: toLocalDateTimeInput(item.end_at),
      capacity: item.capacity != null ? String(item.capacity) : "",
      reason: item.reason ?? "",
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          Configurar disponibilidad
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Disponibilidad de agenda</DialogTitle>
          <DialogDescription>
            Administra excepciones rápidas (`block` / `extra`) y días visibles del calendario.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="space-y-4 rounded-lg border border-border/70 p-4">
            <h3 className="text-sm font-semibold">Recurso</h3>
            <div className="space-y-2">
              <Label htmlFor="agenda-resource-id">Recurso de agenda</Label>
              <Select
                value={selectedResourceId}
                onValueChange={(value) => {
                  setSelectedResourceId(value)
                  resetExceptionForm()
                }}
                disabled={loading || resources.length === 0}
              >
                <SelectTrigger id="agenda-resource-id" className="w-full">
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

            <div className="grid gap-2">
              <Label htmlFor="agenda-max-days-visible">Días visibles del calendario público</Label>
              <div className="flex gap-2">
                <Input
                  id="agenda-max-days-visible"
                  type="number"
                  min={1}
                  max={60}
                  value={maxDaysVisible}
                  onChange={(event) => setMaxDaysVisible(event.target.value)}
                />
                <Button type="button" onClick={handleSaveResourceSettings} disabled={savingResource || !selectedResourceId}>
                  {savingResource ? "Guardando..." : "Guardar"}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label htmlFor="agenda-range-from">Desde</Label>
                <Input
                  id="agenda-range-from"
                  type="date"
                  value={rangeFrom}
                  onChange={(event) => setRangeFrom(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agenda-range-to">Hasta</Label>
                <Input
                  id="agenda-range-to"
                  type="date"
                  value={rangeTo}
                  onChange={(event) => setRangeTo(event.target.value)}
                />
              </div>
            </div>
          </section>

          <section className="space-y-4 rounded-lg border border-border/70 p-4">
            <h3 className="text-sm font-semibold">
              {exceptionForm.id ? "Editar excepción" : "Nueva excepción"}
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select
                  value={exceptionForm.kind}
                  onValueChange={(value: "block" | "extra") =>
                    setExceptionForm((current) => ({ ...current, kind: value }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="block">Bloquear rango</SelectItem>
                    <SelectItem value="extra">Horario extra</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="agenda-capacity">Capacidad (opcional)</Label>
                <Input
                  id="agenda-capacity"
                  type="number"
                  min={0}
                  max={200}
                  value={exceptionForm.capacity}
                  onChange={(event) =>
                    setExceptionForm((current) => ({ ...current, capacity: event.target.value }))
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label htmlFor="agenda-start-at">Inicio</Label>
                <Input
                  id="agenda-start-at"
                  type="datetime-local"
                  value={exceptionForm.startAt}
                  onChange={(event) =>
                    setExceptionForm((current) => ({ ...current, startAt: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agenda-end-at">Fin</Label>
                <Input
                  id="agenda-end-at"
                  type="datetime-local"
                  value={exceptionForm.endAt}
                  onChange={(event) =>
                    setExceptionForm((current) => ({ ...current, endAt: event.target.value }))
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="agenda-reason">Motivo</Label>
              <Textarea
                id="agenda-reason"
                value={exceptionForm.reason}
                onChange={(event) =>
                  setExceptionForm((current) => ({ ...current, reason: event.target.value }))
                }
                placeholder="Vacaciones, festivo, horario extraordinario, etc."
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={handleSaveException}
                disabled={savingException || !selectedResourceId}
              >
                {savingException ? "Guardando..." : exceptionForm.id ? "Guardar cambios" : "Crear excepción"}
              </Button>
              <Button type="button" variant="ghost" onClick={resetExceptionForm}>
                Limpiar formulario
              </Button>
            </div>
          </section>
        </div>

        <section className="space-y-3 rounded-lg border border-border/70 p-4">
          <h3 className="text-sm font-semibold">Excepciones registradas</h3>
          {!exceptions.length ? (
            <p className="text-sm text-muted-foreground">No hay excepciones en el rango seleccionado.</p>
          ) : (
            <div className="max-h-72 space-y-2 overflow-auto pr-1">
              {exceptions.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/70 px-3 py-2"
                >
                  <div className="space-y-1 text-sm">
                    <p className="font-medium">
                      {item.kind === "block" ? "Bloqueo" : "Horario extra"} · {formatDateRange(item.start_at, item.end_at)}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {item.reason || "Sin motivo"}
                      {item.capacity != null ? ` · Capacidad ${item.capacity}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => handleEditException(item)}>
                      Editar
                    </Button>
                    <Button type="button" variant="destructive" size="sm" onClick={() => handleDeleteException(item.id)}>
                      Eliminar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <DialogFooter>
          <Button type="button" variant="outline" asChild>
            <Link href="/agenda/disponibilidad">Abrir administrador avanzado</Link>
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function defaultFromDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function defaultToDate(): string {
  const to = new Date()
  to.setDate(to.getDate() + DEFAULT_RANGE_DAYS)
  return to.toISOString().slice(0, 10)
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

function formatDateRange(startAt: string, endAt: string): string {
  try {
    const start = new Date(startAt)
    const end = new Date(endAt)
    const formatter = new Intl.DateTimeFormat("es-MX", {
      dateStyle: "short",
      timeStyle: "short",
    })
    return `${formatter.format(start)} - ${formatter.format(end)}`
  } catch {
    return `${startAt} - ${endAt}`
  }
}
