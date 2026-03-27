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
import { usePermissions } from "@/hooks/use-permissions"

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

type PreviewSlot = {
  slot_id: string
  local_date: string
  local_time: string
  is_available: boolean
  capacity: number
  booked: number
  holds: number
}

type PatternItem = {
  id: string
  resource_id: string
  weekday: number
  start_time: string
  end_time: string
  start_date: string | null
  end_date: string | null
  capacity: number
  priority: number
  is_active: boolean
}

type ExceptionForm = {
  id: string | null
  kind: "block" | "extra"
  startAt: string
  endAt: string
  capacity: string
  reason: string
}

type PatternForm = {
  id: string | null
  weekday: string
  start_time: string
  end_time: string
  start_date: string
  end_date: string
  capacity: string
  priority: string
  is_active: boolean
}

type PatternCopyForm = {
  sourcePatternId: string
  targetWeekdays: string[]
}

type SeasonTemplateKey = "normal" | "vacaciones" | "festivo"

type SeasonTemplateForm = {
  template: SeasonTemplateKey
  start_date: string
  end_date: string
}

const EMPTY_FORM: ExceptionForm = {
  id: null,
  kind: "block",
  startAt: "",
  endAt: "",
  capacity: "",
  reason: "",
}

const EMPTY_PATTERN_FORM: PatternForm = {
  id: null,
  weekday: "0",
  start_time: "09:00",
  end_time: "18:00",
  start_date: "",
  end_date: "",
  capacity: "1",
  priority: "0",
  is_active: true,
}

const EMPTY_PATTERN_COPY_FORM: PatternCopyForm = {
  sourcePatternId: "",
  targetWeekdays: [],
}

const EMPTY_SEASON_TEMPLATE_FORM: SeasonTemplateForm = {
  template: "normal",
  start_date: defaultFromDate(),
  end_date: defaultFromDate(),
}

const WEEKDAY_OPTIONS = [
  { value: "0", label: "Domingo" },
  { value: "1", label: "Lunes" },
  { value: "2", label: "Martes" },
  { value: "3", label: "Miércoles" },
  { value: "4", label: "Jueves" },
  { value: "5", label: "Viernes" },
  { value: "6", label: "Sábado" },
] as const

export function AgendaAvailabilityManager() {
  const { context: permissionContext } = usePermissions()
  const canManage =
    permissionContext.es_admin ||
    permissionContext.es_owner ||
    permissionContext.permisos.includes("agenda.manage")
  const [loading, setLoading] = React.useState(true)
  const [savingResource, setSavingResource] = React.useState(false)
  const [savingException, setSavingException] = React.useState(false)
  const [resources, setResources] = React.useState<Resource[]>([])
  const [resourceId, setResourceId] = React.useState("")
  const [form, setForm] = React.useState<ExceptionForm>(EMPTY_FORM)
  const [exceptions, setExceptions] = React.useState<ExceptionItem[]>([])
  const [patterns, setPatterns] = React.useState<PatternItem[]>([])
  const [patternForm, setPatternForm] = React.useState<PatternForm>(EMPTY_PATTERN_FORM)
  const [savingPattern, setSavingPattern] = React.useState(false)
  const [copyingPattern, setCopyingPattern] = React.useState(false)
  const [patternCopyForm, setPatternCopyForm] = React.useState<PatternCopyForm>(EMPTY_PATTERN_COPY_FORM)
  const [applyingTemplate, setApplyingTemplate] = React.useState(false)
  const [seasonTemplateForm, setSeasonTemplateForm] = React.useState<SeasonTemplateForm>(EMPTY_SEASON_TEMPLATE_FORM)
  const [previewSlots, setPreviewSlots] = React.useState<PreviewSlot[]>([])
  const [previewLoading, setPreviewLoading] = React.useState(false)
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
  const previewByDate = React.useMemo(() => {
    const grouped = new Map<string, PreviewSlot[]>()
    for (const slot of previewSlots) {
      const current = grouped.get(slot.local_date) ?? []
      current.push(slot)
      grouped.set(slot.local_date, current)
    }
    return Array.from(grouped.entries())
  }, [previewSlots])
  const weeklyPreviewDays = React.useMemo(() => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fromDate)
    if (!match) return []
    const year = Number(match[1])
    const month = Number(match[2])
    const day = Number(match[3])
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return []
    const startUtc = new Date(Date.UTC(year, month - 1, day))
    if (Number.isNaN(startUtc.getTime())) return []
    const days: Array<{ key: string; label: string; slots: PreviewSlot[] }> = []
    for (let i = 0; i < 7; i += 1) {
      const dayUtc = new Date(startUtc)
      dayUtc.setUTCDate(startUtc.getUTCDate() + i)
      const key = dayUtc.toISOString().slice(0, 10)
      const dow = dayUtc.getUTCDay()
      const label = `${weekdayLabel(dow)} ${key.slice(8, 10)}/${key.slice(5, 7)}`
      const slotsForDay = previewSlots
        .filter((slot) => slot.local_date === key)
        .sort((a, b) => a.local_time.localeCompare(b.local_time))
      days.push({ key, label, slots: slotsForDay })
    }
    return days
  }, [fromDate, previewSlots])

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

  const loadPatterns = React.useCallback(async () => {
    if (!resourceId) {
      setPatterns([])
      return
    }
    const params = new URLSearchParams({
      resource_id: resourceId,
      include_inactive: "true",
      limit: "500",
    })
    const response = await fetch(`/api/agenda/disponibilidad/patterns?${params.toString()}`, {
      method: "GET",
      cache: "no-store",
    })
    if (!response.ok) {
      throw new Error(await parseApiError(response))
    }
    const data = (await response.json()) as { items?: PatternItem[] }
    setPatterns(data.items ?? [])
  }, [resourceId])

  const loadPreview = React.useCallback(async () => {
    if (!resourceId) {
      setPreviewSlots([])
      return
    }
    const params = new URLSearchParams({
      resource_id: resourceId,
      from: fromDate,
      to: toDate,
      max_days: "60",
    })
    if (selectedResource?.timezone) {
      params.set("timezone", selectedResource.timezone)
    }
    setPreviewLoading(true)
    try {
      const response = await fetch(`/api/agenda/availability?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
      })
      if (!response.ok) {
        throw new Error(await parseApiError(response))
      }
      const data = (await response.json()) as {
        availability?: {
          slots?: PreviewSlot[]
        }
      }
      const slots = (data.availability?.slots ?? []).filter((slot) => slot.is_available)
      setPreviewSlots(slots)
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo cargar preview de slots"
      toast.error(message)
    } finally {
      setPreviewLoading(false)
    }
  }, [resourceId, fromDate, toDate, selectedResource?.timezone])

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

  React.useEffect(() => {
    let cancelled = false
    async function refreshPatterns() {
      try {
        await loadPatterns()
      } catch (error) {
        if (cancelled) return
        const message = error instanceof Error ? error.message : "No se pudieron cargar patrones"
        toast.error(message)
      }
    }
    refreshPatterns()
    return () => {
      cancelled = true
    }
  }, [loadPatterns])

  React.useEffect(() => {
    if (!patterns.length) {
      setPatternCopyForm(EMPTY_PATTERN_COPY_FORM)
      return
    }
    setPatternCopyForm((current) => {
      const sourceExists = patterns.some((item) => item.id === current.sourcePatternId)
      if (sourceExists) return current
      return {
        sourcePatternId: patterns[0]?.id ?? "",
        targetWeekdays: [],
      }
    })
  }, [patterns])

  React.useEffect(() => {
    let cancelled = false
    async function refreshPreview() {
      if (cancelled) return
      await loadPreview()
    }
    refreshPreview()
    return () => {
      cancelled = true
    }
  }, [loadPreview])

  function resetForm() {
    setForm(EMPTY_FORM)
  }

  function resetPatternForm() {
    setPatternForm(EMPTY_PATTERN_FORM)
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

  function startEditPattern(item: PatternItem) {
    setPatternForm({
      id: item.id,
      weekday: String(item.weekday),
      start_time: item.start_time.slice(0, 5),
      end_time: item.end_time.slice(0, 5),
      start_date: item.start_date ?? "",
      end_date: item.end_date ?? "",
      capacity: String(item.capacity),
      priority: String(item.priority),
      is_active: Boolean(item.is_active),
    })
  }

  async function savePattern() {
    if (!resourceId) return
    const weekday = Number(patternForm.weekday)
    const capacity = Number(patternForm.capacity)
    const priority = Number(patternForm.priority)
    if (!Number.isFinite(weekday) || weekday < 0 || weekday > 6) {
      toast.error("weekday inválido.")
      return
    }
    if (!patternForm.start_time || !patternForm.end_time) {
      toast.error("Horario de inicio y fin es obligatorio.")
      return
    }
    if (patternForm.end_time <= patternForm.start_time) {
      toast.error("Hora fin debe ser mayor a hora inicio.")
      return
    }
    if (!Number.isFinite(capacity) || capacity < 1 || capacity > 200) {
      toast.error("Capacidad inválida.")
      return
    }
    if (!Number.isFinite(priority) || priority < -100 || priority > 100) {
      toast.error("Priority inválido.")
      return
    }

    const payload: Record<string, unknown> = {
      weekday,
      start_time: patternForm.start_time,
      end_time: patternForm.end_time,
      start_date: patternForm.start_date || null,
      end_date: patternForm.end_date || null,
      capacity,
      priority,
      is_active: patternForm.is_active,
    }

    try {
      setSavingPattern(true)
      if (patternForm.id) {
        const response = await fetch(`/api/agenda/disponibilidad/patterns/${patternForm.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        if (!response.ok) {
          throw new Error(await parseApiError(response))
        }
        toast.success("Patrón actualizado.")
      } else {
        const response = await fetch("/api/agenda/disponibilidad/patterns", {
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
        toast.success("Patrón creado.")
      }
      resetPatternForm()
      await loadPatterns()
      await loadPreview()
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo guardar el patrón"
      toast.error(message)
    } finally {
      setSavingPattern(false)
    }
  }

  async function deletePattern(patternId: string) {
    try {
      const response = await fetch(`/api/agenda/disponibilidad/patterns/${patternId}`, {
        method: "DELETE",
      })
      if (!response.ok) {
        throw new Error(await parseApiError(response))
      }
      if (patternForm.id === patternId) {
        resetPatternForm()
      }
      toast.success("Patrón eliminado.")
      await loadPatterns()
      await loadPreview()
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo eliminar el patrón"
      toast.error(message)
    }
  }

  async function copyPatternToWeekdays() {
    if (!resourceId) return
    const source = patterns.find((item) => item.id === patternCopyForm.sourcePatternId)
    if (!source) {
      toast.error("Selecciona un patrón origen válido.")
      return
    }
    const uniqueTargets = Array.from(new Set(patternCopyForm.targetWeekdays))
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value >= 0 && value <= 6 && value !== source.weekday)
    if (!uniqueTargets.length) {
      toast.error("Selecciona al menos un día destino distinto al origen.")
      return
    }

    const basePayload = {
      resource_id: resourceId,
      start_time: source.start_time.slice(0, 5),
      end_time: source.end_time.slice(0, 5),
      start_date: source.start_date,
      end_date: source.end_date,
      capacity: source.capacity,
      priority: source.priority,
      is_active: source.is_active,
    }

    setCopyingPattern(true)
    try {
      const outcomes = await Promise.all(
        uniqueTargets.map(async (weekday) => {
          const response = await fetch("/api/agenda/disponibilidad/patterns", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...basePayload,
              weekday,
            }),
          })
          if (response.ok) {
            return { weekday, ok: true as const, error: "" }
          }
          const errorMessage = await parseApiError(response)
          return { weekday, ok: false as const, error: errorMessage }
        }),
      )

      const successCount = outcomes.filter((item) => item.ok).length
      const conflictCount = outcomes.filter(
        (item) => !item.ok && item.error.includes("pattern_overlap_conflict"),
      ).length
      const failed = outcomes.filter((item) => !item.ok && !item.error.includes("pattern_overlap_conflict"))

      if (successCount > 0) {
        toast.success(`Se copiaron ${successCount} patrón(es).`)
      }
      if (conflictCount > 0) {
        toast.warning(`${conflictCount} día(s) omitidos por solape existente.`)
      }
      if (failed.length > 0) {
        toast.error(`Fallaron ${failed.length} copia(s).`)
      }

      await loadPatterns()
      await loadPreview()
    } finally {
      setCopyingPattern(false)
    }
  }

  async function applySeasonTemplate() {
    if (!resourceId) return
    const startDate = seasonTemplateForm.start_date
    const endDate = seasonTemplateForm.end_date || seasonTemplateForm.start_date
    if (!startDate) {
      toast.error("Selecciona fecha de inicio para la plantilla.")
      return
    }
    if (endDate < startDate) {
      toast.error("La fecha fin no puede ser menor a la fecha inicio.")
      return
    }

    setApplyingTemplate(true)
    try {
      if (seasonTemplateForm.template === "normal") {
        const defaults = [
          { weekday: 1, start_time: "09:00", end_time: "18:00" },
          { weekday: 2, start_time: "09:00", end_time: "18:00" },
          { weekday: 3, start_time: "09:00", end_time: "18:00" },
          { weekday: 4, start_time: "09:00", end_time: "18:00" },
          { weekday: 5, start_time: "09:00", end_time: "18:00" },
          { weekday: 6, start_time: "09:00", end_time: "13:00" },
        ]
        // Reemplaza patrones actuales por plantilla estándar.
        await Promise.all(
          patterns.map((item) =>
            fetch(`/api/agenda/disponibilidad/patterns/${item.id}`, {
              method: "DELETE",
            }),
          ),
        )
        await Promise.all(
          defaults.map((pattern) =>
            fetch("/api/agenda/disponibilidad/patterns", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                resource_id: resourceId,
                weekday: pattern.weekday,
                start_time: pattern.start_time,
                end_time: pattern.end_time,
                capacity: 1,
                priority: 0,
                is_active: true,
              }),
            }),
          ),
        )
        toast.success("Plantilla 'Horario normal' aplicada.")
      } else {
        const startIso = `${startDate}T00:00:00.000Z`
        const endBase = seasonTemplateForm.template === "festivo" ? startDate : endDate
        const endPlusOne = new Date(`${endBase}T00:00:00.000Z`)
        endPlusOne.setUTCDate(endPlusOne.getUTCDate() + 1)
        const endIso = endPlusOne.toISOString()
        const reason =
          seasonTemplateForm.template === "festivo"
            ? "Festivo (plantilla)"
            : "Vacaciones (plantilla)"
        const response = await fetch("/api/agenda/disponibilidad/exceptions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            resource_id: resourceId,
            kind: "block",
            start_at: startIso,
            end_at: endIso,
            reason,
            capacity: 0,
          }),
        })
        if (!response.ok) {
          throw new Error(await parseApiError(response))
        }
        toast.success(`Plantilla '${seasonTemplateForm.template}' aplicada.`)
      }

      await loadPatterns()
      await loadExceptions()
      await loadPreview()
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo aplicar la plantilla"
      toast.error(message)
    } finally {
      setApplyingTemplate(false)
    }
  }

  return (
    <div className="space-y-4">
      {!canManage ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              Tienes acceso de lectura. Para crear/editar/eliminar disponibilidad se requiere `agenda.manage`.
            </p>
          </CardContent>
        </Card>
      ) : null}
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
              <Button type="button" onClick={saveResource} disabled={!canManage || savingResource || !resourceId}>
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

      <Card>
        <CardHeader>
          <CardTitle>Plantillas de temporada</CardTitle>
          <CardDescription>Aplica configuraciones rápidas: normal, vacaciones y festivos.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div className="space-y-2">
            <Label>Plantilla</Label>
            <Select
              value={seasonTemplateForm.template}
              onValueChange={(value) =>
                setSeasonTemplateForm((current) => ({ ...current, template: value as SeasonTemplateKey }))
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Horario normal</SelectItem>
                <SelectItem value="vacaciones">Vacaciones</SelectItem>
                <SelectItem value="festivo">Festivo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Fecha inicio</Label>
            <Input
              type="date"
              value={seasonTemplateForm.start_date}
              onChange={(event) =>
                setSeasonTemplateForm((current) => ({ ...current, start_date: event.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Fecha fin</Label>
            <Input
              type="date"
              value={seasonTemplateForm.end_date}
              onChange={(event) =>
                setSeasonTemplateForm((current) => ({ ...current, end_date: event.target.value }))
              }
              disabled={seasonTemplateForm.template === "festivo"}
            />
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={applySeasonTemplate}
              disabled={!canManage || applyingTemplate || !resourceId}
            >
              {applyingTemplate ? "Aplicando..." : "Aplicar plantilla"}
            </Button>
          </div>
        </CardContent>
      </Card>

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
              <Button type="button" onClick={saveException} disabled={!canManage || savingException || !resourceId}>
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
                      <Button type="button" size="sm" variant="outline" onClick={() => startEdit(item)} disabled={!canManage}>
                        Editar
                      </Button>
                      <Button type="button" size="sm" variant="destructive" onClick={() => deleteException(item.id)} disabled={!canManage}>
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

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{patternForm.id ? "Editar patrón semanal" : "Crear patrón semanal"}</CardTitle>
            <CardDescription>Define disponibilidad recurrente por día de semana.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Día</Label>
                <Select
                  value={patternForm.weekday}
                  onValueChange={(value) =>
                    setPatternForm((current) => ({ ...current, weekday: value }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WEEKDAY_OPTIONS.map((day) => (
                      <SelectItem key={day.value} value={day.value}>
                        {day.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Capacidad</Label>
                <Input
                  type="number"
                  min={1}
                  max={200}
                  value={patternForm.capacity}
                  onChange={(event) =>
                    setPatternForm((current) => ({ ...current, capacity: event.target.value }))
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Hora inicio</Label>
                <Input
                  type="time"
                  value={patternForm.start_time}
                  onChange={(event) =>
                    setPatternForm((current) => ({ ...current, start_time: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Hora fin</Label>
                <Input
                  type="time"
                  value={patternForm.end_time}
                  onChange={(event) =>
                    setPatternForm((current) => ({ ...current, end_time: event.target.value }))
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Vigencia inicio (opcional)</Label>
                <Input
                  type="date"
                  value={patternForm.start_date}
                  onChange={(event) =>
                    setPatternForm((current) => ({ ...current, start_date: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Vigencia fin (opcional)</Label>
                <Input
                  type="date"
                  value={patternForm.end_date}
                  onChange={(event) =>
                    setPatternForm((current) => ({ ...current, end_date: event.target.value }))
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Priority</Label>
                <Input
                  type="number"
                  min={-100}
                  max={100}
                  value={patternForm.priority}
                  onChange={(event) =>
                    setPatternForm((current) => ({ ...current, priority: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Estatus</Label>
                <Select
                  value={patternForm.is_active ? "active" : "inactive"}
                  onValueChange={(value) =>
                    setPatternForm((current) => ({ ...current, is_active: value === "active" }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Activo</SelectItem>
                    <SelectItem value="inactive">Inactivo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="button" onClick={savePattern} disabled={!canManage || savingPattern || !resourceId}>
                {savingPattern ? "Guardando..." : patternForm.id ? "Guardar cambios" : "Crear patrón"}
              </Button>
              <Button type="button" variant="ghost" onClick={resetPatternForm}>
                Limpiar
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Patrones ({patterns.length})</CardTitle>
            <CardDescription>Disponibilidad recurrente configurada para el recurso.</CardDescription>
          </CardHeader>
          <CardContent>
            {patterns.length > 0 ? (
              <div className="mb-4 space-y-3 rounded-md border border-border/70 p-3">
                <p className="text-sm font-medium">Copiar patrón a múltiples días</p>
                <div className="space-y-2">
                  <Label>Patrón origen</Label>
                  <Select
                    value={patternCopyForm.sourcePatternId}
                    onValueChange={(value) =>
                      setPatternCopyForm((current) => ({ ...current, sourcePatternId: value }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecciona patrón origen" />
                    </SelectTrigger>
                    <SelectContent>
                      {patterns.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {weekdayLabel(item.weekday)} · {item.start_time.slice(0, 5)}-{item.end_time.slice(0, 5)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Días destino</Label>
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                    {WEEKDAY_OPTIONS.map((day) => {
                      const checked = patternCopyForm.targetWeekdays.includes(day.value)
                      return (
                        <label
                          key={day.value}
                          className="flex items-center gap-2 rounded-md border border-border/70 px-2 py-1 text-xs"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) =>
                              setPatternCopyForm((current) => {
                                const next = new Set(current.targetWeekdays)
                                if (event.target.checked) next.add(day.value)
                                else next.delete(day.value)
                                return { ...current, targetWeekdays: Array.from(next) }
                              })
                            }
                          />
                          <span>{day.label}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
                <Button type="button" variant="outline" onClick={copyPatternToWeekdays} disabled={!canManage || copyingPattern}>
                  {copyingPattern ? "Copiando..." : "Copiar a días seleccionados"}
                </Button>
              </div>
            ) : null}
            {!patterns.length ? (
              <p className="text-sm text-muted-foreground">No hay patrones configurados.</p>
            ) : (
              <div className="max-h-[26rem] space-y-2 overflow-auto pr-1">
                {patterns.map((item) => (
                  <div key={item.id} className="rounded-md border border-border/70 p-3">
                    <p className="text-sm font-medium">
                      {weekdayLabel(item.weekday)} · {item.start_time.slice(0, 5)}-{item.end_time.slice(0, 5)}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      Capacidad {item.capacity} · Priority {item.priority} · {item.is_active ? "Activo" : "Inactivo"}
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      Vigencia: {item.start_date || "sin inicio"} a {item.end_date || "sin fin"}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => startEditPattern(item)} disabled={!canManage}>
                        Editar
                      </Button>
                      <Button type="button" size="sm" variant="destructive" onClick={() => deletePattern(item.id)} disabled={!canManage}>
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

      <Card>
        <CardHeader>
          <CardTitle>Preview de slots ({previewSlots.length})</CardTitle>
          <CardDescription>
            Slots disponibles reales según recurso + excepciones en el rango filtrado.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Button type="button" variant="outline" onClick={loadPreview} disabled={previewLoading || !resourceId}>
              {previewLoading ? "Actualizando..." : "Actualizar preview"}
            </Button>
          </div>
          {!previewByDate.length ? (
            <p className="text-sm text-muted-foreground">No hay slots disponibles en este rango.</p>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Vista semanal (7 días desde “Desde”)</p>
                <div className="grid gap-2 md:grid-cols-7">
                  {weeklyPreviewDays.map((day) => (
                    <div key={day.key} className="min-h-[120px] rounded-md border border-border/70 p-2">
                      <p className="text-xs font-medium">{day.label}</p>
                      {!day.slots.length ? (
                        <p className="mt-2 text-[11px] text-muted-foreground">Sin horarios</p>
                      ) : (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {day.slots.slice(0, 8).map((slot) => (
                            <span
                              key={slot.slot_id}
                              className="inline-flex items-center rounded border border-border/60 px-1.5 py-0.5 text-[11px]"
                            >
                              {slot.local_time}
                            </span>
                          ))}
                          {day.slots.length > 8 ? (
                            <span className="text-[11px] text-muted-foreground">
                              +{day.slots.length - 8} más
                            </span>
                          ) : null}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div className="max-h-[26rem] space-y-3 overflow-auto pr-1">
                {previewByDate.map(([date, slots]) => (
                  <div key={date} className="rounded-md border border-border/70 p-3">
                    <p className="text-sm font-medium">{date}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {slots.map((slot) => (
                        <span
                          key={slot.slot_id}
                          className="inline-flex items-center rounded-md border border-border/60 px-2 py-1 text-xs"
                        >
                          {slot.local_time}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
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

function weekdayLabel(weekday: number): string {
  return WEEKDAY_OPTIONS.find((day) => Number(day.value) === weekday)?.label ?? `Día ${weekday}`
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
