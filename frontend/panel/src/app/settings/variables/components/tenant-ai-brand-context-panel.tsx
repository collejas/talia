"use client"

import { FormEvent, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

type Values = {
  ia_descripcion_empresa: string
  ia_productos_servicios: string
  ia_publico_objetivo: string
  ia_propuesta_valor: string
  ia_diferenciadores: string
  ia_restricciones_comerciales: string
  ia_color_primario: string
  ia_color_secundario: string
  ia_color_acento: string
  ia_color_fondo: string
  ia_estilo_visual: string
  ia_radio_bordes: string
}

const EMPTY_VALUES: Values = {
  ia_descripcion_empresa: "",
  ia_productos_servicios: "",
  ia_publico_objetivo: "",
  ia_propuesta_valor: "",
  ia_diferenciadores: "",
  ia_restricciones_comerciales: "",
  ia_color_primario: "",
  ia_color_secundario: "",
  ia_color_acento: "",
  ia_color_fondo: "",
  ia_estilo_visual: "",
  ia_radio_bordes: "",
}

const COLORS: Array<{ key: keyof Values; label: string; fallback: string }> = [
  { key: "ia_color_primario", label: "Color primario", fallback: "#2563eb" },
  { key: "ia_color_secundario", label: "Color secundario", fallback: "#475569" },
  { key: "ia_color_acento", label: "Color de acento", fallback: "#2563eb" },
  { key: "ia_color_fondo", label: "Color de fondo", fallback: "#ffffff" },
]

function normalizeValues(values: Partial<Values>): Values {
  return { ...EMPTY_VALUES, ...values }
}

export function TenantAiBrandContextPanel({ initialValues }: { initialValues: Partial<Values> }) {
  const [form, setForm] = useState(() => normalizeValues(initialValues))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const update = (key: keyof Values, value: string) => setForm((current) => ({ ...current, [key]: value }))

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setMessage(null)
    try {
      const response = await fetch("/api/settings/variables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(typeof payload?.error === "string" ? payload.error : "No se pudo guardar la configuración")
      setForm((current) => ({ ...current, ...normalizeValues(payload) }))
      setMessage({ type: "success", text: "Contexto empresarial y sistema visual guardados." })
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "No se pudo guardar la configuración" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>Contexto empresarial y sistema visual</CardTitle>
          <Badge variant="secondary">Asistente IA</Badge>
        </div>
        <CardDescription>
          Estos datos se usan para personalizar las plantillas de correo y WhatsApp. El backend los envía a OpenAI únicamente para el tenant autenticado.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-8" onSubmit={submit}>
          <section className="space-y-4">
            <div>
              <h3 className="font-medium">Contexto empresarial</h3>
              <p className="text-sm text-muted-foreground">Describe el negocio para que la IA comunique una propuesta real y autorizada.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Descripción de la empresa" value={form.ia_descripcion_empresa} onChange={(value) => update("ia_descripcion_empresa", value)} maxLength={4000} multiline />
              <Field label="Productos y servicios" value={form.ia_productos_servicios} onChange={(value) => update("ia_productos_servicios", value)} maxLength={4000} multiline />
              <Field label="Público objetivo" value={form.ia_publico_objetivo} onChange={(value) => update("ia_publico_objetivo", value)} maxLength={3000} multiline />
              <Field label="Propuesta de valor" value={form.ia_propuesta_valor} onChange={(value) => update("ia_propuesta_valor", value)} maxLength={3000} multiline />
              <Field label="Diferenciadores" value={form.ia_diferenciadores} onChange={(value) => update("ia_diferenciadores", value)} maxLength={3000} multiline />
              <Field label="Restricciones comerciales" hint="Promesas, temas o afirmaciones que la IA debe evitar." value={form.ia_restricciones_comerciales} onChange={(value) => update("ia_restricciones_comerciales", value)} maxLength={3000} multiline />
            </div>
          </section>

          <section className="space-y-4 border-t pt-6">
            <div>
              <h3 className="font-medium">Sistema visual de marca</h3>
              <p className="text-sm text-muted-foreground">Los colores vacíos usan el fallback neutral oficial de Tal-IA.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {COLORS.map((color) => (
                <div className="space-y-2" key={color.key}>
                  <Label htmlFor={color.key}>{color.label}</Label>
                  <div className="flex gap-2">
                    <Input aria-label={`${color.label} selector`} className="h-10 w-12 cursor-pointer p-1" type="color" value={form[color.key] || color.fallback} onChange={(event) => update(color.key, event.target.value.toUpperCase())} />
                    <Input id={color.key} value={form[color.key]} placeholder={color.fallback} maxLength={7} onChange={(event) => update(color.key, event.target.value.toUpperCase())} />
                  </div>
                </div>
              ))}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Estilo visual" value={form.ia_estilo_visual} onChange={(value) => update("ia_estilo_visual", value)} placeholder="Tecnológico moderno, editorial sobrio..." maxLength={120} />
              <div className="space-y-2">
                <Label htmlFor="ia_radio_bordes">Radio de bordes</Label>
                <Input id="ia_radio_bordes" value={form.ia_radio_bordes} placeholder="12px" maxLength={8} onChange={(event) => update("ia_radio_bordes", event.target.value)} />
                <p className="text-xs text-muted-foreground">Ejemplos válidos: 0px, 8px, 12px, 1rem.</p>
              </div>
            </div>
          </section>

          {message ? <p className={message.type === "error" ? "text-sm text-destructive" : "text-sm text-emerald-600"}>{message.text}</p> : null}
          <div className="flex justify-end">
            <Button disabled={saving} type="submit">{saving ? "Guardando…" : "Guardar contexto y diseño"}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function Field({ label, hint, value, onChange, maxLength, placeholder, multiline = false }: { label: string; hint?: string; value: string; onChange: (value: string) => void; maxLength?: number; placeholder?: string; multiline?: boolean }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {multiline ? <Textarea value={value} maxLength={maxLength} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /> : <Input value={value} maxLength={maxLength} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}
