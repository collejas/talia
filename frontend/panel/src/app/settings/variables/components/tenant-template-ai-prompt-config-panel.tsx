"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export type TemplateAiPromptConfig = {
  organizacion_id: string
  canal: "whatsapp" | "correo"
  prompt_id: string
  prompt_version: string
  activo: boolean
  actualizado_en?: string | null
}

type Props = { initialItems: TemplateAiPromptConfig[] }

function errorMessage(payload: unknown) {
  if (payload && typeof payload === "object" && "error" in payload) {
    const value = (payload as { error?: unknown }).error
    if (typeof value === "string" && value.trim()) return value
  }
  return "No se pudo guardar la configuración."
}

export function TenantTemplateAiPromptConfigPanel({ initialItems }: Props) {
  const [items, setItems] = useState(initialItems)
  const [saving, setSaving] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const update = (canal: TemplateAiPromptConfig["canal"], field: "prompt_id" | "prompt_version" | "activo", value: string | boolean) => {
    setItems((current) => current.map((item) => (item.canal === canal ? { ...item, [field]: value } : item)))
  }

  const save = async (item: TemplateAiPromptConfig) => {
    setSaving(item.canal)
    setMessage(null)
    try {
      const response = await fetch("/api/settings/variables/prospeccion-template-ai-prompts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(errorMessage(payload))
      setItems((current) => current.map((currentItem) => (currentItem.canal === item.canal ? payload : currentItem)))
      setMessage({ type: "success", text: `Prompt de ${item.canal === "whatsapp" ? "WhatsApp" : "correo"} guardado.` })
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : errorMessage(null) })
    } finally {
      setSaving(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Asistente IA para plantillas</CardTitle>
        <CardDescription>
          Configura los prompts publicados en OpenAI que utilizarán todas las organizaciones al crear plantillas de WhatsApp y correo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {message ? <p className={message.type === "error" ? "text-sm text-destructive" : "text-sm text-emerald-600"}>{message.text}</p> : null}
        <div className="grid gap-5 md:grid-cols-2">
          {(["whatsapp", "correo"] as const).map((canal) => {
            const item = items.find((candidate) => candidate.canal === canal)
            if (!item) return null
            const label = canal === "whatsapp" ? "WhatsApp" : "Correo"
            return (
              <div key={canal} className="space-y-4 rounded-lg border p-4">
                <div>
                  <h3 className="font-medium">Plantillas de {label}</h3>
                  <p className="text-sm text-muted-foreground">Identificador y versión del prompt de OpenAI.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`template-ai-${canal}-prompt-id`}>Prompt ID</Label>
                  <Input id={`template-ai-${canal}-prompt-id`} value={item.prompt_id} onChange={(event) => update(canal, "prompt_id", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`template-ai-${canal}-prompt-version`}>Versión</Label>
                  <Input id={`template-ai-${canal}-prompt-version`} value={item.prompt_version} onChange={(event) => update(canal, "prompt_version", event.target.value)} />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={item.activo} onChange={(event) => update(canal, "activo", event.target.checked)} />
                  Prompt activo
                </label>
                <Button type="button" onClick={() => void save(item)} disabled={saving !== null}>
                  {saving === canal ? "Guardando…" : "Guardar prompt"}
                </Button>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
