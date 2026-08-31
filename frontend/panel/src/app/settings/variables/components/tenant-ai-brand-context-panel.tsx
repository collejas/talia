"use client"

import { ChangeEvent, FormEvent, useRef, useState } from "react"

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

type LogoAsset = { file_url?: string | null; nombre?: string | null }

export function TenantAiBrandContextPanel({ initialValues, initialLogoUrl = "" }: { initialValues: Partial<Values>; initialLogoUrl?: string | null }) {
  const [form, setForm] = useState(() => normalizeValues(initialValues))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl ?? "")
  const [logoUploading, setLogoUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  const uploadLogo = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setLogoUploading(true)
    setMessage(null)
    try {
      const uploadData = new FormData()
      uploadData.append("file", file, file.name || "logo.png")
      uploadData.append("nombre", "Logo de la organización")
      const uploadResponse = await fetch("/api/settings/logos", { method: "POST", body: uploadData })
      const uploadPayload = await uploadResponse.json() as LogoAsset & { error?: string }
      if (!uploadResponse.ok || !uploadPayload.file_url) {
        throw new Error(uploadPayload.error || "No se pudo cargar el logo.")
      }

      const saveResponse = await fetch("/api/settings/variables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logo_url: uploadPayload.file_url }),
      })
      if (!saveResponse.ok) {
        const savePayload = await saveResponse.json().catch(() => null) as { error?: string } | null
        throw new Error(savePayload?.error || "El logo se cargó, pero no se pudo asociar a la organización.")
      }
      setLogoUrl(uploadPayload.file_url)
      setMessage({ type: "success", text: "Logo de la organización guardado correctamente." })
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "No se pudo guardar el logo." })
    } finally {
      setLogoUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
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
        <section className="mb-8 space-y-4 rounded-lg border bg-muted/20 p-4">
          <div>
            <h3 className="font-medium">Logo de la organización</h3>
            <p className="text-sm text-muted-foreground">Carga una imagen para utilizarla en cotizaciones, correos y materiales comerciales.</p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-24 w-40 items-center justify-center rounded-md border bg-white p-3 dark:bg-background">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="Logo de la organización" className="max-h-full max-w-full object-contain" />
              ) : <span className="text-sm text-muted-foreground">Sin logo</span>}
            </div>
            <div className="space-y-2">
              <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(event) => void uploadLogo(event)} />
              <Button type="button" variant="outline" disabled={logoUploading} onClick={() => fileInputRef.current?.click()}>
                {logoUploading ? "Cargando…" : logoUrl ? "Cambiar logo" : "Cargar logo"}
              </Button>
              <p className="text-xs text-muted-foreground">Formatos permitidos: PNG, JPG, WEBP o SVG.</p>
            </div>
          </div>
        </section>
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
