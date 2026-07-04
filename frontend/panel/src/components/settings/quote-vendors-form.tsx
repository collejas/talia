"use client"

import { useMemo, useState, type FormEvent } from "react"
import { IconPlus, IconTrash } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  buildQuoteVendorSettingsPayload,
  DEFAULT_QUOTE_VENDOR_SETTINGS,
  extractQuoteVendorSettings,
  type QuoteVendorSettings,
} from "@/lib/settings/quote-vendors"

type Props = {
  config: Record<string, unknown> | null
}

type SaveState = { type: "success" | "error"; message: string } | null

function createEmptyCondition() {
  return { subtitle: "", description: "" }
}

function normalizeFormSettings(config: Record<string, unknown> | null): QuoteVendorSettings {
  return extractQuoteVendorSettings(config ?? null)
}

export function QuoteVendorsForm({ config }: Props) {
  const initial = useMemo(() => normalizeFormSettings(config), [config])
  const [savedSettings, setSavedSettings] = useState(initial)
  const [conditionsTitle, setConditionsTitle] = useState(initial.conditionsTitle)
  const [conditions, setConditions] = useState(initial.conditions.length ? [...initial.conditions] : [createEmptyCondition()])
  const [notesTitle, setNotesTitle] = useState(initial.notesTitle)
  const [notesBody, setNotesBody] = useState(initial.notesBody)
  const [validityDays, setValidityDays] = useState(String(initial.validityDays))
  const [status, setStatus] = useState<SaveState>(null)
  const [saving, setSaving] = useState(false)

  const handleReset = () => {
    setConditionsTitle(savedSettings.conditionsTitle)
    setConditions(savedSettings.conditions.length ? [...savedSettings.conditions] : [createEmptyCondition()])
    setNotesTitle(savedSettings.notesTitle)
    setNotesBody(savedSettings.notesBody)
    setValidityDays(String(savedSettings.validityDays))
    setStatus({ type: "success", message: "Se restauraron los valores actuales del tenant." })
  }

  const handleAddCondition = () => {
    setConditions((current) => [...current, createEmptyCondition()])
  }

  const handleConditionChange = (index: number, field: keyof QuoteVendorSettings["conditions"][number], value: string) => {
    setConditions((current) =>
      current.map((item, position) => (position === index ? { ...item, [field]: value } : item)),
    )
  }

  const handleRemoveCondition = (index: number) => {
    setConditions((current) => {
      if (current.length <= 1) return [createEmptyCondition()]
      return current.filter((_, position) => position !== index)
    })
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setStatus(null)
    setSaving(true)
    try {
      const payload = buildQuoteVendorSettingsPayload({
        conditionsTitle,
        conditions,
        notesTitle,
        notesBody,
        validityDays: Number(validityDays),
      })
      const response = await fetch("/api/settings/variables/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: {
            quote_vendedores: payload,
          },
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof body?.error === "string" ? body.error : "No se pudo guardar la sección de cotizaciones.")
      }
      const nextSettings = extractQuoteVendorSettings((body as { config?: Record<string, unknown> | null }).config ?? null)
      setSavedSettings(nextSettings)
      setConditionsTitle(nextSettings.conditionsTitle)
      setConditions(nextSettings.conditions.length ? [...nextSettings.conditions] : [createEmptyCondition()])
      setNotesTitle(nextSettings.notesTitle)
      setNotesBody(nextSettings.notesBody)
      setValidityDays(String(nextSettings.validityDays))
      setStatus({ type: "success", message: "Cotizaciones Vendedores guardado correctamente." })
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "No se pudo guardar la sección de cotizaciones.",
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cotizaciones Vendedores</CardTitle>
        <CardDescription>
          Define la base de <span className="font-medium text-foreground">Condiciones comerciales</span> y
          <span className="font-medium text-foreground"> Notas</span> que alimentan las cotizaciones, además de la
          vigencia por defecto.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="quote-vendors-validity-days">Vigencia por defecto (días)</Label>
              <Input
                id="quote-vendors-validity-days"
                type="number"
                min={1}
                max={365}
                value={validityDays}
                onChange={(event) => setValidityDays(event.target.value)}
                placeholder={String(DEFAULT_QUOTE_VENDOR_SETTINGS.validityDays)}
              />
              <p className="text-xs text-muted-foreground">
                La cotización convertirá este contador en una fecha de vencimiento al generar el PDF.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="quote-vendors-conditions-title">Título de condiciones</Label>
              <Input
                id="quote-vendors-conditions-title"
                value={conditionsTitle}
                onChange={(event) => setConditionsTitle(event.target.value)}
                placeholder={DEFAULT_QUOTE_VENDOR_SETTINGS.conditionsTitle}
              />
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label className="text-sm font-medium">Subtítulos y descripciones</Label>
                  <p className="text-xs text-muted-foreground">
                    Cada elemento se convertirá en una línea del bloque de condiciones comerciales.
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" className="gap-1" onClick={handleAddCondition}>
                  <IconPlus className="size-4" />
                  Agregar
                </Button>
              </div>
              <div className="space-y-3">
                {conditions.map((item, index) => (
                  <div key={`quote-condition-${index}`} className="grid gap-3 rounded-md border border-border p-3 md:grid-cols-[220px_minmax(0,1fr)_auto]">
                    <div className="space-y-2">
                      <Label htmlFor={`quote-condition-subtitle-${index}`}>Subtítulo</Label>
                      <Input
                        id={`quote-condition-subtitle-${index}`}
                        value={item.subtitle}
                        onChange={(event) => handleConditionChange(index, "subtitle", event.target.value)}
                        placeholder="Vigencia"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`quote-condition-description-${index}`}>Descripción</Label>
                      <Textarea
                        id={`quote-condition-description-${index}`}
                        value={item.description}
                        onChange={(event) => handleConditionChange(index, "description", event.target.value)}
                        placeholder="Descripción breve de la condición."
                        rows={3}
                      />
                    </div>
                    <div className="flex items-end md:justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground"
                        onClick={() => handleRemoveCondition(index)}
                        disabled={conditions.length <= 1}
                      >
                        <IconTrash className="size-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="quote-vendors-notes-title">Título de notas</Label>
              <Input
                id="quote-vendors-notes-title"
                value={notesTitle}
                onChange={(event) => setNotesTitle(event.target.value)}
                placeholder={DEFAULT_QUOTE_VENDOR_SETTINGS.notesTitle}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quote-vendors-notes-body">Texto de notas</Label>
              <Textarea
                id="quote-vendors-notes-body"
                value={notesBody}
                onChange={(event) => setNotesBody(event.target.value)}
                rows={4}
                placeholder="Notas que se precargarán en el modal de cotización."
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">
              La cotización tomará esta base y el vendedor podrá cambiarla en el modal.
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={handleReset} disabled={saving}>
                Restablecer
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Guardando..." : "Guardar cotizaciones"}
              </Button>
            </div>
          </div>

          {status ? (
            <p
              className={`rounded-md border px-3 py-2 text-sm ${
                status.type === "success"
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200"
                  : "border-destructive/40 bg-destructive/10 text-destructive"
              }`}
            >
              {status.message}
            </p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  )
}
