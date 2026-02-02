"use client"

import { useEffect, useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Toggle } from "@/components/ui/toggle"
import { TenantScopedSettings } from "@/app/settings/variables/components/tenant-variables-panel"

type FeatureConfig = Record<string, Record<string, unknown> | null>

type SummaryItem = { label: string; value?: unknown }

function SummaryCard({
  title,
  description,
  items,
  children,
}: {
  title: string
  description?: string
  items: SummaryItem[]
  children?: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map(({ label, value }) => (
          <div key={label} className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-mono text-xs">{formatValue(value)}</span>
          </div>
        ))}
        {children}
      </CardContent>
    </Card>
  )
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null || value === "") return "—"
  if (typeof value === "boolean") return value ? "Sí" : "No"
  if (typeof value === "object") return JSON.stringify(value)
  return String(value)
}

function getNestedRecord(root: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const value = root[key]
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

export function TenantVariablesSectionsPanel({ data }: { data: TenantScopedSettings | null }) {
  const config = useMemo(() => data?.config ?? {}, [data?.config])
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const features = useMemo(() => (config.features ?? {}) as FeatureConfig, [config])
  const defaultFeatureState = useMemo(
    () =>
      Object.entries(features).reduce<Record<string, boolean>>((acc, [key, value]) => {
        acc[key] = Boolean(value?.enabled)
        return acc
      }, {}),
    [features],
  )
  const [localFeatureState, setLocalFeatureState] = useState(defaultFeatureState)

  useEffect(() => {
    setLocalFeatureState(defaultFeatureState)
  }, [defaultFeatureState])

  const toggleFeature = async (featureKey: string) => {
    const nextValue = !localFeatureState[featureKey]
    setLocalFeatureState((prev) => ({ ...prev, [featureKey]: nextValue }))
    setMessage(null)
    setLoading(true)
    try {
      const payloadFeatures = {
        ...features,
        [featureKey]: { ...(features[featureKey] ?? {}), enabled: nextValue },
      }
      const response = await fetch("/api/settings/variables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: { features: payloadFeatures } }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || "No se pudieron guardar las variables")
      }
      setMessage({ type: "success", text: "Variables guardadas" })
    } catch (err) {
      setLocalFeatureState((prev) => ({ ...prev, [featureKey]: !nextValue }))
      setMessage({ type: "error", text: (err as Error).message })
    } finally {
      setLoading(false)
    }
  }

  const routeSummary = data?.routes ?? []

  const openaiConfig = getNestedRecord(config, "openai") ?? {}
  const openaiGeneral = getNestedRecord(openaiConfig, "general") ?? {}
  const openaiVoice = getNestedRecord(openaiConfig, "voice") ?? {}

  const mailConfig = getNestedRecord(config, "mail") ?? {}
  const brevoConfig = getNestedRecord(config, "brevo") ?? {}

  const twilioConfig = getNestedRecord(config, "twilio") ?? {}
  const voiceConfig = getNestedRecord(config, "voice") ?? {}

  const calendarConfig = getNestedRecord(config, "calendar") ?? {}
  const webchatConfig = getNestedRecord(config, "webchat") ?? {}
  const webchatCalendar = getNestedRecord(webchatConfig, "calendar") ?? {}

  const whatsappConfig = getNestedRecord(config, "whatsapp") ?? {}
  const whatsappTemplates = getNestedRecord(whatsappConfig, "templates") ?? {}

  const messengerConfig = getNestedRecord(config, "messenger") ?? {}

  const googlePlacesConfig = getNestedRecord(config, "google_places") ?? {}
  const denueConfig = getNestedRecord(config, "denue") ?? {}

  return (
    <div className="space-y-6">
      <SummaryCard
        title="OpenAI"
        description="Datos de prompt y modelos que usa el tenant."
        items={[
          { label: "project_id", value: openaiGeneral.project_id },
          { label: "voice prompt_id", value: openaiVoice.prompt_id },
          { label: "voice prompt_version", value: openaiVoice.prompt_version },
          { label: "voice model", value: openaiVoice.model },
          { label: "voice max_tokens", value: openaiVoice.max_tokens },
          { label: "voice stt_model", value: openaiVoice.stt_model },
        ]}
      />

      <SummaryCard
        title="Webchat y calendario"
        description="Latencia, recursos y seguimiento del chat."
        items={[
          { label: "webchat enabled", value: webchatConfig.enabled },
          { label: "calendar resource_id", value: webchatCalendar.resource_id },
          { label: "calendar timezone", value: webchatCalendar.timezone },
          { label: "calendar default days", value: calendarConfig.default_days },
          { label: "calendar hold minutes", value: calendarConfig.hold_minutes },
          { label: "calendar provider", value: calendarConfig.provider },
        ]}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Label className="text-sm text-muted-foreground">Features</Label>
          {Object.keys(features).length === 0 ? (
            <Badge variant="outline">Sin feature flags</Badge>
          ) : (
            Object.keys(features).map((featureKey) => (
              <Badge
                key={featureKey}
                variant={localFeatureState[featureKey] ? "secondary" : "outline"}
                className="flex items-center gap-2"
              >
                <Toggle
                  pressed={Boolean(localFeatureState[featureKey])}
                  onPressedChange={() => void toggleFeature(featureKey)}
                  disabled={loading}
                >
                  {featureKey}
                </Toggle>
              </Badge>
            ))
          )}
        </div>
        {message && (
          <p className={`text-sm ${message.type === "success" ? "text-emerald-600" : "text-destructive"}`}>
            {message.text}
          </p>
        )}
      </SummaryCard>

      <SummaryCard
        title="Mail y Brevo"
        description="Servidores y puertos del canal de correo y Brevo."
        items={[
          { label: "Incoming server", value: mailConfig.incoming_server },
          { label: "Incoming port (IMAP)", value: mailConfig.incoming_port_imap },
          { label: "Outgoing server", value: mailConfig.outgoing_server },
          { label: "Outgoing port (SMTP)", value: mailConfig.outgoing_port_smtp },
          { label: "Use SSL", value: mailConfig.use_ssl },
          { label: "Use TLS", value: mailConfig.use_tls },
          { label: "Brevo base url", value: brevoConfig.base_url },
        ]}
      />

      <SummaryCard
        title="Twilio / Voice"
        description="Teléfono principal y configuración de voz."
        items={[
          { label: "Phone number", value: twilioConfig.phone_number },
          { label: "Phone number SID", value: twilioConfig.phone_number_sid },
          { label: "Validate signatures", value: twilioConfig.validate_signatures ?? true },
          { label: "Webhook path", value: voiceConfig.webhook_path },
          { label: "Full duplex", value: voiceConfig.full_duplex ?? true },
          { label: "Debug verbose", value: voiceConfig.debug_verbose },
          { label: "Debug energy every N", value: voiceConfig.energy_every_n },
        ]}
      />

      <SummaryCard
        title="WhatsApp"
        description="Configuraciones de prompt y plantillas."
        items={[
          { label: "Prompt id", value: whatsappConfig.prompt_id },
          { label: "Prompt version", value: whatsappConfig.prompt_version },
          { label: "Assistant id", value: whatsappConfig.assistant_id },
          { label: "Inactivity minutes", value: whatsappConfig.inactivity_minutes },
          { label: "Reengage minutes", value: whatsappConfig.reengage_minutes },
          { label: "Reengage max attempts", value: whatsappConfig.reengage_max_attempts },
          { label: "Escalate minutes", value: whatsappConfig.escalate_minutes },
          { label: "Template sales", value: whatsappTemplates.sales },
          { label: "Template appointment", value: whatsappTemplates.appointment },
          { label: "Template cancel", value: whatsappTemplates.cancel },
        ]}
      />

      <SummaryCard
        title="Messenger"
        description="El assistant de Messenger y la ventana de inactividad."
        items={[
          { label: "Prompt id", value: messengerConfig.prompt_id },
          { label: "Prompt version", value: messengerConfig.prompt_version },
          { label: "Assistant id", value: messengerConfig.assistant_id },
          { label: "Inactivity hours", value: messengerConfig.inactivity_hours },
        ]}
      />

      <SummaryCard
        title="Google Places / Denue"
        description="Endpoints y límites para búsquedas."
        items={[
          { label: "Denue base url", value: denueConfig.base_url },
          { label: "Nearby url", value: googlePlacesConfig.nearby_url },
          { label: "Text url", value: googlePlacesConfig.text_url },
          { label: "Details url", value: googlePlacesConfig.details_url },
          { label: "Field mask", value: googlePlacesConfig.field_mask },
          { label: "Details field mask", value: googlePlacesConfig.details_field_mask },
          { label: "Grid max tile radius", value: googlePlacesConfig.grid_max_tile_radius_m },
          { label: "Pause between pages", value: googlePlacesConfig.pause_between_pages },
          { label: "Dense grid radius", value: googlePlacesConfig.dense_grid_max_tile_radius_m },
          { label: "Dense pause", value: googlePlacesConfig.dense_pause_between_pages },
          { label: "Dense max results", value: googlePlacesConfig.dense_max_results },
        ]}
      />

      <SummaryCard
        title="Rutas configuradas"
        description="Routing que asocia canales a este tenant."
        items={routeSummary.map((route) => ({ label: route.canal, value: route.clave }))}
      />
    </div>
  )
}
