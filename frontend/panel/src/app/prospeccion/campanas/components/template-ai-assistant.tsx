"use client"

import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

type Channel = "correo" | "whatsapp"

type VariableItem = {
  clave: string
  etiqueta: string
  descripcion: string
  tipo_dato: string
  permite_asunto: boolean
  permite_cuerpo_texto: boolean
  permite_cuerpo_html: boolean
  permite_header_media: boolean
}

export type TemplateAiDraft = {
  nombre_sugerido: string
  descripcion: string
  cuerpo_texto: string
  variables_usadas: string[]
  advertencias: string[]
  asunto?: string
  cuerpo_html?: string
  meta_category_sugerida?: string
  language_code_sugerido?: string
}

type Props = {
  canal: Channel
  campanaId: string | null
  onApply: (draft: TemplateAiDraft) => void
}

function payloadError(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "error" in payload) {
    const value = (payload as { error?: unknown }).error
    if (typeof value === "string" && value.trim()) return value
  }
  return fallback
}

export function TemplateAiAssistant({ canal, campanaId, onApply }: Props) {
  const [variables, setVariables] = useState<VariableItem[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [instruction, setInstruction] = useState("")
  const [loadingVariables, setLoadingVariables] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    setLoadingVariables(true)
    setError(null)
    setSelected([])
    void fetch(`/api/prospeccion/plantillas/ai?canal=${encodeURIComponent(canal)}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json()
        if (!response.ok) throw new Error(payloadError(payload, "No se pudo cargar el catálogo de variables."))
        return payload
      })
      .then((payload) => {
        if (!cancelled) setVariables(Array.isArray(payload?.items) ? (payload.items as VariableItem[]) : [])
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "No se pudo cargar el catálogo de variables.")
      })
      .finally(() => {
        if (!cancelled) setLoadingVariables(false)
      })
    return () => {
      cancelled = true
    }
  }, [canal])

  const selectedSet = useMemo(() => new Set(selected), [selected])

  const toggleVariable = (clave: string) => {
    setSelected((current) => (current.includes(clave) ? current.filter((item) => item !== clave) : [...current, clave]))
  }

  const generate = async () => {
    setError(null)
    setWarning([])
    if (selected.length === 0) {
      setError("Selecciona al menos una variable para generar la plantilla.")
      return
    }
    if (instruction.trim().length < 10) {
      setError("Escribe una instrucción de al menos 10 caracteres.")
      return
    }
    setGenerating(true)
    try {
      const response = await fetch("/api/prospeccion/plantillas/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canal,
          campana_id: campanaId,
          variables_seleccionadas: selected,
          instruccion_usuario: instruction.trim(),
          tono: "profesional",
          idioma: "es-MX",
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payloadError(payload, "No se pudo generar el borrador."))
      const draft = payload?.resultado as TemplateAiDraft | undefined
      if (!draft) throw new Error("La respuesta no contiene un borrador válido.")
      setWarning(Array.isArray(draft.advertencias) ? draft.advertencias : [])
      onApply(draft)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo generar el borrador.")
    } finally {
      setGenerating(false)
    }
  }

  return (
    <section className="rounded-xl border border-violet-200 bg-violet-50/70 p-3">
      <div className="mb-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-950">Asistente IA</p>
        <p className="mt-1 text-[11px] leading-4.5 text-violet-900">
          Selecciona las variables que podrá utilizar y describe el borrador que quieres revisar.
        </p>
      </div>
      {loadingVariables ? <p className="text-xs text-muted-foreground">Cargando variables...</p> : null}
      {!loadingVariables && !variables.length ? <p className="text-xs text-amber-700">No hay variables disponibles para este canal.</p> : null}
      {variables.length ? (
        <div className="mb-3 grid gap-1.5 sm:grid-cols-2">
          {variables.map((variable) => (
            <label key={variable.clave} className="flex cursor-pointer items-start gap-2 rounded-md border bg-background/80 px-2 py-1.5 text-[11px]">
              <input type="checkbox" checked={selectedSet.has(variable.clave)} onChange={() => toggleVariable(variable.clave)} />
              <span>
                <span className="block font-medium">{variable.etiqueta}</span>
                <span className="block text-[10px] text-muted-foreground">{`{{${variable.clave}}}`} · {variable.tipo_dato}</span>
              </span>
            </label>
          ))}
        </div>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor="template-ai-instruction">Instrucción para el asistente</Label>
        <Textarea
          id="template-ai-instruction"
          rows={3}
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          placeholder="Crea un primer contacto breve, consultivo y orientado a conseguir una reunión."
        />
      </div>
      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
      {warning.length ? <p className="mt-2 text-xs text-amber-700">Revisa las advertencias del borrador antes de guardarlo.</p> : null}
      <Button type="button" className="mt-3" onClick={() => void generate()} disabled={generating || loadingVariables}>
        {generating ? "Generando borrador..." : "Generar borrador"}
      </Button>
    </section>
  )
}
