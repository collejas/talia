"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  IconBell,
  IconBellFilled,
  IconCircleCheck,
  IconClock,
  IconExternalLink,
  IconInfoCircle,
  IconMailOff,
  IconRefresh,
  IconX,
} from "@tabler/icons-react"

import { useNotifications } from "@/components/notifications/global-notifications-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

function formatDateTime(value: string | null | undefined) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date)
}

export function NotificationCenter() {
  const router = useRouter()
  const { items, unreadCount, loading, refresh, markAsRead, markAllAsRead, hideItem } = useNotifications()
  const [open, setOpen] = useState(false)
  const unreadLabel = unreadCount > 99 ? "99+" : unreadCount > 0 ? String(unreadCount) : ""

  const orderedItems = useMemo(
    () =>
      [...items].sort((a, b) => {
        const aTime = a.created_at ? new Date(a.created_at).getTime() : 0
        const bTime = b.created_at ? new Date(b.created_at).getTime() : 0
        return bTime - aTime
      }),
    [items]
  )

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon-sm" className="relative">
          {unreadCount > 0 ? <IconBellFilled className="size-4" /> : <IconBell className="size-4" />}
          <span className="sr-only">Abrir notificaciones</span>
          {unreadLabel ? (
            <Badge className="absolute -top-2 -right-2 min-w-5 px-1.5 py-0 text-[10px]">
              {unreadLabel}
            </Badge>
          ) : null}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader className="gap-2 border-b">
          <div className="flex items-center justify-between gap-3 pr-10">
            <div>
              <SheetTitle>Notificaciones</SheetTitle>
              <SheetDescription>
                Eventos persistentes del sistema para tu usuario.
              </SheetDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
                <IconRefresh className={cn("size-4", loading ? "animate-spin" : "")} />
                Actualizar
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void markAllAsRead()} disabled={!unreadCount}>
                Marcar todas
              </Button>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1 px-4 pb-4">
          <div className="space-y-3 pt-4">
            {!orderedItems.length ? (
              <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                No hay notificaciones por ahora.
              </div>
            ) : null}

            {orderedItems.map((item) => {
              const isUnread = !item.read_at
              const createdLabel = formatDateTime(item.created_at)
              const stableKey = item.id ?? `${item.type}:${item.created_at ?? "pending"}:${item.message}`
              const Icon =
                item.level === "success"
                  ? IconCircleCheck
                  : item.level === "error"
                    ? IconMailOff
                    : item.level === "warning"
                      ? IconClock
                      : IconInfoCircle
              return (
                <article
                  key={stableKey}
                  className={cn(
                    "rounded-xl border p-4 transition",
                    isUnread ? "border-primary/40 bg-primary/5" : "border-border bg-background"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "mt-0.5 rounded-full p-2",
                        item.level === "success" && "bg-emerald-500/10 text-emerald-600",
                        item.level === "error" && "bg-destructive/10 text-destructive",
                        item.level === "warning" && "bg-amber-500/10 text-amber-600",
                        item.level === "info" && "bg-sky-500/10 text-sky-600"
                      )}
                    >
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="truncate text-sm font-semibold">
                              {(item.title ?? "").trim() || "Notificacion"}
                            </h3>
                            {isUnread ? <Badge variant="secondary">Nueva</Badge> : null}
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">{item.message}</p>
                        </div>
                        {createdLabel ? (
                          <span className="shrink-0 text-xs text-muted-foreground">{createdLabel}</span>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {item.action?.href ? (
                          <Button
                            size="sm"
                            onClick={() => {
                              if (item.id && !item.read_at) {
                                void markAsRead(item.id)
                              }
                              setOpen(false)
                              void router.push(item.action?.href || "/")
                            }}
                          >
                            <IconExternalLink className="size-4" />
                            {(item.action?.label ?? "").trim() || "Abrir"}
                          </Button>
                        ) : null}
                        {item.id && !item.read_at ? (
                          <Button size="sm" variant="outline" onClick={() => void markAsRead(item.id!)}>
                            Marcar leida
                          </Button>
                        ) : null}
                        {item.id ? (
                          <Button size="sm" variant="ghost" onClick={() => void hideItem(item.id!)}>
                            <IconX className="size-4" />
                            Ocultar
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
