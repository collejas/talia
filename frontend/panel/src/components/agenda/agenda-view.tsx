'use client'

import * as React from "react"
import { useRouter } from "next/navigation"

import type {
  AgendaActionResponse,
  AgendaAvailabilityResponse,
  AgendaItem,
} from "@/lib/agenda/data"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { usePermissions } from "@/hooks/use-permissions"
import { AgendaCalendar } from "@/components/agenda/agenda-calendar"
import { AgendaTable } from "@/components/agenda/agenda-table"
import { AgendaEventDrawer } from "@/components/agenda/agenda-event-drawer"
import { AgendaAvailabilityQuickModal } from "@/components/agenda/agenda-availability-quick-modal"
import { AgendaCreateBookingSheet } from "@/components/agenda/agenda-create-booking-sheet"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"

type AgendaViewProps = {
  items: AgendaItem[]
}

export function AgendaView({ items }: AgendaViewProps) {
  const router = useRouter()
  const { context: permissionContext } = usePermissions()
  const canManageAvailability =
    permissionContext.es_admin ||
    permissionContext.es_owner ||
    permissionContext.permisos.includes("agenda.manage")
  const [mode, setMode] = React.useState<"calendar" | "table">("calendar")
  const [selectedItem, setSelectedItem] = React.useState<AgendaItem | null>(null)
  const [rescheduleTarget, setRescheduleTarget] = React.useState<AgendaItem | null>(null)
  const [cancelTarget, setCancelTarget] = React.useState<AgendaItem | null>(null)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [agendaItems, setAgendaItems] = React.useState<AgendaItem[]>(items)

  React.useEffect(() => {
    setAgendaItems(items)
  }, [items])

  const handleBookingUpdate = React.useCallback(
    (updated: AgendaActionResponse["booking"], previous: AgendaItem) => {
      setAgendaItems((current) =>
        current.map((entry) =>
          entry.id === previous.id
            ? {
                ...entry,
                startAt: updated.start_at,
                endAt: updated.end_at,
                timezone: updated.timezone ?? entry.timezone,
                estado: mapBookingStatus(updated.status),
                notes: updated.notes ?? entry.notes,
                metadata: updated.metadata ?? entry.metadata,
                asunto: extractBookingSubject(updated.metadata) ?? entry.asunto,
              }
            : entry,
        ),
      )
      setSelectedItem((current) =>
        current && current.id === previous.id
          ? {
              ...current,
              startAt: updated.start_at,
              endAt: updated.end_at,
              timezone: updated.timezone ?? current.timezone,
              estado: mapBookingStatus(updated.status),
              notes: updated.notes ?? current.notes,
              metadata: updated.metadata ?? current.metadata,
              asunto: extractBookingSubject(updated.metadata) ?? current.asunto,
            }
          : current,
      )
    },
    [],
  )

  const initialCalendarDate = React.useMemo(() => {
    let earliest: number | null = null
    for (const item of agendaItems) {
      const time = Date.parse(item.startAt)
      if (Number.isNaN(time)) continue
      if (earliest === null || time < earliest) {
        earliest = time
      }
    }
    return earliest !== null ? new Date(earliest) : undefined
  }, [agendaItems])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Visualización</p>
          <p className="text-muted-foreground text-xs">
            Cambia entre el calendario semanal y la lista detallada.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={() => setCreateOpen(true)}>
            Nueva cita
          </Button>
          {canManageAvailability ? <AgendaAvailabilityQuickModal /> : null}
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background p-1">
            <ToggleButton active={mode === "calendar"} onClick={() => setMode("calendar")}>
              Calendario
            </ToggleButton>
            <ToggleButton active={mode === "table"} onClick={() => setMode("table")}>
              Lista
            </ToggleButton>
          </div>
        </div>
      </div>
      {mode === "calendar" ? (
        <AgendaCalendar
          items={agendaItems}
          onSelectItem={(item) => setSelectedItem(item)}
          initialDate={initialCalendarDate}
        />
      ) : (
        <AgendaTable items={agendaItems} />
      )}
      <AgendaEventDrawer
        open={Boolean(selectedItem)}
        onOpenChange={(open) => {
          if (!open) setSelectedItem(null)
        }}
        item={selectedItem}
        onRequestReschedule={(item) => setRescheduleTarget(item)}
        onRequestCancel={(item) => setCancelTarget(item)}
      />
      <AgendaRescheduleSheet
        target={rescheduleTarget}
        onClose={() => setRescheduleTarget(null)}
        onUpdated={(booking, previous) => handleBookingUpdate(booking, previous)}
      />
      <AgendaCancelSheet
        target={cancelTarget}
        onClose={() => setCancelTarget(null)}
        onUpdated={(booking, previous) => handleBookingUpdate(booking, previous)}
      />
      <AgendaCreateBookingSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => router.refresh()}
      />
    </div>
  )
}

function ToggleButton({
  active,
  children,
  onClick,
}: {
  active: boolean
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      variant={active ? "default" : "ghost"}
      onClick={onClick}
      className={cn(
        "rounded-full px-4 text-sm",
        active ? "shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </Button>
  )
}

function mapBookingStatus(status: string | null | undefined): string {
  const normalized = status?.toLowerCase() ?? "confirmada"
  if (normalized === "cancelled") return "cancelada"
  if (normalized === "confirmed") return "confirmada"
  return normalized
}

type AvailabilitySlot = AgendaAvailabilityResponse["availability"]["slots"][number]

function AgendaRescheduleSheet({
  target,
  onClose,
  onUpdated,
}: {
  target: AgendaItem | null
  onClose: () => void
  onUpdated: (booking: AgendaActionResponse["booking"], previous: AgendaItem) => void
}) {
  const [state, setState] = React.useState<{
    status: "idle" | "loading" | "ready" | "error"
    slots: AvailabilitySlot[]
    error?: string
  }>({ status: "idle", slots: [] })
  const [selectedSlot, setSelectedSlot] = React.useState<AvailabilitySlot | null>(null)
  const [submitting, setSubmitting] = React.useState(false)
  const open = Boolean(target)

  React.useEffect(() => {
    if (!target || !open) {
      setState({ status: "idle", slots: [] })
      setSelectedSlot(null)
      return
    }
    let aborted = false
    async function loadAvailability() {
      setState({ status: "loading", slots: [] })
      try {
        const params = new URLSearchParams()
        const timezone = target?.timezone
        if (timezone) params.set("timezone", timezone)
        const response = await fetch(`/api/agenda/availability?${params.toString()}`, {
          method: "GET",
          cache: "no-store",
        })
        if (!response.ok) {
          throw new Error(await response.text())
        }
        const data = (await response.json()) as AgendaAvailabilityResponse
        if (aborted) return
        const slots = (data.availability?.slots || []).filter((slot) => slot.is_available)
        setState({ status: "ready", slots })
      } catch (error) {
        if (aborted) return
        setState({
          status: "error",
          slots: [],
          error: error instanceof Error ? error.message : "No se pudo consultar disponibilidad.",
        })
      }
    }
    loadAvailability()
    return () => {
      aborted = true
    }
  }, [target, open])

  async function handleSubmit() {
    if (!target || !selectedSlot) return
    try {
      setSubmitting(true)
      const response = await fetch(`/api/agenda/bookings/${target.id}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startAt: selectedSlot.start_at }),
      })
      if (!response.ok) {
        throw new Error(await response.text())
      }
      const data = (await response.json()) as AgendaActionResponse
      onUpdated(data.booking, target)
      toast.success("Cita reprogramada.")
      onClose()
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo reprogramar la cita."
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(value) => !value && onClose()}>
      <SheetContent side="right" className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Reprogramar cita</SheetTitle>
          <SheetDescription>
            Selecciona un nuevo horario disponible para {target?.contactoNombre || "el contacto"}.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4">
          {state.status === "loading" ? (
            <p className="text-sm text-muted-foreground">Cargando disponibilidad…</p>
          ) : null}
          {state.status === "error" ? (
            <p className="text-destructive text-sm">{state.error}</p>
          ) : null}
          {state.status === "ready" ? (
            <div className="grid gap-2">
              {state.slots.length === 0 ? (
                <p className="text-muted-foreground text-sm">No hay horarios disponibles.</p>
              ) : (
                state.slots.map((slot) => (
                  <button
                    key={slot.slot_id}
                    type="button"
                    onClick={() => setSelectedSlot(slot)}
                    className={cn(
                      "rounded-lg border p-3 text-left text-sm transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                      selectedSlot?.slot_id === slot.slot_id
                        ? "border-primary bg-primary/5"
                        : "border-border/70 bg-background",
                    )}
                  >
                    <span className="font-medium">{slot.local_date}</span>
                    <div className="text-muted-foreground text-xs">{slot.local_time}</div>
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>
        <SheetFooter>
          <Button
            onClick={handleSubmit}
            disabled={!selectedSlot || submitting}
            className="w-full"
          >
            {submitting ? "Guardando…" : "Confirmar reprogramación"}
          </Button>
          <Button variant="ghost" className="w-full" onClick={onClose}>
            Cancelar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function AgendaCancelSheet({
  target,
  onClose,
  onUpdated,
}: {
  target: AgendaItem | null
  onClose: () => void
  onUpdated: (booking: AgendaActionResponse["booking"], previous: AgendaItem) => void
}) {
  const [reason, setReason] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const open = Boolean(target)

  React.useEffect(() => {
    if (!open) setReason("")
  }, [open])

  async function handleCancel() {
    if (!target) return
    try {
      setSubmitting(true)
      const response = await fetch(`/api/agenda/bookings/${target.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      })
      if (!response.ok) {
        throw new Error(await response.text())
      }
      const data = (await response.json()) as AgendaActionResponse
      onUpdated(data.booking, target)
      toast.success("Cita cancelada.")
      onClose()
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo cancelar la cita."
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(value) => !value && onClose()}>
      <SheetContent side="right" className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Cancelar cita</SheetTitle>
          <SheetDescription>
            Comparte un motivo opcional para notificar al contacto y registrar el cambio.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-3 px-4">
          <div className="rounded-lg border border-border/70 p-3">
            <p className="text-sm font-semibold">{target?.contactoNombre || "Sin nombre"}</p>
            <p className="text-muted-foreground text-xs">
              {target ? formatDateTime(target.startAt, target.timezone || "UTC") : ""}
            </p>
          </div>
          <Textarea
            placeholder="Motivo opcional (se incluye en el correo de cancelación)."
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
        <SheetFooter>
          <Button variant="destructive" className="w-full" onClick={handleCancel} disabled={submitting}>
            {submitting ? "Cancelando…" : "Confirmar cancelación"}
          </Button>
          <Button variant="ghost" className="w-full" onClick={onClose}>
            Mantener cita
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function formatDateTime(value: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("es-MX", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timezone,
    }).format(new Date(value))
  } catch {
    return value
  }
}

function extractBookingSubject(metadata: Record<string, unknown> | null | undefined): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null
  const candidates = [metadata.asunto, metadata.title, metadata.titulo]
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim()
    }
  }
  return null
}
