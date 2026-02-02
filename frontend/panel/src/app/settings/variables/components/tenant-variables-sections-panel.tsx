import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TenantScopedSettings } from "@/app/settings/variables/components/tenant-variables-panel"
import { TenantSectionForm } from "./tenant-variables-section-form"
import { TenantRoutesManager } from "./tenant-routes-manager"
import { TenantValidationPanel } from "./tenant-validation-panel"

type SectionConfig = {
  title: string
  description?: string
  fields: Array<{
    label: string
    path: string
    type?: "text" | "number"
    placeholder?: string
    multiline?: boolean
    control?: "checkbox"
  }>
  secrets?: Array<{
    clave: string
    label: string
    tier?: "A" | "B"
    placeholder?: string
    note?: string
  }>
  routeChannel?: "webchat" | "whatsapp" | "messenger"
  routeDescription?: string
  validationScope?: "webchat" | "calendar" | "mail" | "twilio" | "whatsapp" | "messenger"
  validationDescription?: string
}

const SECTIONS: SectionConfig[] = [
  {
    title: "Webchat",
    description: "Ajusta los prompts y reenganches del chat web.",
    fields: [
      { label: "Assistant ID", path: "webchat.assistant_id" },
      { label: "Prompt version", path: "webchat.prompt_version" },
      { label: "Inactivity hours", path: "webchat.inactivity_hours", type: "number" },
      { label: "Persist session", path: "webchat.persist_session", control: "checkbox" },
      { label: "Reengage minutes", path: "webchat.reengage_minutes", type: "number" },
      { label: "Reengage max attempts", path: "webchat.reengage_max_attempts", type: "number" },
      { label: "Escalate minutes", path: "webchat.escalate_minutes", type: "number" },
    ],
    routeChannel: "webchat",
    routeDescription: "Registra el alias que usará el canal webchat.",
    validationScope: "webchat",
    validationDescription: "Detecta rutas/configuración/secrets faltantes para Webchat.",
  },
  {
    title: "Calendario",
    description: "Configura el recurso de calendar y los servidores asociados.",
    fields: [
      { label: "Calendar resource ID", path: "webchat.calendar.resource_id" },
      { label: "Calendar timezone", path: "webchat.calendar.timezone" },
      { label: "Calendar default days", path: "webchat.calendar.default_days", type: "number" },
      { label: "Calendar hold minutes", path: "webchat.calendar.hold_minutes", type: "number" },
      { label: "Provider", path: "calendar.provider" },
      { label: "Server URL", path: "calendar.server_url" },
      { label: "Server URL (alt.)", path: "calendar.server_url_alternate" },
      { label: "Server port", path: "calendar.server_port", type: "number" },
      { label: "Full calendar URL", path: "calendar.full_calendar_url" },
      { label: "Contact list URL", path: "calendar.full_contact_list_url" },
    ],
    secrets: [
      { clave: "calendar.username", label: "calendar.username", tier: "A", placeholder: "usuario" },
      {
        clave: "calendar.password",
        label: "calendar.password",
        tier: "B",
        placeholder: "contraseña",
        note: "El valor solo se guarda una vez.",
      },
    ],
    validationScope: "calendar",
    validationDescription: "Valida las configuraciones del calendario y sus secretos.",
  },
  {
    title: "Mail y Brevo",
    description: "Servidores y URLs para correo y Brevo.",
    fields: [
      { label: "Incoming server", path: "mail.incoming_server" },
      { label: "Incoming port IMAP", path: "mail.incoming_port_imap", type: "number" },
      { label: "Outgoing server", path: "mail.outgoing_server" },
      { label: "Outgoing port SMTP", path: "mail.outgoing_port_smtp", type: "number" },
      { label: "Use SSL", path: "mail.use_ssl", control: "checkbox" },
      { label: "Use TLS", path: "mail.use_tls", control: "checkbox" },
      { label: "Brevo base URL", path: "brevo.base_url" },
    ],
    secrets: [
      { clave: "mail.username", label: "mail.username", tier: "A", placeholder: "usuario" },
      {
        clave: "mail.password",
        label: "mail.password",
        tier: "B",
        placeholder: "contraseña",
        note: "El valor no se muestra nuevamente.",
      },
      {
        clave: "brevo.api_key",
        label: "brevo.api_key",
        tier: "B",
        placeholder: "API key",
        note: "Pega una clave nueva para rotarla.",
      },
    ],
    validationScope: "mail",
    validationDescription: "Verifica configuración de correo, Brevo y sus secretos.",
  },
  {
    title: "Twilio & Voice",
    description: "Números, verificaciones y streaming de voz.",
    fields: [
      { label: "Twilio phone number", path: "twilio.phone_number" },
      { label: "Twilio phone number SID", path: "twilio.phone_number_sid" },
      { label: "Validate signatures", path: "twilio.validate_signatures", control: "checkbox" },
      { label: "Voice webhook path", path: "voice.webhook_path" },
      { label: "Voice full duplex", path: "voice.full_duplex", control: "checkbox" },
      { label: "Voice debug verbose", path: "voice.debug_verbose", control: "checkbox" },
      { label: "Voice energy every N", path: "voice.energy_every_n", type: "number" },
    ],
    secrets: [
      { clave: "twilio.account_sid", label: "twilio.account_sid", tier: "A", placeholder: "AC..." },
      { clave: "twilio.auth_token", label: "twilio.auth_token", tier: "B", placeholder: "Auth token" },
      {
        clave: "voice.stream_jwt_secret",
        label: "voice.stream_jwt_secret",
        tier: "B",
        placeholder: "Stream JWT",
        note: "Valor sensible para el streaming de voz.",
      },
    ],
    validationScope: "twilio",
    validationDescription: "Validaciones del bloque Twilio/Voz y sus secretos.",
  },
  {
    title: "WhatsApp",
    description: "Prompts y plantillas activas para WhatsApp.",
    fields: [
      { label: "Prompt ID", path: "whatsapp.prompt_id" },
      { label: "Prompt version", path: "whatsapp.prompt_version" },
      { label: "Assistant ID", path: "whatsapp.assistant_id" },
      { label: "Inactivity minutes", path: "whatsapp.inactivity_minutes", type: "number" },
      { label: "Reengage minutes", path: "whatsapp.reengage_minutes", type: "number" },
      { label: "Reengage max attempts", path: "whatsapp.reengage_max_attempts", type: "number" },
      { label: "Escalate minutes", path: "whatsapp.escalate_minutes", type: "number" },
      { label: "Template sales", path: "whatsapp.templates.sales" },
      { label: "Template appointment", path: "whatsapp.templates.appointment" },
      { label: "Template cancel", path: "whatsapp.templates.cancel" },
    ],
    routeChannel: "whatsapp",
    routeDescription: "Registra el número que recibirá mensajes de WhatsApp.",
    validationScope: "whatsapp",
    validationDescription: "Detecta faltantes en config/rutas/secretos para WhatsApp.",
  },
  {
    title: "Messenger",
    description: "Prompts e inactividad para Messenger.",
    fields: [
      { label: "Prompt ID", path: "messenger.prompt_id" },
      { label: "Prompt version", path: "messenger.prompt_version" },
      { label: "Assistant ID", path: "messenger.assistant_id" },
      { label: "Inactivity hours", path: "messenger.inactivity_hours", type: "number" },
    ],
    secrets: [
      {
        clave: "meta.messenger.page_access_token",
        label: "meta.messenger.page_access_token",
        tier: "B",
        placeholder: "Page access token",
        note: "Pega un token válido para el page_id.",
      },
      {
        clave: "meta.messenger.verify_token",
        label: "meta.messenger.verify_token",
        tier: "A",
        placeholder: "Verify token",
        note: "Se valida cuando Facebook hace el webhook.",
      },
      {
        clave: "meta.messenger.app_secret",
        label: "meta.messenger.app_secret",
        tier: "B",
        placeholder: "App secret",
      },
    ],
    routeChannel: "messenger",
    routeDescription: "Relaciona el page_id y habilita el webhook de Messenger.",
    validationScope: "messenger",
    validationDescription: "Revisa rutas/configuración/secrets de Messenger.",
  },
  {
    title: "Búsqueda",
    description: "URLs y límites para Denue / Google Places.",
    fields: [
      { label: "DENUE base URL", path: "denue.base_url" },
      { label: "Google nearby URL", path: "google_places.nearby_url" },
      { label: "Google text URL", path: "google_places.text_url" },
      { label: "Google details URL", path: "google_places.details_url" },
      { label: "Google field mask", path: "google_places.field_mask" },
      { label: "Google details field mask", path: "google_places.details_field_mask" },
      { label: "Google language code", path: "google_places.language_code" },
      { label: "Google region code", path: "google_places.region_code" },
      { label: "Grid radius (m)", path: "google_places.grid_max_tile_radius_m", type: "number" },
      { label: "Pause between pages", path: "google_places.pause_between_pages", type: "number" },
      { label: "Dense grid radius (m)", path: "google_places.dense_grid_max_tile_radius_m", type: "number" },
      { label: "Dense pause between pages", path: "google_places.dense_pause_between_pages", type: "number" },
      { label: "Dense max results", path: "google_places.dense_max_results", type: "number" },
    ],
    secrets: [
      { clave: "denue.token", label: "denue.token", tier: "A", placeholder: "Token Denue" },
      {
        clave: "google.places_api_key",
        label: "google.places_api_key",
        tier: "B",
        placeholder: "Google Places API key",
        note: "Solo se guarda al pegar una clave nueva.",
      },
    ],
  },
  {
    title: "OpenAI",
    description: "Project ID y prompts/voz configurados.",
    fields: [
      { label: "Project ID", path: "openai.general.project_id", placeholder: "openai-project-id" },
      { label: "Voice prompt ID", path: "openai.voice.prompt_id", placeholder: "voice-prompt" },
      { label: "Voice prompt version", path: "openai.voice.prompt_version" },
      { label: "Voice model", path: "openai.voice.model" },
      { label: "Voice max tokens", path: "openai.voice.max_tokens", type: "number" },
      { label: "Voice STT model", path: "openai.voice.stt_model" },
    ],
    secrets: [
      {
        clave: "openai.general.api_key",
        label: "openai.general.api_key",
        tier: "B",
        placeholder: "OpenAI API key",
        note: "No se muestra el valor guardado.",
      },
      {
        clave: "openai.voice.api_key",
        label: "openai.voice.api_key",
        tier: "B",
        placeholder: "OpenAI voice key",
        note: "Pega una clave nueva para rotar.",
      },
    ],
  },
]

export function TenantVariablesSectionsPanel({ data }: { data: TenantScopedSettings | null }) {
  const config = data?.config ?? {}
  const routes = data?.routes ?? []

  return (
  <Tabs defaultValue={SECTIONS[0]?.title ?? ""} className="space-y-6">
    <TabsList className="grid grid-cols-1 gap-2 rounded-full border border-input bg-card/50 p-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {SECTIONS.map((section) => (
        <TabsTrigger
          key={section.title}
          value={section.title}
          className="data-[state=active]:bg-card data-[state=active]:shadow"
        >
          {section.title}
        </TabsTrigger>
      ))}
    </TabsList>
    {SECTIONS.map((section) => (
      <TabsContent key={section.title} value={section.title}>
        <div className="space-y-6">
          <TenantSectionForm section={section} config={config} />
          {section.routeChannel ? (
            <TenantRoutesManager
              channel={section.routeChannel}
              title={`Rutas ${section.title}`}
              description={section.routeDescription}
              routes={routes}
              placeholder={
                section.routeChannel === "webchat"
                  ? "ej. cliente-x"
                  : section.routeChannel === "whatsapp"
                  ? "+521..."
                  : "page_id"
              }
            />
          ) : null}
          {section.validationScope ? (
            <TenantValidationPanel
              scope={section.validationScope}
              label={`Validación ${section.title}`}
              description={section.validationDescription}
            />
          ) : null}
        </div>
      </TabsContent>
    ))}
  </Tabs>
  )
}
