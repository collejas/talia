'use client'

import * as React from "react"

import { AgendaItem } from "@/lib/agenda/data"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type AgendaTableProps = {
  items: AgendaItem[]
}

type FilterState = {
  estado: string
  provider: string
  assigned: string
}

const ESTADO_OPTIONS = [
  { value: "todos", label: "Todos los estados" },
  { value: "pendiente", label: "Pendiente" },
  { value: "confirmada", label: "Confirmada" },
  { value: "reprogramada", label: "Reprogramada" },
  { value: "cancelada", label: "Cancelada" },
  { value: "realizada", label: "Realizada" },
]

const PROVIDER_OPTIONS = [
  { value: "todos", label: "Todos los proveedores" },
  { value: "calendar", label: "Calendario Tal-IA" },
]

export function AgendaTable({ items }: AgendaTableProps) {
  const [filters, setFilters] = React.useState<FilterState>({
    estado: "todos",
    provider: "todos",
    assigned: "todos",
  })

  const assignedOptions = React.useMemo(() => {
    const base = new Map<string, string>()
    base.set("todos", "Todos los responsables")
    for (const item of items) {
      const name = item.asignadoNombre?.trim()
      if (name) {
        base.set(name, name)
      }
    }
    return Array.from(base.entries()).map(([value, label]) => ({ value, label }))
  }, [items])

  const filteredItems = React.useMemo(() => {
    return items.filter((item) => {
      if (filters.estado !== "todos" && item.estado !== filters.estado) {
        return false
      }
      if (
        filters.provider !== "todos" &&
        (item.provider ?? "hosting") !== filters.provider
      ) {
        return false
      }
      if (
        filters.assigned !== "todos" &&
        (item.asignadoNombre?.trim() ?? "") !== filters.assigned
      ) {
        return false
      }
      return true
    })
  }, [items, filters])

  const handleReset = React.useCallback(() => {
    setFilters({ estado: "todos", provider: "todos", assigned: "todos" })
  }, [])

  if (!items.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No hay demos programadas</CardTitle>
          <CardDescription>
            Cuando Tal-IA o el equipo agenden una demo, aparecerá aquí con la información
            principal.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Demos programadas</CardTitle>
        <CardDescription>
          Filtra por estado, proveedor o responsable para priorizar las próximas acciones.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <div className="flex flex-wrap items-center gap-2 px-6 pb-4">
          <Select
            value={filters.estado}
            onValueChange={(value) => setFilters((prev) => ({ ...prev, estado: value }))}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              {ESTADO_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.provider}
            onValueChange={(value) => setFilters((prev) => ({ ...prev, provider: value }))}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Proveedor" />
            </SelectTrigger>
            <SelectContent>
              {PROVIDER_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.assigned}
            onValueChange={(value) => setFilters((prev) => ({ ...prev, assigned: value }))}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Responsable" />
            </SelectTrigger>
            <SelectContent>
              {assignedOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" onClick={handleReset}>
            Limpiar filtros
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[200px]">Contacto</TableHead>
              <TableHead className="min-w-[180px]">Fecha y hora</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Canal</TableHead>
              <TableHead>Asignado</TableHead>
              <TableHead>Notas</TableHead>
              <TableHead>Reunión</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredItems.map((item) => {
              const schedule = formatDateTime(item.startAt, item.timezone)
              const estadoLabel = formatEstado(item.estado)
              const estadoVariant = getEstadoVariant(item.estado)
              const providerLabel = formatProvider(item.provider)
              const canal = formatCanal(item.canal)
              const meetingHref = item.meetingUrl || item.externalJoinUrl || null

              return (
                <TableRow key={item.id} className="align-top">
                  <TableCell className="space-y-1">
                    <div className="font-semibold">
                      {item.contactoNombre?.trim() || "Contacto sin nombre"}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {item.contactoCorreo?.trim() ||
                        item.contactoTelefono?.trim() ||
                        item.contactoEmpresa?.trim() ||
                        "—"}
                    </div>
                  </TableCell>
                  <TableCell className="space-y-1">
                    <div className="font-medium">{schedule.dateLabel}</div>
                    <div className="text-muted-foreground text-xs">
                      {schedule.timeLabel}
                      {item.timezone ? ` · ${item.timezone}` : null}
                    </div>
                  </TableCell>
                  <TableCell className="space-y-1">
                    <Badge variant={estadoVariant}>{estadoLabel}</Badge>
                    <div className="text-muted-foreground text-xs">
                      {item.metadata?.invite_status
                        ? `Invitación: ${formatInviteStatus(String(item.metadata.invite_status))}`
                        : ""}
                    </div>
                  </TableCell>
                  <TableCell className="space-y-1">
                    <div className="font-medium">{providerLabel}</div>
                    {canal ? <div className="text-muted-foreground text-xs">{canal}</div> : null}
                    {item.metadata?.source ? (
                      <div className="text-muted-foreground text-xs">
                        Programada por {String(item.metadata.source).toLowerCase()}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="space-y-1">
                    <div className="font-medium">
                      {item.asignadoNombre || "Sin asignar"}
                    </div>
                    {item.propietarioNombre ? (
                      <div className="text-muted-foreground text-xs">
                        Propietario: {item.propietarioNombre}
                      </div>
                    ) : null}
                    {item.etapaNombre ? (
                      <div className="text-muted-foreground text-xs">{item.etapaNombre}</div>
                    ) : null}
                  </TableCell>
                  <TableCell className="max-w-[240px] space-y-1">
                    {item.notes ? (
                      <p className="text-sm leading-snug text-muted-foreground">
                        {item.notes}
                      </p>
                    ) : (
                      <span className="text-muted-foreground text-xs">Sin notas</span>
                    )}
                    {item.metadata?.cancel_reason ? (
                      <p className="text-xs text-destructive">
                        Motivo cancelación: {String(item.metadata.cancel_reason)}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {meetingHref ? (
                      <a
                        href={meetingHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary text-sm font-medium hover:underline"
                      >
                        Abrir enlace
                      </a>
                    ) : (
                      <span className="text-muted-foreground text-xs">Pendiente</span>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function formatDateTime(
  value: string,
  timezone?: string | null,
): {
  dateLabel: string
  timeLabel: string
} {
  if (!value) {
    return { dateLabel: "Sin fecha", timeLabel: "" }
  }

  const tz = timezone && timezone.trim().length ? timezone : "UTC"
  try {
    const date = new Date(value)
    const dateLabel = new Intl.DateTimeFormat("es-MX", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: tz,
    }).format(date)

    const timeLabel = new Intl.DateTimeFormat("es-MX", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: tz,
    }).format(date)

    return {
      dateLabel: capitalizeSpanish(dateLabel),
      timeLabel,
    }
  } catch {
    return { dateLabel: value, timeLabel: "" }
  }
}

function capitalizeSpanish(value: string): string {
  if (!value) return value
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function formatEstado(value: string): string {
  const estado = value?.toLowerCase() ?? "pendiente"
  switch (estado) {
    case "pendiente":
      return "Pendiente"
    case "confirmada":
      return "Confirmada"
    case "reprogramada":
      return "Reprogramada"
    case "cancelada":
      return "Cancelada"
    case "realizada":
      return "Realizada"
    default:
      return capitalizeSpanish(estado)
  }
}

function getEstadoVariant(
  estado: string,
): "default" | "secondary" | "destructive" | "outline" {
  const normalized = estado?.toLowerCase() ?? "pendiente"
  if (normalized === "cancelada") return "destructive"
  if (normalized === "realizada") return "default"
  if (normalized === "reprogramada" || normalized === "pendiente") return "secondary"
  return "default"
}

function formatProvider(provider: string): string {
  const normalized = provider?.toLowerCase() ?? "calendar"
  if (normalized === "calendar") return "Calendario Tal-IA"
  if (normalized === "google") return "Google Calendar"
  return "Agenda interna"
}

function formatInviteStatus(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === "sent") return "Enviada";
  if (normalized === "failed") return "Fallida";
  if (normalized === "skipped") return "Omitida";
  return capitalizeSpanish(normalized);
}

function formatCanal(canal: string | null | undefined): string | null {
  if (!canal) return null
  const normalized = canal.toLowerCase()
  switch (normalized) {
    case "whatsapp":
      return "WhatsApp"
    case "webchat":
      return "Webchat"
    case "voz":
      return "Teléfono"
    case "instagram":
      return "Instagram"
    default:
      return capitalizeSpanish(normalized)
  }
}
