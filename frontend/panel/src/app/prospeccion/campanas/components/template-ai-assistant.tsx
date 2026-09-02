"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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

type LayoutItem = {
  codigo: string
  nombre: string
  descripcion: string
  predeterminado: boolean
  logo_ancho_px?: number
}

type ImageAsset = {
  id: string
  nombre: string
  file_url: string
}

type ImageSlot = {
  key: string
  label: string
}

type WhatsAppRule = {
  id: string
  nombre_regla?: string | null
  frase_objetivo?: string | null
}

export type TemplateAiDraft = {
  nombre_sugerido: string
  descripcion: string
  cuerpo_texto: string
  variables_usadas: string[]
  advertencias: string[]
  estilo_diseno?: string
  asunto?: string
  cuerpo_html?: string
  meta_category_sugerida?: string
  language_code_sugerido?: string
}

type Props = {
  canal: Channel
  campanaId: string | null
  variableValues?: Record<string, string>
  assets?: ImageAsset[]
  imageSlots?: ImageSlot[]
  selectedImages?: Record<string, string | undefined>
  onImageSelectionChange?: (slotKey: string, assetId?: string) => void
  whatsappRules?: WhatsAppRule[]
  whatsappRulesLoading?: boolean
  selectedWhatsappRuleId?: string
  onWhatsappRuleChange?: (ruleId: string) => void
  websiteBaseUrl?: string
  customUrl?: string
  onCustomUrlChange?: (value: string) => void
  onApply: (draft: TemplateAiDraft) => void
}

const EMPTY_VARIABLE_VALUES: Record<string, string> = {}
const VARIABLE_DEPENDENCIES: Record<string, string[]> = {
  booking_link_text: ["booking_url"],
}
const IMAGE_VARIABLE_KEYS = new Set([
  "logo_url",
  "hero_image_url",
  "product_image_1_url",
  "product_image_2_url",
  "product_image_3_url",
  "product_image_4_url",
  "warranty_image_url",
])
const HIDDEN_VARIABLE_KEYS = new Set(["canal_origen", "email", "telefono", "tracking_url"])
const LINK_VARIABLE_KEYS = new Set(["whatsapp_url", "custom_url"])

function formatTemplateAiError(value: string) {
  if (value.startsWith("html_tag_not_allowed:")) {
    const tagName = value.slice("html_tag_not_allowed:".length).trim()
    return tagName
      ? `La IA generó una etiqueta HTML no permitida: <${tagName}>.`
      : "La IA generó una etiqueta HTML no permitida."
  }
  return value
}

function payloadError(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "error" in payload) {
    const value = (payload as { error?: unknown }).error
    if (typeof value === "string" && value.trim()) {
      return formatTemplateAiError(value)
    }
  }
  return fallback
}

export function TemplateAiAssistant({ canal, campanaId, variableValues = EMPTY_VARIABLE_VALUES, assets = [], imageSlots = [], selectedImages = {}, onImageSelectionChange, whatsappRules = [], whatsappRulesLoading = false, selectedWhatsappRuleId = "", onWhatsappRuleChange, websiteBaseUrl = "", customUrl = "", onCustomUrlChange, onApply }: Props) {
  const [variables, setVariables] = useState<VariableItem[]>([])
  const [layouts, setLayouts] = useState<LayoutItem[]>([])
  const [designStyle, setDesignStyle] = useState("automatico")
  const [selected, setSelected] = useState<string[]>([])
  const [instruction, setInstruction] = useState("")
  const [loadingVariables, setLoadingVariables] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [step, setStep] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    setLoadingVariables(true)
    setError(null)
    setSelected([])
    setDesignStyle("automatico")
    setStep(0)
    void fetch(`/api/prospeccion/plantillas/ai?canal=${encodeURIComponent(canal)}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json()
        if (!response.ok) throw new Error(payloadError(payload, "No se pudo cargar el catálogo de variables."))
        return payload
      })
      .then((payload) => {
        if (!cancelled) {
          setVariables(Array.isArray(payload?.items) ? (payload.items as VariableItem[]) : [])
          setLayouts(canal === "correo" && Array.isArray(payload?.layouts) ? (payload.layouts as LayoutItem[]) : [])
        }
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
  const contentVariables = useMemo(
    () => variables.filter((variable) => !IMAGE_VARIABLE_KEYS.has(variable.clave) && !HIDDEN_VARIABLE_KEYS.has(variable.clave)),
    [variables],
  )
  const selectedLinksConfigured = selected.every((key) => !LINK_VARIABLE_KEYS.has(key) || Boolean(variableValues[key]?.trim()))

  useEffect(() => {
    setSelected((current) =>
      current.filter((key) => LINK_VARIABLE_KEYS.has(key) || !(Object.hasOwn(variableValues, key) && !variableValues[key]?.trim())),
    )
  }, [variableValues])

  const toggleVariable = (clave: string) => {
    if (HIDDEN_VARIABLE_KEYS.has(clave)) return
    setSelected((current) => {
      if (current.includes(clave)) {
        return current.filter(
          (item) => item !== clave && !(VARIABLE_DEPENDENCIES[item] ?? []).includes(clave),
        )
      }
      return [...current, clave, ...(VARIABLE_DEPENDENCIES[clave] ?? [])].filter(
        (item, index, items) => items.indexOf(item) === index,
      )
    })
  }

  const resolveSelectedImages = (html: string | undefined) => {
    if (!html) return html
    return imageSlots.reduce((result, slot) => {
      const assetId = selectedImages[slot.key]
      const asset = assets.find((item) => item.id === assetId)
      return asset ? result.replaceAll(`{{${slot.key}}}`, asset.file_url) : result
    }, html)
  }

  const generate = async () => {
    setError(null)
    setWarning([])
    const selectedContentVariables = selected.filter((key) => !IMAGE_VARIABLE_KEYS.has(key) && !HIDDEN_VARIABLE_KEYS.has(key))
    if (selectedContentVariables.length === 0) {
      setError("Selecciona al menos una variable para generar la plantilla.")
      return
    }
    if (!selectedLinksConfigured) {
      setError("Configura el CTA o la página del enlace seleccionado antes de continuar.")
      return
    }
    if (instruction.trim().length < 10) {
      setError("Escribe una instrucción de al menos 10 caracteres.")
      return
    }
    setGenerating(true)
    let generationIdForLog: string | undefined
    let generationStatusForLog: string | undefined
    try {
      const response = await fetch("/api/prospeccion/plantillas/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canal,
          campana_id: campanaId,
          variables_seleccionadas: selectedContentVariables,
          marcadores_imagenes_seleccionados: imageSlots.filter((slot) => selectedImages[slot.key]).map((slot) => slot.key),
          instruccion_usuario: instruction.trim(),
          tono: "profesional",
          idioma: "es-MX",
          estilo_diseno: canal === "correo" ? designStyle : "automatico",
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payloadError(payload, "No se pudo iniciar la generación."))
      const generationId = payload?.generation_id as string | undefined
      generationIdForLog = generationId
      if (!generationId) throw new Error("La respuesta no contiene el identificador de generación.")
      let resultPayload: { status?: string; error?: string; resultado?: TemplateAiDraft } = payload
      for (;;) {
        await new Promise((resolve) => window.setTimeout(resolve, 2000))
        const statusResponse = await fetch(`/api/prospeccion/plantillas/ai/generations/${encodeURIComponent(generationId)}`, { cache: "no-store" })
        const statusPayload = await statusResponse.json()
        if (!statusResponse.ok) throw new Error(payloadError(statusPayload, "No se pudo consultar la generación."))
        resultPayload = statusPayload
        generationStatusForLog = statusPayload?.status
        if (statusPayload?.status === "generada" || statusPayload?.status === "error" || statusPayload?.status === "respuesta_invalida") break
      }
      if (resultPayload.status !== "generada") {
        throw new Error(formatTemplateAiError(resultPayload.error || "La generación no produjo una plantilla válida."))
      }
      const draft = resultPayload.resultado as TemplateAiDraft | undefined
      if (!draft) throw new Error("La respuesta no contiene un borrador válido.")
      const resolveConfiguredVariables = (value: string | undefined) => {
        if (!value) return value
        return Object.entries(variableValues).reduce(
          (resolved, [key, configuredValue]) =>
            configuredValue.trim() ? resolved.replaceAll(`{{${key}}}`, configuredValue.trim()) : resolved,
          value,
        )
      }
      const resolvedDraft: TemplateAiDraft = {
        ...draft,
        asunto: resolveConfiguredVariables(draft.asunto),
        cuerpo_texto: resolveConfiguredVariables(draft.cuerpo_texto) ?? "",
        cuerpo_html: resolveSelectedImages(resolveConfiguredVariables(draft.cuerpo_html)),
      }
      if (canal === "correo" && typeof resolvedDraft.estilo_diseno === "string" && resolvedDraft.estilo_diseno.trim()) {
        setDesignStyle(resolvedDraft.estilo_diseno.trim())
      }
      setWarning(Array.isArray(resolvedDraft.advertencias) ? resolvedDraft.advertencias : [])
      onApply(resolvedDraft)
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "No se pudo generar el borrador."
      console.error("[TemplateAiAssistant] Error al generar plantilla", {
        canal,
        paso: step,
        generation_id: generationIdForLog,
        estado: generationStatusForLog,
        error: message,
      })
      setError(message)
    } finally {
      setGenerating(false)
    }
  }

  const maxStep = canal === "correo" ? 3 : 1
  const canContinue = step === 0
    ? selected.some((key) => !IMAGE_VARIABLE_KEYS.has(key) && !HIDDEN_VARIABLE_KEYS.has(key)) && selectedLinksConfigured
    : step < maxStep || instruction.trim().length >= 10

  const nextStep = () => {
    if (step === 0 && !selected.some((key) => !IMAGE_VARIABLE_KEYS.has(key) && !HIDDEN_VARIABLE_KEYS.has(key))) {
      setError("Selecciona al menos una variable para continuar.")
      return
    }
    if (step === 0 && !selectedLinksConfigured) {
      setError("Configura el CTA o la página del enlace seleccionado antes de continuar.")
      return
    }
    setError(null)
    setStep((current) => Math.min(maxStep, current + 1))
  }

  const previousStep = () => {
    setError(null)
    setStep((current) => Math.max(0, current - 1))
  }

  const stepLabels = canal === "correo"
    ? ["Variables", "Imágenes", "Estilo", "Prompt"]
    : ["Variables", "Prompt"]

  return (
    <section className="rounded-xl border border-violet-200 bg-violet-50/70 p-4">
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-950">Asistente IA</p>
        <p className="mt-1 text-sm font-medium text-violet-950">Paso {step + 1} de {stepLabels.length}: {stepLabels[step]}</p>
        <div className="mt-3 grid gap-1" style={{ gridTemplateColumns: `repeat(${stepLabels.length}, minmax(0, 1fr))` }}>
          {stepLabels.map((label, index) => (
            <button key={label} type="button" className="group h-5 disabled:cursor-default" onClick={() => { if (index < step) { setError(null); setStep(index) } }} disabled={index >= step} aria-label={`Ir al paso ${index + 1}: ${label}`}>
              <span className={`block h-1 rounded-full transition-colors ${index <= step ? "bg-violet-600" : "bg-violet-200"} ${index < step ? "group-hover:bg-violet-800" : ""}`} />
              <span className={`mt-1 block truncate text-[10px] ${index === step ? "font-semibold text-violet-950" : "text-muted-foreground"}`}>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {loadingVariables ? <p className="text-xs text-muted-foreground">Cargando variables...</p> : null}
      {!loadingVariables && !contentVariables.length ? <p className="text-xs text-amber-700">No hay variables de contenido disponibles para este canal.</p> : null}

      {step === 0 ? (
        <div>
          <p className="mb-3 text-xs text-muted-foreground">Selecciona los datos del prospecto que podrá usar la plantilla.</p>
          {contentVariables.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {contentVariables.map((variable) => (
                <div key={variable.clave} className="rounded-md border bg-background/80 px-2.5 py-2 text-xs">
                  <label className="flex cursor-pointer items-start gap-2 has-disabled:cursor-not-allowed has-disabled:opacity-50">
                  <input type="checkbox" className="mt-0.5" checked={selectedSet.has(variable.clave)} disabled={!LINK_VARIABLE_KEYS.has(variable.clave) && Object.hasOwn(variableValues, variable.clave) && !variableValues[variable.clave]?.trim()} onChange={() => toggleVariable(variable.clave)} />
                  <span>
                    <span className="block font-medium">{variable.etiqueta}</span>
                    {variable.descripcion ? <span className="block text-[10px] text-muted-foreground">{variable.descripcion}</span> : null}
                    {!LINK_VARIABLE_KEYS.has(variable.clave) && Object.hasOwn(variableValues, variable.clave) && !variableValues[variable.clave]?.trim() ? <span className="block text-[10px] text-amber-700">Configura primero este enlace.</span> : null}
                  </span>
                  </label>
                  {variable.clave === "whatsapp_url" && selectedSet.has(variable.clave) ? (
                    <div className="mt-2 space-y-1 pl-5" onClick={(event) => event.stopPropagation()}>
                      <Label htmlFor="template-ai-whatsapp-cta" className="text-[10px]">CTA de WhatsApp</Label>
                      <select id="template-ai-whatsapp-cta" className="h-8 w-full rounded-md border bg-background px-2 text-[11px]" value={selectedWhatsappRuleId} onChange={(event) => onWhatsappRuleChange?.(event.target.value)}>
                        <option value="">{whatsappRulesLoading ? "Cargando CTAs..." : "Selecciona un CTA"}</option>
                        {whatsappRules.map((rule) => <option key={rule.id} value={rule.id}>{rule.nombre_regla || rule.frase_objetivo || "CTA de WhatsApp"}</option>)}
                      </select>
                      <p className="text-[10px] text-muted-foreground">La frase seleccionada se conservará para atribuir el origen en WhatsApp.</p>
                    </div>
                  ) : null}
                  {variable.clave === "custom_url" && selectedSet.has(variable.clave) ? (
                    <div className="mt-2 space-y-1 pl-5" onClick={(event) => event.stopPropagation()}>
                      <Label htmlFor="template-ai-custom-url" className="text-[10px]">Página del sitio</Label>
                      <Input id="template-ai-custom-url" value={customUrl} onChange={(event) => onCustomUrlChange?.(event.target.value)} placeholder="/servicios o https://..." className="h-8 text-[11px]" />
                      <p className="text-[10px] text-muted-foreground">Puedes indicar una ruta interna del sitio{websiteBaseUrl ? ` (${websiteBaseUrl})` : ""}. El enlace recibirá seguimiento UTM.</p>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {canal === "correo" && step === 1 ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Selecciona las fotos que quieres incluir y define para qué se usará cada una.</p>
          {!assets.length ? <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">No hay imágenes disponibles. Puedes continuar y agregarlas después.</p> : null}
          {imageSlots.map((slot) => (
            <div key={slot.key} className="grid gap-2 rounded-md border bg-background/80 p-2 sm:grid-cols-[1fr_110px] sm:items-center">
              <div className="flex min-w-0 items-center gap-2">
                {selectedImages[slot.key] ? <Image src={assets.find((asset) => asset.id === selectedImages[slot.key])?.file_url ?? ""} alt="" width={40} height={40} unoptimized className="size-10 rounded object-contain" /> : <div className="size-10 rounded bg-muted" />}
                <span className="text-xs font-medium">{slot.label}</span>
              </div>
              <select className="h-9 rounded-md border bg-background px-2 text-xs" value={selectedImages[slot.key] ?? ""} onChange={(event) => onImageSelectionChange?.(slot.key, event.target.value || undefined)}>
                <option value="">Sin imagen</option>
                {assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.nombre}</option>)}
              </select>
            </div>
          ))}
        </div>
      ) : null}

      {canal === "correo" && step === 2 ? (
        <div className="space-y-2">
          <Label htmlFor="template-ai-design-style">Estilo de diseño</Label>
          <select id="template-ai-design-style" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm" value={designStyle} onChange={(event) => setDesignStyle(event.target.value)}>
            <option value="automatico">Automático</option>
            {layouts.map((layout) => <option key={layout.codigo} value={layout.codigo}>{layout.nombre}{layout.predeterminado ? " · predeterminado" : ""}</option>)}
          </select>
          <p className="text-xs text-muted-foreground">El estilo define la composición; los colores y el logo provienen del sistema visual de marca.</p>
        </div>
      ) : null}

      {((canal === "correo" && step === 3) || (canal !== "correo" && step === 1)) ? (
        <div className="space-y-2">
          <Label htmlFor="template-ai-instruction">Prompt para el asistente</Label>
          <Textarea id="template-ai-instruction" rows={6} value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder="Crea un primer contacto breve, consultivo y orientado a conseguir una reunión." />
          <p className="text-xs text-muted-foreground">Describe el objetivo, el público y el mensaje que quieres comunicar.</p>
        </div>
      ) : null}

      {error ? <p className="mt-3 text-xs text-destructive">{error}</p> : null}
      {warning.length ? <p className="mt-3 text-xs text-amber-700">Revisa las advertencias del borrador antes de guardarlo.</p> : null}
      <div className="mt-4 flex justify-between gap-2">
        <Button type="button" variant="outline" onClick={previousStep} disabled={step === 0 || generating}>Atrás</Button>
        {step < maxStep ? <Button type="button" onClick={nextStep} disabled={loadingVariables || !canContinue}>Continuar</Button> : <Button type="button" onClick={() => void generate()} disabled={generating || loadingVariables || !canContinue}>{generating ? "Generando borrador..." : "Generar plantilla"}</Button>}
      </div>
    </section>
  )
}
