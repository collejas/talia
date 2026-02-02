"use client"

import { FormEvent, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"

type TenantScopedSettings = {
  organizacion_id: string
  nombre: string
  razon_social?: string | null
  dominio_principal?: string | null
  rfc?: string | null
  pais?: string | null
  estado?: string | null
  ciudad?: string | null
  telefono?: string | null
  sitio_web?: string | null
  estado_onboarding?: string | null
  activo?: boolean | null
  config?: Record<string, unknown> | null
  routes: Array<{ id?: string; canal: string; clave: string }>
}

export function TenantVariablesPanel({
  data,
  error,
}: {
  data: TenantScopedSettings | null
  error?: string | null
}) {
  const [form, setForm] = useState(() => ({
    nombre: data?.nombre ?? "",
    razon_social: data?.razon_social ?? "",
    dominio_principal: data?.dominio_principal ?? "",
    rfc: data?.rfc ?? "",
    pais: data?.pais ?? "",
    estado: data?.estado ?? "",
    ciudad: data?.ciudad ?? "",
    telefono: data?.telefono ?? "",
    sitio_web: data?.sitio_web ?? "",
    estado_onboarding: data?.estado_onboarding ?? "pendiente",
  }))
  const [message, setMessage] = useState<
    { type: "success" | "error"; text: string } | null
  >(null)
  const [loading, setLoading] = useState(false)

  const routeSummary = useMemo(() => {
    if (!data) return []
    return data.routes.map((route) => `${route.canal}:${route.clave}`)
  }, [data])

  const handleChange = (field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage(null)
    setLoading(true)
    try {
      const response = await fetch("/api/settings/variables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || "No se pudo actualizar el tenant")
      }
      setMessage({ type: "success", text: "Cambios guardados" })
      setForm((prev) => ({ ...prev, ...payload }))
    } catch (err) {
      setMessage({ type: "error", text: (err as Error).message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Variables del tenant</CardTitle>
        <CardDescription>
          Configura los datos organizacionales que puedes modificar desde tu
          cuenta.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="variables-nombre">Nombre</Label>
              <Input
                id="variables-nombre"
                value={form.nombre}
                onChange={(event) => handleChange("nombre", event.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="variables-razon">Razón social</Label>
              <Input
                id="variables-razon"
                value={form.razon_social}
                onChange={(event) =>
                  handleChange("razon_social", event.target.value)
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="variables-dominio">Dominio principal</Label>
              <Input
                id="variables-dominio"
                value={form.dominio_principal}
                onChange={(event) =>
                  handleChange("dominio_principal", event.target.value)
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="variables-rfc">RFC</Label>
              <Input
                id="variables-rfc"
                value={form.rfc}
                onChange={(event) => handleChange("rfc", event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="variables-pais">País</Label>
              <Input
                id="variables-pais"
                value={form.pais}
                onChange={(event) => handleChange("pais", event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="variables-estado">Estado</Label>
              <Input
                id="variables-estado"
                value={form.estado}
                onChange={(event) => handleChange("estado", event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="variables-ciudad">Ciudad</Label>
              <Input
                id="variables-ciudad"
                value={form.ciudad}
                onChange={(event) => handleChange("ciudad", event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="variables-telefono">Teléfono</Label>
              <Input
                id="variables-telefono"
                value={form.telefono}
                onChange={(event) =>
                  handleChange("telefono", event.target.value)
                }
                placeholder="+521234567890"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="variables-sitio">Sitio web</Label>
              <Input
                id="variables-sitio"
                value={form.sitio_web}
                onChange={(event) =>
                  handleChange("sitio_web", event.target.value)
                }
                placeholder="https://cliente.com"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="variables-onboarding">
                Estado de onboarding
              </Label>
              <Select
                onValueChange={(value) =>
                  handleChange("estado_onboarding", value)
                }
                value={form.estado_onboarding}
              >
                <SelectTrigger id="variables-onboarding">
                  <SelectValue placeholder="Selecciona" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendiente">Pendiente</SelectItem>
                  <SelectItem value="en_progreso">En progreso</SelectItem>
                  <SelectItem value="completado">Completado</SelectItem>
                  <SelectItem value="pausado">Pausado</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {message && (
            <p
              className={`text-sm ${
                message.type === "success" ? "text-emerald-600" : "text-destructive"
              }`}
            >
              {message.text}
            </p>
          )}
          <div className="flex justify-between">
            <p className="text-xs text-muted-foreground">
              {data?.activo ? "Organización activa" : "Organización desactivada"}
            </p>
            <Button type="submit" disabled={loading}>
              {loading ? "Guardando…" : "Guardar variables"}
            </Button>
          </div>
        </form>
        {routeSummary.length ? (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-semibold">Rutas registradas</p>
            <div className="flex flex-wrap gap-2">
              {routeSummary.map((route) => (
                <Badge key={route} variant="outline">
                  {route}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
