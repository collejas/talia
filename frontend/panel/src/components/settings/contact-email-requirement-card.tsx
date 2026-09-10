"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { usePermissions } from "@/hooks/use-permissions"

export function ContactEmailRequirementCard({ initialRequired = true }: { initialRequired?: boolean }) {
  const { context } = usePermissions()
  const canManage = context.es_admin || context.es_owner || context.permisos.some((permission) => permission.toLowerCase() === "settings.manage")
  const [required, setRequired] = useState(initialRequired)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const save = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const response = await fetch("/api/settings/variables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ correo_contacto_obligatorio: required }),
      })
      const body = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(body.error || "No se pudo guardar la regla de contactos.")
      setMessage("Configuración guardada.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo guardar la configuración.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Requisitos de contactos</CardTitle>
        <CardDescription>Define si el correo electrónico debe capturarse al crear, editar o importar contactos.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-4"
            checked={required}
            disabled={!canManage || saving}
            onChange={(event) => setRequired(event.target.checked)}
          />
          <span>
            <span className="font-medium">Solicitar correo electrónico</span>
            <span className="block text-xs text-muted-foreground">Si se desactiva, los contactos pueden conservarse sin correo.</span>
          </span>
        </label>
        {canManage ? <Button type="button" size="sm" onClick={() => void save()} disabled={saving}>{saving ? "Guardando…" : "Guardar configuración"}</Button> : <p className="text-xs text-muted-foreground">Requiere el permiso settings.manage.</p>}
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </CardContent>
    </Card>
  )
}
