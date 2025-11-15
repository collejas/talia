'use client'

import { useMemo, useState } from "react"

import { AgendaItem } from "@/lib/agenda/data"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

const MS_PER_DAY = 24 * 60 * 60 * 1000

type AgendaCalendarProps = {
  items: AgendaItem[]
  onSelectItem?: (item: AgendaItem) => void
}

export function AgendaCalendar({ items, onSelectItem }: AgendaCalendarProps) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))
  }, [weekStart])

  const eventsByDay = useMemo(() => {
    const map = new Map<number, AgendaItem[]>()
    for (const day of days) {
      map.set(day.getTime(), [])
    }
    for (const item of items) {
      const start = new Date(item.startAt)
      const dayKey = startOfDay(start).getTime()
      if (!map.has(dayKey)) {
        continue
      }
      map.get(dayKey)?.push(item)
    }
    for (const list of map.values()) {
      list.sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))
    }
    return map
  }, [items, days])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button size="icon" variant="outline" onClick={() => setWeekStart(addDays(weekStart, -7))}>
            ←
          </Button>
          <Button size="icon" variant="outline" onClick={() => setWeekStart(startOfWeek(new Date()))}>
            •
          </Button>
          <Button size="icon" variant="outline" onClick={() => setWeekStart(addDays(weekStart, 7))}>
            →
          </Button>
        </div>
        <div className="text-muted-foreground text-sm">
          Semana del {formatDateLabel(weekStart)} al {formatDateLabel(addDays(weekStart, 6))}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
        {days.map((day) => {
          const key = startOfDay(day).getTime()
          const dayEvents = eventsByDay.get(key) ?? []
          return (
            <div
              key={day.toISOString()}
              className="rounded-xl border border-border/60 bg-card p-3 shadow-sm"
            >
              <div className="mb-2 flex items-baseline justify-between">
                <div className="text-sm font-medium">{formatDayLabel(day)}</div>
                <div className="text-muted-foreground text-xs">
                  {dayEvents.length} cita{dayEvents.length === 1 ? "" : "s"}
                </div>
              </div>
              <div className="space-y-2">
                {dayEvents.length === 0 ? (
                  <p className="text-muted-foreground text-xs">Sin eventos</p>
                ) : (
                  dayEvents.map((event) => (
                    <CalendarEventCard
                      key={event.id}
                      item={event}
                      onClick={() => onSelectItem?.(event)}
                    />
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CalendarEventCard({ item, onClick }: { item: AgendaItem; onClick?: () => void }) {
  const timezone = item.timezone || "UTC"
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-border/60 bg-background p-2 text-left text-xs shadow-sm transition hover:border-primary hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">{item.contactoNombre || "Sin nombre"}</span>
        <Badge variant={resolveEstadoVariant(item.estado)} className="text-[10px] uppercase">
          {item.estado}
        </Badge>
      </div>
      <div className="text-muted-foreground">
        {formatTimeLabel(item.startAt, timezone)}
        {item.endAt ? ` – ${formatTimeLabel(item.endAt, timezone)}` : null}
      </div>
      {item.asignadoNombre ? (
        <div className="text-muted-foreground mt-1">Responsable: {item.asignadoNombre}</div>
      ) : null}
      {item.canal ? (
        <div className="text-muted-foreground mt-1 capitalize">Canal: {item.canal}</div>
      ) : null}
      {item.notes ? <p className="mt-1 line-clamp-2 text-muted-foreground">{item.notes}</p> : null}
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

function startOfDay(date: Date): Date {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  return result
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY)
}

function formatDayLabel(date: Date): string {
  return new Intl.DateTimeFormat("es-MX", { weekday: "short", day: "numeric", month: "short" })
    .format(date)
    .replace(".", "")
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
