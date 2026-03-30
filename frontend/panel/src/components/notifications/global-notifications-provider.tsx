"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Toaster, toast } from "sonner"

type UserNotificationEvent = {
  type?: string
  level?: "success" | "error" | "info" | "warning"
  title?: string
  message?: string
  dedupe_key?: string
  action?: {
    label?: string
    href?: string
  } | null
}

type GlobalNotificationsProviderProps = {
  children: React.ReactNode
}

export function GlobalNotificationsProvider({ children }: GlobalNotificationsProviderProps) {
  const router = useRouter()
  const seenRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const stream = new EventSource("/api/notifications/stream")

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

        switch (payload.level) {
          case "success":
            toast.success(title, { description: message || undefined, ...toastOptions })
            break
          case "warning":
            toast.warning(title, { description: message || undefined, ...toastOptions })
            break
          case "error":
            toast.error(title, { description: message || undefined, ...toastOptions })
            break
          default:
            toast(title, { description: message || undefined, ...toastOptions })
            break
        }
      } catch {
        // ignoramos payloads mal formados para no romper el stream global
      }
    }

    return () => {
      stream.close()
    }
  }, [router])

  return (
    <>
      {children}
      <Toaster position="bottom-right" richColors closeButton />
    </>
  )
}
