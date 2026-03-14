'use client'

import { AgendaItem } from "@/lib/agenda/data"
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"

type AgendaEventDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: AgendaItem | null
  onRequestReschedule?: (item: AgendaItem) => void
  onRequestCancel?: (item: AgendaItem) => void
}

export function AgendaEventDrawer({
  open,
  onOpenChange,
  item,
  onRequestReschedule,
  onRequestCancel,
}: AgendaEventDrawerProps) {
  const timezone = item?.timezone || "UTC"
  const estadoNormalized = item?.estado?.toLowerCase() ?? ""
  const isCancelled = estadoNormalized === "cancelada"
  const zoom = extractZoomObservability(item?.metadata)

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent className="sm:max-w-xl">
        <DrawerHeader>
          <Badge variant={resolveEstadoVariant(item?.estado)} className="w-fit uppercase">
            {item?.estado || "sin estado"}
          </Badge>
          <DrawerTitle className="text-2xl">
            {item?.contactoNombre || "Contacto sin nombre"}
          </DrawerTitle>
          <DrawerDescription>
            {item?.contactoCorreo || item?.contactoTelefono || "Sin contacto registrado"}
          </DrawerDescription>
        </DrawerHeader>
        <div className="space-y-4 px-4 pb-6">
          <InfoGrid item={item} timezone={timezone} />
          {zoom ? (
            <section className="rounded-lg border border-border/70 bg-muted/30 p-3 text-sm">
              <p className="text-muted-foreground text-xs uppercase tracking-wide">Zoom</p>
              <p className="leading-relaxed">
                Estado: <strong>{zoom.label}</strong>
              </p>
              {zoom.error ? <p className="text-xs text-destructive">Error: {zoom.error}</p> : null}
            </section>
          ) : null}
          {item?.notes ? (
            <section className="rounded-lg border border-border/70 bg-muted/30 p-3 text-sm">
              <p className="text-muted-foreground text-xs uppercase tracking-wide">Notas</p>
              <p className="leading-relaxed">{item.notes}</p>
            </section>
          ) : null}
          {item?.meetingUrl ? (
            <Button asChild variant="secondary" className="w-full">
              <a href={item.meetingUrl} target="_blank" rel="noopener noreferrer">
                Abrir enlace de reunión
              </a>
            </Button>
          ) : null}
          <Separator />
          <div className="flex flex-col gap-2 text-sm text-muted-foreground">
            <span>
              Zona horaria preferida: <strong>{timezone}</strong>
            </span>
            <span>
              ID conversación: <strong>{item?.conversacionId || "—"}</strong>
            </span>
          </div>
        </div>
        <DrawerFooter className="gap-3 border-t border-border/60 bg-muted/20">
          <Button
            disabled={!item || isCancelled}
            onClick={() => item && onRequestReschedule?.(item)}
            variant="default"
          >
            Reprogramar
          </Button>
          <Button
            disabled={!item || isCancelled}
            onClick={() => item && onRequestCancel?.(item)}
            variant="destructive"
          >
            Cancelar cita
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

function InfoGrid({ item, timezone }: { item: AgendaItem | null; timezone: string }) {
  if (!item) return null
  const startLabel = formatDateLabel(item.startAt, timezone)
  const endLabel = item.endAt ? formatDateLabel(item.endAt, timezone) : null
  return (
    <section className="grid gap-3 sm:grid-cols-2">
      <InfoCard label="Horario" value={endLabel ? `${startLabel} - ${endLabel}` : startLabel} />
      <InfoCard label="Canal" value={item.canal || "Sin canal"} />
      <InfoCard label="Responsable" value={item.asignadoNombre || "Sin asignar"} />
      <InfoCard label="Propietario" value={item.propietarioNombre || "Sin propietario"} />
    </section>
  )
}

function InfoCard({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-lg border border-border/60 p-3">
      <p className="text-muted-foreground text-xs uppercase tracking-wide">{label}</p>
      <p className="text-sm font-medium">{value || "—"}</p>
    </div>
  )
}

function formatDateLabel(value: string, timezone: string): string {
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

function resolveEstadoVariant(
  estado: string | undefined,
): "default" | "secondary" | "destructive" | "outline" {
  const normalized = estado?.toLowerCase() ?? "pendiente"
  if (normalized === "cancelada") return "destructive"
  if (normalized === "confirmada") return "default"
  if (normalized === "reprogramada" || normalized === "pendiente") return "secondary"
  return "outline"
}

function extractZoomObservability(
  metadata: Record<string, unknown> | null | undefined,
): { label: string; error: string | null } | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null
  const statusRaw = metadata.zoom_status
  const status = typeof statusRaw === "string" ? statusRaw.trim().toLowerCase() : ""
  if (!status) return null

  const labels: Record<string, string> = {
    created: "creada",
    updated: "actualizada",
    cancelled: "cancelada",
    failed: "error al crear",
    update_failed: "error al actualizar",
    cancel_failed: "error al cancelar",
    missing_credentials: "sin credenciales",
  }

  const errorKeys = ["zoom_error", "zoom_update_error", "zoom_cancel_error"]
  let error: string | null = null
  for (const key of errorKeys) {
    const value = metadata[key]
    if (typeof value === "string" && value.trim()) {
      error = value.trim()
      break
    }
  }

  return {
    label: labels[status] ?? status,
    error,
  }
}
