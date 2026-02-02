import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TenantScopedSettings } from "@/app/settings/variables/components/tenant-variables-panel"
import { TenantFeatureToggleList } from "./tenant-variables-feature-list"
import { TenantSectionForm } from "./tenant-variables-section-form"

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
  },
]

export function TenantVariablesSectionsPanel({ data }: { data: TenantScopedSettings | null }) {
  const config = data?.config ?? {}
  const features = (config.features ?? {}) as Record<string, Record<string, unknown> | null>

  return (
  <Tabs defaultValue="features" className="space-y-6">
    <TabsList className="grid grid-cols-1 gap-2 rounded-full border border-input bg-card/50 p-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        <TabsTrigger value="features" className="data-[state=active]:bg-card data-[state=active]:shadow">
          Features
        </TabsTrigger>
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
      <TabsContent value="features">
        <section className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Flags / Features</p>
          <TenantFeatureToggleList features={features} />
        </section>
      </TabsContent>
      {SECTIONS.map((section) => (
        <TabsContent key={section.title} value={section.title}>
          <TenantSectionForm section={section} config={config} />
        </TabsContent>
      ))}
    </Tabs>
  )
}
