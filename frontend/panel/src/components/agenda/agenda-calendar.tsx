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
const TIMELINE_PADDING = 24
type AgendaCalendarProps = {
  items: AgendaItem[]
  onSelectDay?: (day: Date, events: AgendaItem[]) => void
  referenceDateIso?: string
}

export function AgendaCalendar({ items, onSelectDay, referenceDateIso }: AgendaCalendarProps) {
  const referenceDate = useMemo(
    () => parseReferenceDate(referenceDateIso),
    [referenceDateIso],
  )
  const baseMonth = useMemo(() => startOfMonthUTC(referenceDate), [referenceDate])
  const [monthOffset, setMonthOffset] = useState(0)
  const visibleMonth = useMemo(
    () => addMonthsUTC(baseMonth, monthOffset),
    [baseMonth, monthOffset],
  )
  const [selectedDay, setSelectedDay] = useState<Date>(() => startOfDayUTC(referenceDate))

  const monthStart = startOfMonthUTC(visibleMonth)
  const gridStart = startOfWeekUTC(monthStart)
  const days = useMemo(
    () => Array.from({ length: 42 }, (_, index) => addDaysUTC(gridStart, index)),
    [gridStart],
  )

  const eventsByDay = useMemo(() => {
    const map = new Map<number, AgendaItem[]>()
    for (const item of items) {
      const start = new Date(item.startAt)
      if (Number.isNaN(start.getTime())) continue
      const key = dayKeyUTC(start)
      if (!map.has(key)) map.set(key, [])
      map.get(key)?.push(item)
    }
    for (const list of map.values()) {
      list.sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))
    }
    return map
  }, [items])

  const displayedSelectedDay = useMemo(() => {
    if (isSameMonthUTC(selectedDay, visibleMonth)) {
      return selectedDay
    }
    return startOfDayUTC(visibleMonth)
  }, [selectedDay, visibleMonth])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button size="icon" variant="outline" onClick={() => setMonthOffset((prev) => prev - 1)}>
            ←
          </Button>
          <Button
            size="icon"
            variant="outline"
            onClick={() => {
              const todayMonth = startOfMonthUTC(referenceDate)
              const diffMonths =
                (todayMonth.getUTCFullYear() - baseMonth.getUTCFullYear()) * 12 +
                (todayMonth.getUTCMonth() - baseMonth.getUTCMonth())
              setMonthOffset(diffMonths)
              setSelectedDay(startOfDayUTC(referenceDate))
            }}
            title="Ir a este mes"
          >
            ●
          </Button>
          <Button size="icon" variant="outline" onClick={() => setMonthOffset((prev) => prev + 1)}>
            →
          </Button>
        </div>
        <div className="text-muted-foreground text-sm">{formatMonthLabelUTC(visibleMonth)}</div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
        <div className="grid grid-cols-7 border-b border-border/60 bg-muted/30">
          {WEEKDAY_LABELS.map((label) => (
            <div
              key={label}
              className="px-2 py-2 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs"
            >
              {label}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {days.map((day) => {
            const events = eventsByDay.get(dayKeyUTC(day)) ?? []
            const currentMonth = isSameMonthUTC(day, visibleMonth)
            const isSelected = isSameDayUTC(day, displayedSelectedDay)
            const isToday = isSameDayUTC(day, referenceDate)
            return (
              <button
                type="button"
                key={day.toISOString()}
                className={cn(
                  "min-h-[110px] border-t border-r border-border/60 p-2 text-left transition hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  !currentMonth && "bg-muted/15 text-muted-foreground",
                  isSelected && "bg-primary/5 ring-1 ring-inset ring-primary",
                  isToday && "outline outline-1 outline-primary/30 outline-offset-[-1px]",
                )}
                onClick={() => {
                  setSelectedDay(day)
                  onSelectDay?.(day, events)
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium",
                      isToday && "bg-primary text-primary-foreground",
                      isSelected && !isToday && "bg-primary/10 text-primary",
                    )}
                  >
                    {day.getUTCDate()}
                  </div>
                  {events.length > 0 ? (
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      {events.length} cita{events.length === 1 ? "" : "s"}
                    </Badge>
                  ) : null}
                </div>
                <div className="mt-2 space-y-1">
                  {events.slice(0, 2).map((event) => (
                    <div
                      key={event.id}
                      className="truncate rounded-md bg-background/90 px-2 py-1 text-[11px] text-foreground shadow-sm"
                    >
                      {getAgendaItemTitle(event)}
                    </div>
                  ))}
                  {events.length > 2 ? (
                    <div className="text-[11px] text-muted-foreground">
                      +{events.length - 2} más
                    </div>
                  ) : null}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function AgendaDayTimeline({
  day,
  events,
  onSelectItem,
}: {
  day: Date
  events: AgendaItem[]
  onSelectItem?: (item: AgendaItem) => void
}) {
  return (
    <div className="space-y-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">{formatLongDayLabelUTC(day)}</div>
          <div className="text-muted-foreground text-xs">
            {events.length} cita{events.length === 1 ? "" : "s"} en este día
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[80px_minmax(0,1fr)] gap-0 overflow-hidden rounded-xl border border-border/60">
        <div
          className="relative border-r border-border/60 bg-muted/20"
          style={{ height: timelineHeight() + TIMELINE_PADDING * 3 }}
        >
          {HOURS.map((hour) => (
            <div
              key={hour}
              className="absolute left-0 right-0 -translate-y-1/2 px-3 text-right text-xs leading-none text-muted-foreground"
              style={{ top: TIMELINE_PADDING + (hour - HOURS[0]) * HOUR_HEIGHT }}
            >
              {formatHourLabel(hour)}
            </div>
          ))}
          {HOURS.map((hour) => (
            <div
              key={`${hour}-line`}
              className="absolute left-0 right-0 border-t border-border/60"
              style={{ top: TIMELINE_PADDING + (hour - HOURS[0]) * HOUR_HEIGHT }}
            />
          ))}
        </div>

        <div
          className="relative"
          style={{
            height: timelineHeight() + TIMELINE_PADDING * 3,
            backgroundImage:
              "repeating-linear-gradient(to bottom, rgba(148, 163, 184, 0.12) 0, rgba(148, 163, 184, 0.12) 1px, transparent 1px, transparent 72px)",
          }}
        >
          {events.length === 0 ? (
            <div className="flex h-full items-center justify-center px-4 text-sm text-muted-foreground">
              No hay citas para este día
            </div>
          ) : (
            events.map((event) => (
              <CalendarEventBlock
                key={event.id}
                item={event}
                onClick={() => onSelectItem?.(event)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function CalendarEventBlock({ item, onClick }: { item: AgendaItem; onClick?: () => void }) {
  const timezone = item.timezone || "UTC"
  const start = new Date(item.startAt)
  const end = item.endAt ? new Date(item.endAt) : addMinutesUTC(start, 45)
  const startMinutes = minutesFromStartOfDayInTimeZone(start, timezone)
  const endMinutes = Math.max(minutesFromStartOfDayInTimeZone(end, timezone), startMinutes + 30)
  const displayTitle = getAgendaItemTitle(item)
  const timelineStart = HOURS[0] * 60
  const timelineEnd = (HOURS[HOURS.length - 1] + 1) * 60
  const visibleStart = Math.max(startMinutes, timelineStart)
  const visibleEnd = Math.min(endMinutes, timelineEnd)

  if (visibleEnd <= visibleStart) {
    return null
  }

  const top = TIMELINE_PADDING + ((visibleStart - timelineStart) / 60) * HOUR_HEIGHT + 8
  const height = Math.max(((visibleEnd - visibleStart) / 60) * HOUR_HEIGHT - 4, MIN_EVENT_HEIGHT)

  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute left-2 right-2 overflow-hidden rounded-xl border border-primary/20 bg-background/95 px-3 py-2 text-left shadow-sm transition hover:border-primary hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      style={{ top, height }}
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

function parseReferenceDate(value?: string): Date {
  if (!value) return new Date()
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return new Date()
  return parsed
}

function startOfMonthUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

function startOfWeekUTC(date: Date): Date {
  const result = startOfDayUTC(date)
  const day = result.getUTCDay() || 7
  result.setUTCDate(result.getUTCDate() - (day - 1))
  return result
}

function startOfDayUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function isSameMonthUTC(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth()
}

function isSameDayUTC(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  )
}

function dayKeyUTC(date: Date): number {
  return startOfDayUTC(date).getTime()
}

function minutesFromStartOfDayInTimeZone(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone,
  }).formatToParts(date)
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0")
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0")
  return hour * 60 + minute
}

function addDaysUTC(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY)
}

function addMonthsUTC(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1))
}

function addMinutesUTC(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000)
}

function timelineHeight(): number {
  return HOURS.length * HOUR_HEIGHT
}

function formatMonthLabelUTC(date: Date): string {
  return new Intl.DateTimeFormat("es-MX", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })
    .format(date)
    .replace(".", "")
}

function formatLongDayLabelUTC(date: Date): string {
  return new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })
    .format(date)
    .replace(".", "")
}

function formatHourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`
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

const WEEKDAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]

function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ")
}
