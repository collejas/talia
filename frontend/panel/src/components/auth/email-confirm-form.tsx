"use client"

import { useEffect, useState, useTransition } from "react"

import { Button } from "@/components/ui/button"

type EmailConfirmFormProps = {
  token: string
}

function parseTokenFromHash() {
  if (typeof window === "undefined") return ""
  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash
  if (!hash.length) return ""
  const params = new URLSearchParams(hash)
  return params.get("token") || params.get("access_token") || ""
}

export function EmailConfirmForm({ token }: EmailConfirmFormProps) {
  const [tokenValue, setTokenValue] = useState(token)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (tokenValue) return
    const parsed = parseTokenFromHash()
    if (parsed) {
      setTokenValue(parsed)
    }
  }, [tokenValue])

  const handleConfirm = () => {
    if (!tokenValue) {
      setError("El enlace no es válido o ya expiró.")
      return
    }
    setError(null)
    setMessage(null)
    startTransition(async () => {
      const response = await fetch("/api/auth/confirm-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tokenValue }),
      })
      const data = (await response.json()) as { ok?: boolean; error?: string; email?: string }
      if (!response.ok || !data.ok) {
        setError(data.error || "No pudimos confirmar el correo.")
        return
      }
      setMessage(
        "Correo confirmado. Revisa tu bandeja de entrada para completar la invitación y crear tu contraseña.",
      )
    })
  }

  useEffect(() => {
    if (tokenValue) {
      handleConfirm()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenValue])

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {message && <p className="text-sm text-emerald-600 dark:text-emerald-400">{message}</p>}
      <Button type="button" className="w-full" disabled={isPending} onClick={handleConfirm}>
        {isPending ? "Confirmando..." : "Confirmar correo"}
      </Button>
    </div>
  )
}
