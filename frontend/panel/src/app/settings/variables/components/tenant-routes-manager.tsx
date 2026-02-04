"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { formatApiError } from "@/app/settings/variables/utils/format-error"

type RouteItem = {
  id?: string
  canal: string
  clave: string
}

type Props = {
  channel: string
  title: string
  description?: string
  placeholder?: string
  routes: RouteItem[]
}

export function TenantRoutesManager({ channel, title, description, placeholder, routes }: Props) {
  const router = useRouter()
  const [clave, setClave] = useState("")
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const filteredRoutes = routes.filter((route) => route.canal === channel)

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage(null)
    if (!clave.trim()) {
      setMessage({ type: "error", text: "Completa la clave antes de crear la ruta." })
      return
    }
    setLoading(true)
    try {
      const response = await fetch("/api/settings/variables/routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canal: channel, clave: clave.trim().toLowerCase() }),
      })
      const payload = await response.json()
      if (!response.ok) {
        const errorMessage =
          formatApiError((payload as { error?: unknown })?.error) ?? "No se pudo crear la ruta."
        throw new Error(errorMessage)
      }
      setMessage({ type: "success", text: "Ruta creada." })
      setClave("")
      router.refresh()
    } catch (err) {
      setMessage({ type: "error", text: (err as Error).message })
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (routeId?: string) => {
    if (!routeId) return
    setMessage(null)
    setLoading(true)
    try {
      const response = await fetch(`/api/settings/variables/routes/${routeId}`, {
        method: "DELETE",
      })
      const payload = await response.json()
      if (!response.ok) {
        const errorMessage =
          formatApiError((payload as { error?: unknown })?.error) ?? "No se pudo eliminar la ruta."
        throw new Error(errorMessage)
      }
      setMessage({ type: "success", text: "Ruta eliminada." })
      router.refresh()
    } catch (err) {
      setMessage({ type: "error", text: (err as Error).message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-border/60 bg-card/5 p-4">
      <div>
        <p className="text-sm font-medium">{title}</p>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>

      <form className="grid gap-3 md:grid-cols-2" onSubmit={handleCreate}>
        <div className="space-y-1">
          <Label htmlFor={`route-${channel}`}>Clave (alias / número / page_id)</Label>
          <Input
            id={`route-${channel}`}
            value={clave}
            onChange={(event) => setClave(event.target.value)}
            placeholder={placeholder ?? "Ej. cliente-x / +521..." }
            disabled={loading}
          />
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={loading}>
            {loading ? "Guardando..." : "Crear ruta"}
          </Button>
        </div>
      </form>

      {message ? (
        <p className={`text-sm ${message.type === "success" ? "text-emerald-600" : "text-destructive"}`}>
          {message.text}
        </p>
      ) : null}

      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground">Rutas registradas</p>
        {filteredRoutes.length === 0 ? (
          <p className="text-xs text-muted-foreground">No hay rutas para este canal.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {filteredRoutes.map((route) => (
              <Badge key={route.id ?? route.clave} variant="outline" className="flex items-center gap-2">
                <span className="font-mono text-xs">{route.clave}</span>
                {route.id ? (
                  <button
                    type="button"
                    className="rounded bg-destructive/10 px-2 py-0.5 text-xs text-destructive"
                    onClick={() => void handleDelete(route.id)}
                    disabled={loading}
                  >
                    Eliminar
                  </button>
                ) : null}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
