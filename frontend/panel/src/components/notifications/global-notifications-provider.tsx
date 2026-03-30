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
  loading: boolean
  refresh: () => Promise<void>
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
}

const INITIAL_LIMIT = 20
const GROUPABLE_TYPES = new Set(["scraper.finished", "lookup.finished"])

function summarizeGroupedNotifications(type: string, items: NotificationItem[]) {
  if (type === "scraper.finished") {
    const total = items.length
    const success = items.filter((item) => item.level === "success").length
    const error = items.filter((item) => item.level === "error").length
    const withEmails = items.filter((item) => Number(item.meta?.emails_total ?? 0) > 0).length
    const withoutEmails = success - withEmails
    return {
      title: "Lote de scraper terminado",
      description: `${total} eventos: ${withEmails} con correos, ${Math.max(withoutEmails, 0)} sin hallazgos, ${error} con error.`,
    }
  }
  if (type === "lookup.finished") {
    return {
      title: "Lote de verificacion terminado",
      description: `${items.length} eventos finalizados.`,
    }
  }
  return {
    title: "Notificaciones agrupadas",
    description: `${items.length} eventos nuevos.`,
  }
}

export function GlobalNotificationsProvider({ children }: GlobalNotificationsProviderProps) {
  const router = useRouter()
  const [items, setItems] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const seenRef = useRef<Set<string>>(new Set())
  const groupedRef = useRef<Map<string, BufferedGroup>>(new Map())

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [notifications, unread] = await Promise.all([
        fetchNotifications({ limit: INITIAL_LIMIT, offset: 0 }),
        fetchNotificationsUnreadCount(),
      ])
      setItems(notifications.items ?? [])
      setUnreadCount(unread)
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
  }, [])

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

  const enqueueToast = useCallback(
    (payload: NotificationItem) => {
      if (!GROUPABLE_TYPES.has(payload.type)) {
        showImmediateToast(payload)
        return
      }
      const group = groupedRef.current.get(payload.type)
      if (group) {
        group.items.push(payload)
        return
      }
      const timer = setTimeout(() => {
        const current = groupedRef.current.get(payload.type)
        if (!current) return
        groupedRef.current.delete(payload.type)
        if (current.items.length <= 1) {
          showImmediateToast(current.items[0])
          return
        }
        const summary = summarizeGroupedNotifications(payload.type, current.items)
        toast(summary.title, {
          description: summary.description,
          duration: 12000,
        })
      }, 3500)
      groupedRef.current.set(payload.type, { items: [payload], timer })
    },
    [showImmediateToast]
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
          const next = [payload, ...prev.filter((item) => item.id !== payload.id)]
          return next.slice(0, INITIAL_LIMIT)
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
  }, [enqueueToast])

  const value = useMemo<NotificationsContextValue>(
    () => ({
      items,
      unreadCount,
      loading,
      refresh,
      markAsRead,
      markAllAsRead,
      hideItem,
    }),
    [hideItem, items, loading, markAllAsRead, markAsRead, refresh, unreadCount]
  )

  return (
    <NotificationsContext.Provider value={value}>
      {children}
      <Toaster position="bottom-right" richColors closeButton />
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
