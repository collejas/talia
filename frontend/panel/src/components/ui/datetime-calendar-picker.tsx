"use client"

import * as React from "react"
import { IconCalendarEvent, IconChevronLeft, IconChevronRight } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

type DateTimeCalendarPickerProps = {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  minValue?: string
  description?: string
}

function parseLocalDateTime(value: string): Date | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }
  return parsed
}

function formatDateLabel(date: Date | null): string {
  if (!date) return ""
  return new Intl.DateTimeFormat("es-MX", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date)
}

function toDateValue(date: Date): string {
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return adjusted.toISOString().slice(0, 10)
}

function toTimeValue(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  return `${hours}:${minutes}`
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function addMonths(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1)
}

function getMonthDays(date: Date): Array<Array<Date | null>> {
  const firstDay = startOfMonth(date)
  const startWeekday = (firstDay.getDay() + 6) % 7
  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  const cells: Array<Date | null> = []
  for (let i = 0; i < startWeekday; i += 1) {
    cells.push(null)
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(date.getFullYear(), date.getMonth(), day))
  }
  while (cells.length % 7 !== 0) {
    cells.push(null)
  }
  const weeks: Array<Array<Date | null>> = []
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7))
  }
  return weeks
}

function isSameDay(a: Date | null, b: Date | null): boolean {
  if (!a || !b) return false
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function combineDateAndTime(dateValue: string, timeValue: string): string {
  if (!dateValue.trim()) return ""
  const time = timeValue.trim() || "09:00"
  return `${dateValue}T${time.length === 5 ? time : "09:00"}`
}

export function DateTimeCalendarPicker({
  id,
  label,
  value,
  onChange,
  placeholder = "Selecciona una fecha",
  disabled = false,
  minValue,
  description,
}: DateTimeCalendarPickerProps) {
  const parsed = React.useMemo(() => parseLocalDateTime(value), [value])
  const [open, setOpen] = React.useState(false)
  const [viewDate, setViewDate] = React.useState(() => parsed ?? new Date())
  const [draftDate, setDraftDate] = React.useState<Date | null>(parsed)
  const [timeValue, setTimeValue] = React.useState(() => (parsed ? toTimeValue(parsed) : "09:00"))
  const wrapperRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    if (open) {
      setDraftDate(parsed)
      setViewDate(parsed ?? new Date())
      setTimeValue(parsed ? toTimeValue(parsed) : "09:00")
    }
  }, [open, parsed])

  const monthWeeks = React.useMemo(() => getMonthDays(viewDate), [viewDate])
  const committedLabel = parsed ? formatDateLabel(parsed) : ""
  const draftDateValue = draftDate ? toDateValue(draftDate) : ""
  const canSave = Boolean(draftDateValue)

  const save = React.useCallback(
    (nextDateValue: string, nextTimeValue: string) => {
      onChange(combineDateAndTime(nextDateValue, nextTimeValue))
      setOpen(false)
    },
    [onChange],
  )

  const discard = React.useCallback(() => {
    setOpen(false)
    setDraftDate(parsed)
    setViewDate(parsed ?? new Date())
    setTimeValue(parsed ? toTimeValue(parsed) : "09:00")
  }, [parsed])

  const applyDraft = React.useCallback(() => {
    if (!draftDateValue) return
    save(draftDateValue, timeValue)
  }, [draftDateValue, save, timeValue])

  const setOpenState = React.useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        discard()
        return
      }
      setOpen(true)
    },
    [discard],
  )

  React.useEffect(() => {
    function handleDocumentMouseDown(event: MouseEvent) {
      if (!open) return
      const target = event.target as Node | null
      if (target && wrapperRef.current && !wrapperRef.current.contains(target)) {
        discard()
      }
    }
    document.addEventListener("mousedown", handleDocumentMouseDown)
    return () => document.removeEventListener("mousedown", handleDocumentMouseDown)
  }, [discard, open])

  return (
    <div className="grid gap-2" ref={wrapperRef}>
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
      </Label>
      <div className="relative">
        <Button
          id={id}
          type="button"
          variant="outline"
          className={cn(
            "w-full justify-between gap-2 px-3 font-normal",
            !committedLabel && "text-muted-foreground",
          )}
          onClick={() => !disabled && setOpenState(!open)}
          disabled={disabled}
        >
          <span className="truncate">{committedLabel || placeholder}</span>
          <IconCalendarEvent className="size-4 shrink-0" />
        </Button>

        {open ? (
          <div
            className="absolute left-0 top-[calc(100%+0.5rem)] z-50 w-[340px] rounded-xl border border-border bg-background p-3 shadow-xl"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault()
                discard()
              }
              if (event.key === "Enter") {
                event.preventDefault()
                applyDraft()
              }
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => setViewDate((current) => addMonths(current, -1))}
              >
                <IconChevronLeft className="size-4" />
              </Button>
              <div className="text-sm font-semibold capitalize">
                {new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric" }).format(viewDate)}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => setViewDate((current) => addMonths(current, 1))}
              >
                <IconChevronRight className="size-4" />
              </Button>
            </div>

            <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {["L", "M", "X", "J", "V", "S", "D"].map((day) => (
                <span key={day} className="py-1">
                  {day}
                </span>
              ))}
            </div>

            <div className="mt-1 grid gap-1">
              {monthWeeks.map((week, weekIndex) => (
                <div key={`${viewDate.getFullYear()}-${viewDate.getMonth()}-${weekIndex}`} className="grid grid-cols-7 gap-1">
                  {week.map((day, dayIndex) => {
                    if (!day) {
                      return <span key={`empty-${weekIndex}-${dayIndex}`} className="h-9" />
                    }
                    const selected = isSameDay(day, draftDate)
                    const isBeforeMin =
                      Boolean(minValue) &&
                      combineDateAndTime(toDateValue(day), timeValue) < (minValue ?? "")
                    return (
                      <button
                        key={day.toISOString()}
                        type="button"
                        className={cn(
                          "flex h-9 items-center justify-center rounded-md text-sm transition",
                          selected
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-muted",
                          isBeforeMin && "cursor-not-allowed opacity-40",
                        )}
                        disabled={disabled || isBeforeMin}
                        onClick={() => {
                          setDraftDate(day)
                        }}
                      >
                        {day.getDate()}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>

            <div className="mt-3 space-y-1">
              <Label htmlFor={`${id}-time`} className="text-xs font-medium text-muted-foreground">
                Hora
              </Label>
              <Input
                id={`${id}-time`}
                type="time"
                value={timeValue}
                onChange={(event) => {
                  const nextTime = event.target.value
                  setTimeValue(nextTime)
                }}
                disabled={disabled}
              />
            </div>

            <p className="mt-2 text-xs text-muted-foreground">
              Elige fecha y hora, luego guarda para aplicar el recordatorio.
            </p>

            <div className="mt-3 flex items-center justify-end gap-2 border-t border-border/60 pt-3">
              <Button type="button" variant="outline" onClick={discard} disabled={disabled}>
                Cancelar
              </Button>
              <Button type="button" onClick={applyDraft} disabled={disabled || !canSave}>
                Guardar
              </Button>
            </div>
          </div>
        ) : null}
      </div>
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
    </div>
  )
}
