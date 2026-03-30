"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  IconBell,
  IconBellFilled,
  IconCircleCheck,
  IconClock,
  IconChevronDown,
  IconChevronRight,
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
import type { NotificationItem } from "@/lib/notifications/client"

const GROUPABLE_TYPES = new Set(["scraper.finished", "lookup.finished", "inbox.message", "opportunity.created"])

function formatDateTime(value: string | null | undefined) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date)
}

function pluralize(count: number, singular: string, plural?: string) {
  return `${count} ${count === 1 ? singular : plural ?? `${singular}s`}`
}

function summarizeGroup(type: string, items: NotificationItem[]) {
  if (type === "scraper.finished") {
    const total = items.length
    const success = items.filter((item) => item.level === "success").length
    const error = items.filter((item) => item.level === "error").length
    const withEmails = items.filter((item) => Number(item.meta?.emails_total ?? 0) > 0).length
    const withoutEmails = success - withEmails
    const totalEmails = items.reduce((sum, item) => sum + Number(item.meta?.emails_total ?? 0), 0)
    const level: NotificationItem["level"] = error > 0 ? (success > 0 ? "warning" : "error") : "success"
    return {
      title: "Lote de scraper terminado",
      description: [
        pluralize(total, "scraper"),
        `${withEmails} con correos`,
        `${Math.max(withoutEmails, 0)} sin hallazgos`,
        `${error} con error`,
        totalEmails > 0 ? `${pluralize(totalEmails, "correo")}` : null,
      ]
        .filter(Boolean)
        .join(", "),
      level,
    }
  }
  if (type === "lookup.finished") {
    return {
      title: "Lote de verificacion terminado",
      description: `${pluralize(items.length, "verificacion")} finalizadas.`,
      level: (items.some((item) => item.level === "error") ? "warning" : "success") as NotificationItem["level"],
    }
  }
  if (type === "inbox.message") {
    return {
      title: "Mensajes nuevos en Inbox",
      description: `${pluralize(items.length, "mensaje")} nuevo${items.length === 1 ? "" : "s"}.`,
      level: (items.some((item) => item.level === "error") ? "warning" : "info") as NotificationItem["level"],
    }
  }
  if (type === "opportunity.created") {
    return {
      title: "Oportunidades nuevas",
      description: `${pluralize(items.length, "oportunidad")} creada${items.length === 1 ? "" : "s"}.`,
      level: (items.some((item) => item.level === "error") ? "warning" : "success") as NotificationItem["level"],
    }
  }
  return {
    title: "Notificaciones agrupadas",
    description: `${pluralize(items.length, "evento")} nuevos.`,
    level: "info" as NotificationItem["level"],
  }
}

export function NotificationCenter() {
  const router = useRouter()
  const {
    items,
    unreadCount,
    totalCount,
    loading,
    refresh,
    loadMore,
    hasMore,
    unreadOnly,
    levelFilter,
    markAsRead,
    markAllAsRead,
    hideItem,
  } = useNotifications()
  const [open, setOpen] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
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

  const groupedEntries = useMemo(() => {
    const groups = new Map<string, NotificationItem[]>()
    for (const item of orderedItems) {
      const groupKey = (item.group_key ?? "").trim()
      if (!groupKey || !GROUPABLE_TYPES.has(item.type)) {
        continue
      }
      const bucket = groups.get(groupKey)
      if (bucket) {
        bucket.push(item)
      } else {
        groups.set(groupKey, [item])
      }
    }

    const seenGroups = new Set<string>()
    const entries: Array<
      | {
          kind: "group"
          key: string
          type: string
          items: NotificationItem[]
          summary: { title: string; description: string; level: NotificationItem["level"] }
          latest: NotificationItem
        }
      | { kind: "item"; item: NotificationItem }
    > = []

    for (const item of orderedItems) {
      const groupKey = (item.group_key ?? "").trim()
      if (groupKey && GROUPABLE_TYPES.has(item.type)) {
        if (seenGroups.has(groupKey)) continue
        const bucket = groups.get(groupKey) ?? [item]
        seenGroups.add(groupKey)
        entries.push({
          kind: "group",
          key: groupKey,
          type: item.type,
          items: bucket,
          summary: summarizeGroup(item.type, bucket),
          latest: bucket[0],
        })
        continue
      }
      entries.push({ kind: "item", item })
    }

    return entries
  }, [orderedItems])

  const sections = useMemo(() => {
    const now = new Date()
    const todayKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`
    const yesterday = new Date(now)
    yesterday.setDate(now.getDate() - 1)
    const yesterdayKey = `${yesterday.getFullYear()}-${yesterday.getMonth() + 1}-${yesterday.getDate()}`

    const list: Array<{
      key: string
      label: string
      entries: typeof groupedEntries
    }> = []
    const map = new Map<string, number>()

    for (const entry of groupedEntries) {
      const createdAt = entry.kind === "group" ? entry.latest.created_at : entry.item.created_at
      const date = createdAt ? new Date(createdAt) : null
      const key = date
        ? `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
        : "sin-fecha"
      let label = "Sin fecha"
      if (date) {
        if (key === todayKey) {
          label = "Hoy"
        } else if (key === yesterdayKey) {
          label = "Ayer"
        } else {
          label = new Intl.DateTimeFormat("es-MX", { dateStyle: "full" }).format(date)
        }
      }
      if (!map.has(key)) {
        map.set(key, list.length)
        list.push({ key, label, entries: [entry] })
      } else {
        const index = map.get(key) ?? 0
        list[index].entries.push(entry)
      }
    }
    return list
  }, [groupedEntries])

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

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
              <Button
                variant={unreadOnly ? "default" : "outline"}
                size="sm"
                onClick={() => void refresh({ unreadOnly: !unreadOnly })}
                disabled={loading}
              >
                {unreadOnly ? "Mostrando no leidas" : "Solo no leidas"}
              </Button>
              <Button
                variant={levelFilter?.includes("error") ? "default" : "outline"}
                size="sm"
                onClick={() =>
                  void refresh({
                    levels: levelFilter?.includes("error") ? null : ["error"],
                  })
                }
                disabled={loading}
              >
                {levelFilter?.includes("error") ? "Mostrando errores" : "Solo errores"}
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

            {orderedItems.length ? (
              <div className="text-xs text-muted-foreground">
                Mostrando {orderedItems.length} de {totalCount || orderedItems.length}
              </div>
            ) : null}

            {sections.map((section) => (
              <div key={section.key} className="space-y-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-medium uppercase tracking-wide">{section.label}</span>
                  <span>{pluralize(section.entries.length, "evento")}</span>
                </div>
                {section.entries.map((entry) => {
              if (entry.kind === "group") {
                const isUnread = entry.items.some((item) => !item.read_at)
                const createdLabel = formatDateTime(entry.latest.created_at)
                const isExpanded = expandedGroups.has(entry.key)
                const summaryLevel = entry.summary.level
                const Icon =
                  summaryLevel === "success"
                    ? IconCircleCheck
                    : summaryLevel === "error"
                      ? IconMailOff
                      : summaryLevel === "warning"
                        ? IconClock
                        : IconInfoCircle
                return (
                  <article
                    key={`group-${entry.key}`}
                    className={cn(
                      "rounded-xl border p-4 transition",
                      isUnread ? "border-primary/40 bg-primary/5" : "border-border bg-background"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          "mt-0.5 rounded-full p-2",
                          summaryLevel === "success" && "bg-emerald-500/10 text-emerald-600",
                          summaryLevel === "error" && "bg-destructive/10 text-destructive",
                          summaryLevel === "warning" && "bg-amber-500/10 text-amber-600",
                          summaryLevel === "info" && "bg-sky-500/10 text-sky-600"
                        )}
                      >
                        <Icon className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="truncate text-sm font-semibold">{entry.summary.title}</h3>
                              {isUnread ? <Badge variant="secondary">Nueva</Badge> : null}
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">{entry.summary.description}</p>
                          </div>
                          {createdLabel ? (
                            <span className="shrink-0 text-xs text-muted-foreground">{createdLabel}</span>
                          ) : null}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {entry.latest.action?.href ? (
                            <Button
                              size="sm"
                              onClick={() => {
                                setOpen(false)
                                void router.push(entry.latest.action?.href || "/")
                              }}
                            >
                              <IconExternalLink className="size-4" />
                              {(entry.latest.action?.label ?? "").trim() || "Abrir"}
                            </Button>
                          ) : null}
                          {isUnread ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                void Promise.all(
                                  entry.items
                                    .filter((item) => item.id && !item.read_at)
                                    .map((item) => markAsRead(item.id!))
                                )
                              }
                            >
                              Marcar leidas
                            </Button>
                          ) : null}
                          <Button size="sm" variant="ghost" onClick={() => toggleGroup(entry.key)}>
                            {isExpanded ? <IconChevronDown className="size-4" /> : <IconChevronRight className="size-4" />}
                            {isExpanded ? "Ocultar detalles" : `Ver detalles (${entry.items.length})`}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              void Promise.all(entry.items.filter((item) => item.id).map((item) => hideItem(item.id!)))
                            }
                          >
                            <IconX className="size-4" />
                            Ocultar
                          </Button>
                        </div>

                        {isExpanded ? (
                          <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
                            {entry.items.map((item) => {
                              const itemLabel = formatDateTime(item.created_at)
                              return (
                                <div key={item.id ?? `${item.type}:${item.created_at ?? "pending"}:${item.message}`}>
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="text-sm font-medium">
                                      {(item.title ?? "").trim() || "Notificacion"}
                                    </span>
                                    {itemLabel ? (
                                      <span className="text-xs text-muted-foreground">{itemLabel}</span>
                                    ) : null}
                                  </div>
                                  <p className="text-sm text-muted-foreground">{item.message}</p>
                                </div>
                              )
                            })}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </article>
                )
              }

              const item = entry.item
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
            ))}

            {hasMore ? (
              <div className="flex justify-center pt-2">
                <Button variant="outline" size="sm" onClick={() => void loadMore()} disabled={loading}>
                  Cargar mas
                </Button>
              </div>
            ) : null}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
