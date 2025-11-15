'use client'

import { useMemo } from "react"

import { AgendaItem } from "@/lib/agenda/data"
import { useCurrentUser } from "@/hooks/use-current-user"
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

const PRIVILEGED_ROLES = new Set(["admin", "manager", "owner", "superuser"])

export function AgendaEventDrawer({
  open,
  onOpenChange,
  item,
  onRequestReschedule,
  onRequestCancel,
}: AgendaEventDrawerProps) {
  const { user } = useCurrentUser()
  const canManage = useMemo(() => {
    const roles = extractRoles(user)
    if (!roles.length) return false
    return roles.some((role) => PRIVILEGED_ROLES.has(role))
  }, [user])

  const timezone = item?.timezone || "UTC"

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
            disabled={!canManage || !item}
            onClick={() => item && onRequestReschedule?.(item)}
            variant="default"
          >
            Reprogramar
          </Button>
          <Button
            disabled={!canManage || !item}
            onClick={() => item && onRequestCancel?.(item)}
            variant="destructive"
          >
            Cancelar cita
          </Button>
          {!canManage ? (
            <p className="text-muted-foreground text-xs">
              Solo los administradores o roles elevados pueden modificar o cancelar citas.
            </p>
          ) : null}
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

function extractRoles(user: ReturnType<typeof useCurrentUser>["user"]): string[] {
  if (!user) return []
  const metadataRoles = user.app_metadata?.roles ?? user.user_metadata?.roles
  if (Array.isArray(metadataRoles)) {
    return metadataRoles.map((role) => String(role).toLowerCase())
  }
  if (typeof metadataRoles === "string") {
    return [metadataRoles.toLowerCase()]
  }
  return []
}
