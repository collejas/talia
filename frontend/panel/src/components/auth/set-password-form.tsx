/* eslint-disable react-hooks/set-state-in-effect */
"use client"

import { useEffect, useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type SetPasswordFormProps = {
  accessToken: string
  type: string
}

function parseHashParams() {
  if (typeof window === "undefined") return { token: "", type: "" }
  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash
  if (!hash.length) return { token: "", type: "" }
  const params = new URLSearchParams(hash)
  return {
    token: params.get("access_token") || params.get("token") || "",
    type: params.get("type") || "",
  }
}

export function SetPasswordForm({ accessToken, type }: SetPasswordFormProps) {
  const [tokenValue, setTokenValue] = useState(accessToken)
  const [tokenType, setTokenType] = useState(type)
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (accessToken && type) return
    const { token, type: hashType } = parseHashParams()
    if (token && !tokenValue) {
      setTokenValue(token)
    }
    if (hashType && !tokenType) {
      setTokenType(hashType)
    }
  }, [accessToken, type, tokenType, tokenValue])

  const isTokenValid = Boolean(tokenValue) && (tokenType === "recovery" || tokenType === "invite")

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!isTokenValid) return
    if (password.length < 8) {
      setError("Tu contraseña debe tener al menos 8 caracteres.")
      return
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.")
      return
    }

    setError(null)
    setMessage(null)
    startTransition(async () => {
      const response = await fetch("/api/auth/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: tokenValue, password }),
      })
      const data = (await response.json()) as { ok?: boolean; error?: string }
      if (!response.ok || !data.ok) {
        setError(data.error || "No pudimos actualizar tu contraseña. Intenta nuevamente.")
        return
      }

      setMessage("¡Listo! Ya puedes iniciar sesión con tu nueva contraseña.")
      setPassword("")
      setConfirm("")
    })
  }

  if (!isTokenValid) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        El enlace de acceso no es válido o ya expiró. Solicita una nueva invitación.
      </div>
    )
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-1">
        <Label htmlFor="password">Contraseña nueva</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          minLength={8}
        />
        <p className="text-xs text-muted-foreground">
          Usa al menos 8 caracteres. Es recomendable combinar letras, números y símbolos.
        </p>
      </div>
      <div className="space-y-1">
        <Label htmlFor="confirm">Confirma tu contraseña</Label>
        <Input
          id="confirm"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          required
          minLength={8}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {message && <p className="text-sm text-emerald-600 dark:text-emerald-400">{message}</p>}
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Guardando..." : "Guardar contraseña"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Después de guardar, vuelve a la pantalla de inicio de sesión e ingresa con tu correo y la
        contraseña que acabas de definir.
      </p>
    </form>
  )
}
