'use client'

import { useMemo, useState } from "react"

import { AgendaItem } from "@/lib/agenda/data"
import { getAgendaItemTitle } from "@/lib/agenda/title"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

const HOURS = Array.from({ length: 17 }, (_, index) => index + 6) // 06:00 a 22:00
const HOUR_HEIGHT = 72
const MIN_EVENT_HEIGHT = 56
const MS_PER_DAY = 24 * 60 * 60 * 1000

type AgendaCalendarProps = {
  items: AgendaItem[]
  onSelectItem?: (item: AgendaItem) => void
  initialDate?: Date
}

export function AgendaCalendar({ items, onSelectItem, initialDate }: AgendaCalendarProps) {
  const baseWeek = useMemo(() => startOfWeek(initialDate ?? new Date()), [initialDate])
  const [weekOffset, setWeekOffset] = useState(0)
  const weekStart = useMemo(() => addDays(baseWeek, weekOffset * 7), [baseWeek, weekOffset])

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)),
    [weekStart],
  )

  const eventsByDay = useMemo(() => {
    const map = new Map<number, AgendaItem[]>()
    for (const day of days) {
      map.set(dayKey(day), [])
    }
    for (const item of items) {
      const start = new Date(item.startAt)
      if (Number.isNaN(start.getTime())) continue
      const key = dayKey(start)
      if (!map.has(key)) continue
      map.get(key)?.push(item)
    }
    for (const list of map.values()) {
      list.sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))
    }
    return map
  }, [days, items])

  const timelineHeight = HOURS.length * HOUR_HEIGHT

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button size="icon" variant="outline" onClick={() => setWeekOffset((prev) => prev - 1)}>
            ←
          </Button>
          <Button
            size="icon"
            variant="outline"
            onClick={() => {
              const todayWeek = startOfWeek(new Date())
              const diffWeeks = Math.round(
                (todayWeek.getTime() - baseWeek.getTime()) / (7 * MS_PER_DAY),
              )
              setWeekOffset(diffWeeks)
            }}
            title="Ir a esta semana"
          >
            ●
          </Button>
          <Button size="icon" variant="outline" onClick={() => setWeekOffset((prev) => prev + 1)}>
            →
          </Button>
        </div>
        <div className="text-muted-foreground text-sm">
          Semana del {formatDateLabel(weekStart)} al {formatDateLabel(addDays(weekStart, 6))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[1120px] overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
          <div className="grid grid-cols-[88px_repeat(7,minmax(140px,1fr))] border-b border-border/60 bg-muted/30">
            <div className="px-3 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Hora
            </div>
            {days.map((day) => {
              const events = eventsByDay.get(dayKey(day)) ?? []
              return (
                <div key={day.toISOString()} className="border-l border-border/60 px-3 py-3">
                  <div className="text-sm font-semibold capitalize">{formatDayLabel(day)}</div>
                  <div className="text-muted-foreground text-xs">{formatDateLabel(day)}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {events.length} cita{events.length === 1 ? "" : "s"}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="grid grid-cols-[88px_repeat(7,minmax(140px,1fr))]">
            <div
              className="relative border-r border-border/60 bg-muted/20"
              style={{ height: timelineHeight }}
            >
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className="absolute left-0 right-0 -translate-y-1/2 px-3 text-right text-xs text-muted-foreground"
                  style={{ top: (hour - HOURS[0]) * HOUR_HEIGHT }}
                >
                  {formatHourLabel(hour)}
                </div>
              ))}
              {HOURS.map((hour) => (
                <div
                  key={`${hour}-line`}
                  className="absolute left-0 right-0 border-t border-border/60"
                  style={{ top: (hour - HOURS[0]) * HOUR_HEIGHT }}
                />
              ))}
            </div>

            {days.map((day) => {
              const dayEvents = eventsByDay.get(dayKey(day)) ?? []
              return (
                <DayColumn
                  key={day.toISOString()}
                  day={day}
                  events={dayEvents}
                  onSelectItem={onSelectItem}
                  height={timelineHeight}
                />
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function DayColumn({
  day,
  events,
  onSelectItem,
  height,
}: {
  day: Date
  events: AgendaItem[]
  onSelectItem?: (item: AgendaItem) => void
  height: number
}) {
  return (
    <div
      className="relative border-l border-border/60"
      style={{
        height,
        backgroundImage:
          "repeating-linear-gradient(to bottom, rgba(148, 163, 184, 0.12) 0, rgba(148, 163, 184, 0.12) 1px, transparent 1px, transparent 72px)",
      }}
    >
      <div className="absolute inset-0">
        {events.map((event) => (
          <CalendarEventBlock
            key={event.id}
            item={event}
            onClick={() => onSelectItem?.(event)}
          />
        ))}
      </div>
      <div className="pointer-events-none absolute left-3 top-2 text-[10px] uppercase tracking-wide text-muted-foreground/70">
        {formatCompactDayLabel(day)}
      </div>
    </div>
  )
}

function CalendarEventBlock({ item, onClick }: { item: AgendaItem; onClick?: () => void }) {
  const timezone = item.timezone || "UTC"
  const start = new Date(item.startAt)
  const end = item.endAt ? new Date(item.endAt) : addMinutes(start, 45)
  const startMinutes = minutesFromStartOfDay(start)
  const endMinutes = Math.max(minutesFromStartOfDay(end), startMinutes + 30)
  const displayTitle = getAgendaItemTitle(item)
  const timelineStart = HOURS[0] * 60
  const timelineEnd = (HOURS[HOURS.length - 1] + 1) * 60
  const visibleStart = Math.max(startMinutes, timelineStart)
  const visibleEnd = Math.min(endMinutes, timelineEnd)

  if (visibleEnd <= visibleStart) {
    return null
  }

  const top = ((visibleStart - timelineStart) / 60) * HOUR_HEIGHT + 8
  const height = Math.max(((visibleEnd - visibleStart) / 60) * HOUR_HEIGHT - 4, MIN_EVENT_HEIGHT)

  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute left-2 right-2 overflow-hidden rounded-xl border border-primary/20 bg-background/95 px-3 py-2 text-left shadow-sm transition hover:border-primary hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      style={{
        top,
        height,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{displayTitle}</div>
          <div className="text-muted-foreground text-xs">
            {formatTimeLabel(item.startAt, timezone)}
            {item.endAt ? ` – ${formatTimeLabel(item.endAt, timezone)}` : null}
          </div>
        </div>
        <Badge variant={resolveEstadoVariant(item.estado)} className="shrink-0 text-[10px] uppercase">
          {item.estado}
        </Badge>
      </div>
      {item.contactoNombre ? (
        <div className="mt-2 truncate text-xs text-muted-foreground">{item.contactoNombre}</div>
      ) : null}
      {item.asignadoNombre ? (
        <div className="truncate text-xs text-muted-foreground">Responsable: {item.asignadoNombre}</div>
      ) : null}
      {item.canal ? (
        <div className="truncate text-xs text-muted-foreground capitalize">Canal: {item.canal}</div>
      ) : null}
    </button>
  )
}

function resolveEstadoVariant(
  estado: string,
): "default" | "secondary" | "destructive" | "outline" {
  const normalized = estado?.toLowerCase() ?? "pendiente"
  if (normalized === "cancelada") return "destructive"
  if (normalized === "confirmada") return "default"
  if (normalized === "reprogramada" || normalized === "pendiente") return "secondary"
  return "outline"
}

function startOfWeek(date: Date): Date {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  const day = result.getDay() || 7
  result.setDate(result.getDate() - (day - 1))
  return result
}

function dayKey(date: Date): number {
  return startOfDay(date).getTime()
}

function startOfDay(date: Date): Date {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  return result
}

function minutesFromStartOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes()
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY)
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000)
}

function formatDayLabel(date: Date): string {
  return new Intl.DateTimeFormat("es-MX", { weekday: "short", day: "numeric", month: "short" })
    .format(date)
    .replace(".", "")
}

function formatCompactDayLabel(date: Date): string {
  return new Intl.DateTimeFormat("es-MX", { weekday: "short" }).format(date).replace(".", "")
}

function formatDateLabel(date: Date): string {
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
    .format(date)
    .replace(".", "")
}

function formatHourLabel(hour: number): string {
  return new Intl.DateTimeFormat("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(2020, 0, 1, hour, 0, 0))
}

function formatTimeLabel(value: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("es-MX", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone,
    }).format(new Date(value))
  } catch {
    return value
  }
}
