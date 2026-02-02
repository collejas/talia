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
  }>
}

const SECTIONS: SectionConfig[] = [
  {
    title: "OpenAI",
    description: "Identifica los prompts y modelos que utilizará el tenant para IA y voz.",
    fields: [
      { label: "Project ID", path: "openai.general.project_id", placeholder: "openai-project-id" },
      { label: "Voice prompt ID", path: "openai.voice.prompt_id", placeholder: "voicet-prompt" },
      { label: "Voice prompt version", path: "openai.voice.prompt_version" },
      { label: "Voice model", path: "openai.voice.model" },
      { label: "Voice max tokens", path: "openai.voice.max_tokens", type: "number" },
      { label: "Voice STT model", path: "openai.voice.stt_model" },
    ],
  },
  {
    title: "Webchat & calendario",
    description: "Ajustes del chat web y el calendario adjunto.",
    fields: [
      { label: "Calendar resource ID", path: "webchat.calendar.resource_id" },
      { label: "Calendar timezone", path: "webchat.calendar.timezone" },
      { label: "Calendar default days", path: "calendar.default_days", type: "number" },
      { label: "Calendar hold minutes", path: "calendar.hold_minutes", type: "number" },
      { label: "Calendar server URL", path: "calendar.server_url" },
      { label: "Calendar server port", path: "calendar.server_port", type: "number" },
    ],
  },
  {
    title: "Mail y Brevo",
    description: "Servidores y URLs para manejar correo y Brevo.",
    fields: [
      { label: "Incoming server", path: "mail.incoming_server" },
      { label: "Incoming port IMAP", path: "mail.incoming_port_imap", type: "number" },
      { label: "Outgoing server", path: "mail.outgoing_server" },
      { label: "Outgoing port SMTP", path: "mail.outgoing_port_smtp", type: "number" },
      { label: "Use SSL", path: "mail.use_ssl" },
      { label: "Use TLS", path: "mail.use_tls" },
      { label: "Brevo base URL", path: "brevo.base_url" },
    ],
  },
  {
    title: "Twilio / Voice",
    description: "Configura el número principal y opciones de streaming de voz.",
    fields: [
      { label: "Twilio phone number", path: "twilio.phone_number" },
      { label: "Twilio phone SID", path: "twilio.phone_number_sid" },
      { label: "Validate signatures", path: "twilio.validate_signatures" },
      { label: "Voice webhook path", path: "voice.webhook_path" },
      { label: "Voice full duplex", path: "voice.full_duplex" },
      { label: "Voice debug energy every N", path: "voice.energy_every_n", type: "number" },
    ],
  },
  {
    title: "WhatsApp",
    description: "Plantillas y tiempos de reengagement para WhatsApp.",
    fields: [
      { label: "Prompt ID", path: "whatsapp.prompt_id" },
      { label: "Prompt version", path: "whatsapp.prompt_version" },
      { label: "Assistant ID", path: "whatsapp.assistant_id" },
      { label: "Inactivity minutes", path: "whatsapp.inactivity_minutes", type: "number" },
      { label: "Reengage minutes", path: "whatsapp.reengage_minutes", type: "number" },
      { label: "Escalate minutes", path: "whatsapp.escalate_minutes", type: "number" },
    ],
  },
  {
    title: "Messenger",
    description: "Coloca los prompts y ventanas de inactividad de Messenger.",
    fields: [
      { label: "Prompt ID", path: "messenger.prompt_id" },
      { label: "Prompt version", path: "messenger.prompt_version" },
      { label: "Assistant ID", path: "messenger.assistant_id" },
      { label: "Inactivity hours", path: "messenger.inactivity_hours", type: "number" },
    ],
  },
  {
    title: "Google Places & DENUE",
    description: "URLs y máscaras para búsquedas geográficas.",
    fields: [
      { label: "DENUE base URL", path: "denue.base_url" },
      { label: "Nearby URL", path: "google_places.nearby_url" },
      { label: "Text URL", path: "google_places.text_url" },
      { label: "Details URL", path: "google_places.details_url" },
      { label: "Field mask", path: "google_places.field_mask" },
      { label: "Details field mask", path: "google_places.details_field_mask" },
      { label: "Grid radius", path: "google_places.grid_max_tile_radius_m", type: "number" },
      { label: "Dense pause", path: "google_places.dense_pause_between_pages", type: "number" },
      { label: "Dense max results", path: "google_places.dense_max_results", type: "number" },
    ],
  },
]

export function TenantVariablesSectionsPanel({ data }: { data: TenantScopedSettings | null }) {
  const config = data?.config ?? {}
  const features = (config.features ?? {}) as Record<string, Record<string, unknown> | null>

  return (
    <Tabs defaultValue="features" className="space-y-6">
      <TabsList className="grid grid-cols-3 gap-2 rounded-full border border-input bg-card/50 p-1">
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
