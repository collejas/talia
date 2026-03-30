"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useRouter } from "next/navigation"
import { Toaster, toast } from "sonner"

import {
  fetchNotifications,
  fetchNotificationsUnreadCount,
  hideNotification,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from "@/lib/notifications/client"

type NotificationsContextValue = {
  items: NotificationItem[]
  unreadCount: number
  totalCount: number
  loading: boolean
  refresh: (options?: { unreadOnly?: boolean; levels?: string[] | null }) => Promise<void>
  loadMore: () => Promise<void>
  hasMore: boolean
  unreadOnly: boolean
  levelFilter: string[] | null
  markAsRead: (notificationId: string) => Promise<void>
  markAllAsRead: () => Promise<void>
  hideItem: (notificationId: string) => Promise<void>
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null)

type UserNotificationEvent = NotificationItem

type GlobalNotificationsProviderProps = {
  children: React.ReactNode
}

type BufferedGroup = {
  items: NotificationItem[]
  timer: ReturnType<typeof setTimeout>
  toastId: string
}

const PAGE_SIZE = 20
const MAX_CACHE_ITEMS = 200
const GROUPABLE_TYPES = new Set(["scraper.finished", "lookup.finished", "inbox.message", "opportunity.created"])
const GROUP_FLUSH_MS = 6000

function pluralize(count: number, singular: string, plural?: string) {
  return `${count} ${count === 1 ? singular : plural ?? `${singular}s`}`
}

function summarizeGroupedNotifications(type: string, items: NotificationItem[]) {
  if (type === "scraper.finished") {
    const total = items.length
    const success = items.filter((item) => item.level === "success").length
    const error = items.filter((item) => item.level === "error").length
    const withEmails = items.filter((item) => Number(item.meta?.emails_total ?? 0) > 0).length
    const withoutEmails = success - withEmails
    const totalEmails = items.reduce((sum, item) => sum + Number(item.meta?.emails_total ?? 0), 0)
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
      level: error > 0 ? (success > 0 ? "warning" : "error") : "success",
    }
  }
  if (type === "lookup.finished") {
    return {
      title: "Lote de verificacion terminado",
      description: `${pluralize(items.length, "verificacion")} finalizadas.`,
      level: items.some((item) => item.level === "error") ? "warning" : "success",
    }
  }
  if (type === "inbox.message") {
    return {
      title: "Mensajes nuevos en Inbox",
      description: `${pluralize(items.length, "mensaje")} nuevo${items.length === 1 ? "" : "s"}.`,
      level: items.some((item) => item.level === "error") ? "warning" : "info",
    }
  }
  if (type === "opportunity.created") {
    return {
      title: "Oportunidades nuevas",
      description: `${pluralize(items.length, "oportunidad")} creada${items.length === 1 ? "" : "s"}.`,
      level: items.some((item) => item.level === "error") ? "warning" : "success",
    }
  }
  return {
    title: "Notificaciones agrupadas",
    description: `${pluralize(items.length, "evento")} nuevos.`,
    level: "info",
  }
}

export function GlobalNotificationsProvider({ children }: GlobalNotificationsProviderProps) {
  const router = useRouter()
  const [items, setItems] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [levelFilter, setLevelFilter] = useState<string[] | null>(null)
  const [offset, setOffset] = useState(0)
  const seenRef = useRef<Set<string>>(new Set())
  const groupedRef = useRef<Map<string, BufferedGroup>>(new Map())

  const refresh = useCallback(async (options?: { unreadOnly?: boolean; levels?: string[] | null }) => {
    const nextUnreadOnly = options?.unreadOnly ?? unreadOnly
    const nextLevels = options?.levels ?? levelFilter
    setLoading(true)
    try {
      const [notifications, unread] = await Promise.all([
        fetchNotifications({
          limit: PAGE_SIZE,
          offset: 0,
          unreadOnly: nextUnreadOnly,
          levels: nextLevels ?? undefined,
        }),
        fetchNotificationsUnreadCount(),
      ])
      setItems(notifications.items ?? [])
      setTotalCount(Number(notifications.total ?? 0))
      setUnreadCount(unread)
      setOffset((notifications.items ?? []).length)
      setUnreadOnly(nextUnreadOnly)
      setLevelFilter(nextLevels ?? null)
      const nextSeen = new Set<string>()
      for (const item of notifications.items ?? []) {
        const dedupeKey = (item.dedupe_key ?? "").trim()
        if (dedupeKey) {
          nextSeen.add(dedupeKey)
        }
      }
      seenRef.current = nextSeen
    } finally {
      setLoading(false)
    }
  }, [unreadOnly, levelFilter])

  const loadMore = useCallback(async () => {
    if (loading) return
    setLoading(true)
    try {
      const notifications = await fetchNotifications({
        limit: PAGE_SIZE,
        offset,
        unreadOnly,
        levels: levelFilter ?? undefined,
      })
      const nextItems = notifications.items ?? []
      setItems((prev) => {
        const merged = [...prev]
        for (const item of nextItems) {
          if (!merged.some((existing) => existing.id === item.id)) {
            merged.push(item)
          }
        }
        return merged.slice(0, MAX_CACHE_ITEMS)
      })
      setTotalCount(Number(notifications.total ?? 0))
      setOffset((prev) => prev + nextItems.length)
    } finally {
      setLoading(false)
    }
  }, [loading, offset, unreadOnly, levelFilter])

  const markAsRead = useCallback(async (notificationId: string) => {
    const updated = await markNotificationRead(notificationId)
    setItems((prev) =>
      prev.map((item) => (item.id === notificationId ? { ...item, read_at: updated.read_at ?? new Date().toISOString() } : item))
    )
    setUnreadCount((prev) => Math.max(0, prev - 1))
  }, [])

  const markAllAsRead = useCallback(async () => {
    const updated = await markAllNotificationsRead()
    if (updated <= 0) return
    const now = new Date().toISOString()
    setItems((prev) => prev.map((item) => ({ ...item, read_at: item.read_at ?? now })))
    setUnreadCount(0)
  }, [])

  const hideItem = useCallback(async (notificationId: string) => {
    await hideNotification(notificationId)
    setItems((prev) => prev.filter((item) => item.id !== notificationId))
  }, [])

  const showImmediateToast = useCallback(
    (payload: NotificationItem) => {
      const title = (payload.title ?? "").trim() || "Notificacion"
      const message = (payload.message ?? "").trim()
      const actionLabel = (payload.action?.label ?? "").trim()
      const actionHref = (payload.action?.href ?? "").trim()
      const toastOptions =
        actionLabel && actionHref
          ? {
              action: {
                label: actionLabel,
                onClick: () => router.push(actionHref),
              },
            }
          : undefined

      if (payload.level === "error") {
        toast.error(title, { description: message || undefined, duration: Infinity, ...toastOptions })
        return
      }
      if (payload.level === "warning") {
        toast.warning(title, { description: message || undefined, duration: 12000, ...toastOptions })
        return
      }
      if (payload.level === "success") {
        toast.success(title, { description: message || undefined, duration: 10000, ...toastOptions })
        return
      }
      toast(title, { description: message || undefined, duration: 10000, ...toastOptions })
    },
    [router]
  )

  const showSummaryToast = useCallback(
    (
      summary: ReturnType<typeof summarizeGroupedNotifications>,
      {
        id,
        action,
        pending,
      }: {
        id: string
        action: NotificationItem["action"] | null | undefined
        pending: boolean
      }
    ) => {
      const actionLabel = (action?.label ?? "").trim()
      const actionHref = (action?.href ?? "").trim()
      const toastOptions =
        actionLabel && actionHref
          ? {
              action: {
                label: actionLabel,
                onClick: () => router.push(actionHref),
              },
            }
          : undefined
      const duration = pending ? Infinity : summary.level === "error" ? Infinity : 16000

      if (summary.level === "error") {
        toast.error(summary.title, {
          id,
          description: summary.description,
          duration,
          ...toastOptions,
        })
        return
      }
      if (summary.level === "warning") {
        toast.warning(summary.title, {
          id,
          description: summary.description,
          duration,
          ...toastOptions,
        })
        return
      }
      if (summary.level === "success") {
        toast.success(summary.title, {
          id,
          description: summary.description,
          duration,
          ...toastOptions,
        })
        return
      }
      toast(summary.title, {
        id,
        description: summary.description,
        duration,
        ...toastOptions,
      })
    },
    [router]
  )

  const enqueueToast = useCallback(
    (payload: NotificationItem) => {
      if (!GROUPABLE_TYPES.has(payload.type)) {
        showImmediateToast(payload)
        return
      }
      const groupKey = (payload.group_key ?? "").trim() || payload.type
      const toastId = `notification-group:${groupKey}`
      const group = groupedRef.current.get(groupKey)
      if (group) {
        clearTimeout(group.timer)
        group.items.push(payload)
        const summary = summarizeGroupedNotifications(payload.type, group.items)
        showSummaryToast(summary, {
          id: group.toastId,
          action: payload.action ?? group.items[0]?.action,
          pending: true,
        })
        group.timer = setTimeout(() => {
          const current = groupedRef.current.get(groupKey)
          if (!current) return
          groupedRef.current.delete(groupKey)
          if (current.items.length <= 1) {
            showImmediateToast(current.items[0])
            return
          }
          const finalSummary = summarizeGroupedNotifications(payload.type, current.items)
          showSummaryToast(finalSummary, {
            id: current.toastId,
            action: current.items[current.items.length - 1]?.action ?? current.items[0]?.action,
            pending: false,
          })
        }, GROUP_FLUSH_MS)
        return
      }
      const timer = setTimeout(() => {
        const current = groupedRef.current.get(groupKey)
        if (!current) return
        groupedRef.current.delete(groupKey)
        if (current.items.length <= 1) {
          showImmediateToast(current.items[0])
          return
        }
        const summary = summarizeGroupedNotifications(payload.type, current.items)
        showSummaryToast(summary, {
          id: current.toastId,
          action: current.items[current.items.length - 1]?.action ?? current.items[0]?.action,
          pending: false,
        })
      }, GROUP_FLUSH_MS)
      groupedRef.current.set(groupKey, { items: [payload], timer, toastId })
    },
    [showImmediateToast, showSummaryToast]
  )

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const stream = new EventSource("/api/notifications/stream")
    const grouped = groupedRef.current

    stream.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as UserNotificationEvent
        const type = (payload.type ?? "").trim().toLowerCase()
        if (!type || type === "connected" || type === "ping") {
          return
        }

        const dedupeKey = (payload.dedupe_key ?? "").trim()
        if (dedupeKey) {
          if (seenRef.current.has(dedupeKey)) {
            return
          }
          seenRef.current.add(dedupeKey)
        }

        setItems((prev) => {
          if (unreadOnly && payload.read_at) {
            return prev
          }
          const next = [payload, ...prev.filter((item) => item.id !== payload.id)]
          return next.slice(0, MAX_CACHE_ITEMS)
        })
        setUnreadCount((prev) => prev + (payload.read_at ? 0 : 1))
        enqueueToast(payload)
      } catch {
        // ignoramos payloads mal formados para no romper el stream global
      }
    }

    return () => {
      grouped.forEach((group) => clearTimeout(group.timer))
      grouped.clear()
      stream.close()
    }
  }, [enqueueToast, unreadOnly])

  const value = useMemo<NotificationsContextValue>(
    () => ({
      items,
      unreadCount,
      totalCount,
      loading,
      refresh,
      loadMore,
      hasMore: offset < totalCount,
      unreadOnly,
      levelFilter,
      markAsRead,
      markAllAsRead,
      hideItem,
    }),
    [
      hideItem,
      items,
      loading,
      markAllAsRead,
      markAsRead,
      refresh,
      loadMore,
      unreadCount,
      totalCount,
      offset,
      unreadOnly,
      levelFilter,
    ]
  )

  return (
    <NotificationsContext.Provider value={value}>
      {children}
      <Toaster position="bottom-right" richColors closeButton visibleToasts={2} />
    </NotificationsContext.Provider>
  )
}

export function useNotifications() {
  const context = useContext(NotificationsContext)
  if (!context) {
    throw new Error("useNotifications debe usarse dentro de GlobalNotificationsProvider")
  }
  return context
}
