"use client"

export type NotificationItem = {
  id: string | null
  type: string
  level: "success" | "info" | "warning" | "error"
  title?: string | null
  message: string
  organizacion_id?: string | null
  user_id?: string | null
  entity?: { kind?: string | null; id?: string | null } | null
  action?: { label?: string | null; href?: string | null } | null
  meta?: Record<string, unknown>
  dedupe_key?: string | null
  group_key?: string | null
  read_at?: string | null
  created_at?: string | null
}

type NotificationsListResponse = {
  ok: boolean
  items: NotificationItem[]
  total: number
  limit: number
  offset: number
}

type UnreadCountResponse = {
  ok: boolean
  unread: number
}

async function parseJsonOrThrow(response: Response) {
  let data: unknown = null
  try {
    data = await response.json()
  } catch {
    data = null
  }
  if (!response.ok) {
    const detail =
      data && typeof data === "object" && "detail" in data && typeof data.detail === "string"
        ? data.detail
        : data && typeof data === "object" && "error" in data && typeof data.error === "string"
          ? data.error
          : `request_failed_${response.status}`
    throw new Error(detail)
  }
  return data
}

export async function fetchNotifications(params?: {
  limit?: number
  offset?: number
  unreadOnly?: boolean
  levels?: string[] | null
}): Promise<NotificationsListResponse> {
  const search = new URLSearchParams()
  if (typeof params?.limit === "number") search.set("limit", String(params.limit))
  if (typeof params?.offset === "number") search.set("offset", String(params.offset))
  if (params?.unreadOnly) search.set("unread_only", "true")
  if (params?.levels && params.levels.length) {
    for (const level of params.levels) {
      if (level) search.append("level", level)
    }
  }
  const suffix = search.size ? `?${search.toString()}` : ""
  const response = await fetch(`/api/notifications${suffix}`, {
    method: "GET",
    cache: "no-store",
    headers: { Accept: "application/json" },
  })
  return (await parseJsonOrThrow(response)) as NotificationsListResponse
}

export async function fetchNotificationsUnreadCount(): Promise<number> {
  const response = await fetch("/api/notifications/unread-count", {
    method: "GET",
    cache: "no-store",
    headers: { Accept: "application/json" },
  })
  const data = (await parseJsonOrThrow(response)) as UnreadCountResponse
  return Number(data.unread ?? 0)
}

export async function markNotificationRead(notificationId: string): Promise<NotificationItem> {
  const response = await fetch(`/api/notifications/${notificationId}/read`, {
    method: "POST",
    cache: "no-store",
    headers: { Accept: "application/json" },
  })
  const data = (await parseJsonOrThrow(response)) as { ok: boolean; item: NotificationItem }
  return data.item
}

export async function markAllNotificationsRead(): Promise<number> {
  const response = await fetch("/api/notifications/read-all", {
    method: "POST",
    cache: "no-store",
    headers: { Accept: "application/json" },
  })
  const data = (await parseJsonOrThrow(response)) as { ok: boolean; updated: number }
  return Number(data.updated ?? 0)
}

export async function hideNotification(notificationId: string): Promise<NotificationItem> {
  const response = await fetch(`/api/notifications/${notificationId}/hide`, {
    method: "POST",
    cache: "no-store",
    headers: { Accept: "application/json" },
  })
  const data = (await parseJsonOrThrow(response)) as { ok: boolean; item: NotificationItem }
  return data.item
}
