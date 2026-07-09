import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TenantScopedSettings } from "@/app/settings/variables/components/tenant-variables-panel"
import { TenantSectionForm } from "./tenant-variables-section-form"
import { TenantRoutesManager } from "./tenant-routes-manager"
import { TenantValidationPanel } from "./tenant-validation-panel"

type SectionConfig = {
  title: string
  description?: string
  groups?: Array<{
    title: string
    description?: string
    fieldPaths: string[]
    subgroups?: Array<{
      title: string
      description?: string
      fieldPaths: string[]
    }>
  }>
  fields: Array<{
    label: string
    path: string
    type?: "text" | "number" | "list" | "select"
    placeholder?: string
    defaultValue?: string
    multiline?: boolean
    control?: "checkbox"
    options?: Array<{ label: string; value: string }>
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
  notes?: string[]
}

const SECTIONS: SectionConfig[] = [
  {
    title: "Módulos",
    description: "Activa o desactiva las áreas funcionales visibles para este tenant.",
    groups: [
      {
        title: "Módulos del tenant",
        description: "Controlan qué áreas ve y usa el usuario en el panel.",
        fieldPaths: [
          "features.webchat.enabled",
          "features.whatsapp.enabled",
          "features.messenger.enabled",
          "features.voice.enabled",
          "features.productos.enabled",
          "features.propiedades.enabled",
        ],
      },
      {
        title: "Asistentes",
        description: "Controla qué catálogo puede consultar el asistente automático.",
        fieldPaths: ["features.catalog_inmobiliario.enabled", "features.catalog_no_inmobiliario.enabled"],
      },
    ],
    fields: [
      { label: "Webchat habilitado", path: "features.webchat.enabled", control: "checkbox" },
      { label: "WhatsApp habilitado", path: "features.whatsapp.enabled", control: "checkbox" },
      { label: "Messenger habilitado", path: "features.messenger.enabled", control: "checkbox" },
      { label: "Voz habilitada", path: "features.voice.enabled", control: "checkbox" },
      { label: "Productos habilitado", path: "features.productos.enabled", control: "checkbox" },
      { label: "Propiedades habilitado", path: "features.propiedades.enabled", control: "checkbox" },
      { label: "Activar inmobiliario", path: "features.catalog_inmobiliario.enabled", control: "checkbox" },
      {
        label: "Activar productos y servicios",
        path: "features.catalog_no_inmobiliario.enabled",
        control: "checkbox",
      },
    ],
    notes: [
      "Estos flags controlan la visibilidad del menú y el acceso a las rutas de cada módulo.",
      "La taxonomía compartida sigue existiendo, pero el inventario operativo se separa por módulo.",
    ],
  },
  {
    title: "Webchat",
    description: "Ajusta prompts, reenganches y habilita el canal Webchat.",
    fields: [
      { label: "Assistant ID", path: "webchat.assistant_id" },
      { label: "Prompt version", path: "webchat.prompt_version" },
      { label: "Inactivity minutes", path: "webchat.inactivity_minutes", type: "number" },
      { label: "Persist session", path: "webchat.persist_session", control: "checkbox" },
      { label: "Reengage minutes", path: "webchat.reengage_minutes", type: "number" },
      { label: "Reengage max attempts", path: "webchat.reengage_max_attempts", type: "number" },
      { label: "Escalate minutes", path: "webchat.escalate_minutes", type: "number" },
    ],
    secrets: [
      {
        clave: "openai.api_key",
        label: "openai.api_key (tier B)",
        tier: "B",
        placeholder: "Pega la clave",
        note: "El valor no se muestra una vez guardado.",
      },
    ],
    routeChannel: "webchat",
    routeDescription: "Registra el alias que usará el canal webchat.",
    validationScope: "webchat",
    validationDescription: "Detecta rutas/configuración/secrets faltantes para Webchat.",
    notes: [
      'La pestaña "Calendario" administra los recursos, zonas horarias y ventanas que usa el webchat para agendar citas.',
    ],
  },
  {
    title: "Calendario",
    description: "Configura el recurso calendar y los servidores asociados.",
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
      { clave: "calendar.username", label: "calendar.username (tier A)", tier: "A", placeholder: "usuario" },
      {
        clave: "calendar.password",
        label: "calendar.password (tier B)",
        tier: "B",
        placeholder: "contraseña",
        note: "El valor solo se guarda una vez.",
      },
    ],
    validationScope: "calendar",
    validationDescription: "Valida las credenciales, recursos y secretos del calendario.",
    notes: ["Las credenciales se guardan como secretos y no se muestran tras el guardado."],
  },
  {
    title: "Mail y Brevo",
    description: "Servidores de correo y la API de Brevo.",
    fields: [
      { label: "mail.incoming_server", path: "mail.incoming_server" },
      { label: "mail.incoming_port_imap", path: "mail.incoming_port_imap", type: "number" },
      { label: "mail.outgoing_server", path: "mail.outgoing_server" },
      { label: "mail.outgoing_port_smtp", path: "mail.outgoing_port_smtp", type: "number" },
      { label: "mail.use_ssl", path: "mail.use_ssl", control: "checkbox" },
      { label: "mail.use_tls", path: "mail.use_tls", control: "checkbox" },
      { label: "brevo.base_url", path: "brevo.base_url" },
      { label: "brevo.sender_email", path: "brevo.sender_email" },
      { label: "brevo.sender_name", path: "brevo.sender_name" },
    ],
    secrets: [
      { clave: "mail.username", label: "mail.username (tier A)", tier: "A", placeholder: "usuario" },
      {
        clave: "mail.password",
        label: "mail.password (tier B)",
        tier: "B",
        placeholder: "contraseña",
        note: "Solo se guarda la nueva clave.",
      },
      {
        clave: "brevo.api_key",
        label: "brevo.api_key (tier B)",
        tier: "B",
        placeholder: "API key",
        note: "Solo se guarda el valor si se pega uno nuevo.",
      },
    ],
    validationScope: "mail",
    validationDescription: "Verifica los hosts, puertos y secretos de correo/Brevo.",
    notes: ["Esta sección guarda la configuración no sensible de `organizaciones.config.mail` y `organizaciones.config.brevo`."],
  },
  {
    title: "Twilio & Voice",
    description: "Números de teléfono, validaciones y streaming de voz.",
    fields: [
      { label: "twilio.phone_number", path: "twilio.phone_number" },
      { label: "twilio.phone_number_sid", path: "twilio.phone_number_sid" },
      { label: "twilio.validate_signatures", path: "twilio.validate_signatures", control: "checkbox" },
      { label: "voice.webhook_path", path: "voice.webhook_path" },
      { label: "voice.full_duplex", path: "voice.full_duplex", control: "checkbox" },
      { label: "voice.debug_verbose", path: "voice.debug_verbose", control: "checkbox" },
      { label: "voice.energy_every_n", path: "voice.energy_every_n", type: "number" },
    ],
    secrets: [
      { clave: "twilio.account_sid", label: "twilio.account_sid (tier A)", tier: "A", placeholder: "AC..." },
      {
        clave: "twilio.auth_token",
        label: "twilio.auth_token (tier B)",
        tier: "B",
        placeholder: "Auth token",
      },
      {
        clave: "voice.stream_jwt_secret",
        label: "voice.stream_jwt_secret (tier B)",
        tier: "B",
        placeholder: "Stream JWT",
        note: "Usado por realtime/streaming; no se muestra después de guardar.",
      },
    ],
    validationScope: "twilio",
    validationDescription: "Valida Twilio, voz y secretos relacionados.",
    notes: [
      'Esta sección guarda la configuración de `organizaciones.config.twilio` y `organizaciones.config.voice`.',
    ],
  },
  {
    title: "WhatsApp",
    description: "Separa la configuración común de WhatsApp de los datos específicos de Twilio y Meta.",
    groups: [
      {
        title: "Proveedor activo",
        description: "Selecciona el adapter que debe usar el backend para este tenant.",
        fieldPaths: ["whatsapp.provider"],
      },
      {
        title: "Configuración común",
        description: "Aplica tanto si operas con Twilio como si operas con Meta.",
        fieldPaths: [
          "whatsapp.prompt_id",
          "whatsapp.prompt_version",
          "whatsapp.welcome_document_prompt_version",
          "whatsapp.location_href",
          "whatsapp.assistant_id",
          "whatsapp.inactivity_minutes",
          "whatsapp.reengage_minutes",
          "whatsapp.reengage_max_attempts",
          "whatsapp.escalate_minutes",
        ],
      },
      {
        title: "Twilio",
        description: "Completa estos campos si el proveedor activo es Twilio.",
        fieldPaths: [
          "whatsapp.twilio.phone_number",
          "whatsapp.twilio.phone_number_sid",
          "whatsapp.twilio.validate_signatures",
          "whatsapp.templates.sales",
          "whatsapp.templates.appointment",
          "whatsapp.templates.cancel",
        ],
        subgroups: [
          {
            title: "Credenciales Twilio",
            description: "Datos operativos del número y validación de Twilio.",
            fieldPaths: [
              "whatsapp.twilio.phone_number",
              "whatsapp.twilio.phone_number_sid",
              "whatsapp.twilio.validate_signatures",
            ],
          },
          {
            title: "Plantillas Twilio",
            description: "SIDs de plantillas usadas para notificaciones de Twilio.",
            fieldPaths: [
              "whatsapp.templates.sales",
              "whatsapp.templates.appointment",
              "whatsapp.templates.cancel",
            ],
          },
        ],
      },
      {
        title: "Meta",
        description: "Completa estos campos si el proveedor activo es Meta.",
        fieldPaths: [
          "whatsapp.meta.phone_number_id",
          "whatsapp.meta.graph_api_version",
          "whatsapp.templates_meta.sales.name",
          "whatsapp.templates_meta.sales.language",
          "whatsapp.templates_meta.appointment.name",
          "whatsapp.templates_meta.appointment.language",
          "whatsapp.templates_meta.cancel.name",
          "whatsapp.templates_meta.cancel.language",
        ],
        subgroups: [
          {
            title: "Conexión Meta",
            description: "Identificadores de la cuenta de Meta y del Graph API.",
            fieldPaths: ["whatsapp.meta.phone_number_id", "whatsapp.meta.graph_api_version"],
          },
          {
            title: "Plantillas Meta",
            description: "Nombre técnico e idioma aprobados para cada plantilla.",
            fieldPaths: [
              "whatsapp.templates_meta.sales.name",
              "whatsapp.templates_meta.sales.language",
              "whatsapp.templates_meta.appointment.name",
              "whatsapp.templates_meta.appointment.language",
              "whatsapp.templates_meta.cancel.name",
              "whatsapp.templates_meta.cancel.language",
            ],
          },
        ],
      },
    ],
    fields: [
      {
        label: "Proveedor activo",
        path: "whatsapp.provider",
        type: "select",
        defaultValue: "twilio",
        options: [
          { label: "Meta WhatsApp Cloud API", value: "meta" },
          { label: "Twilio", value: "twilio" },
        ],
      },
      { label: "Prompt ID", path: "whatsapp.prompt_id" },
      { label: "Versión del prompt", path: "whatsapp.prompt_version" },
      { label: "Versión del PDF de bienvenida", path: "whatsapp.welcome_document_prompt_version" },
      { label: "Link de ubicación", path: "whatsapp.location_href" },
      { label: "Assistant ID", path: "whatsapp.assistant_id" },
      { label: "Minutos de inactividad", path: "whatsapp.inactivity_minutes", type: "number" },
      { label: "Minutos para reenganche", path: "whatsapp.reengage_minutes", type: "number" },
      { label: "Máximo de intentos de reenganche", path: "whatsapp.reengage_max_attempts", type: "number" },
      { label: "Minutos para escalar", path: "whatsapp.escalate_minutes", type: "number" },
      { label: "Número de WhatsApp", path: "whatsapp.twilio.phone_number" },
      { label: "SID del número", path: "whatsapp.twilio.phone_number_sid" },
      { label: "Validar firmas", path: "whatsapp.twilio.validate_signatures", control: "checkbox" },
      { label: "SID plantilla de ventas", path: "whatsapp.templates.sales" },
      { label: "SID plantilla de cita", path: "whatsapp.templates.appointment" },
      { label: "SID plantilla de cancelación", path: "whatsapp.templates.cancel" },
      { label: "Phone Number ID", path: "whatsapp.meta.phone_number_id" },
      { label: "Graph API version", path: "whatsapp.meta.graph_api_version" },
      { label: "Nombre plantilla ventas", path: "whatsapp.templates_meta.sales.name" },
      { label: "Idioma plantilla ventas", path: "whatsapp.templates_meta.sales.language" },
      { label: "Nombre plantilla cita", path: "whatsapp.templates_meta.appointment.name" },
      { label: "Idioma plantilla cita", path: "whatsapp.templates_meta.appointment.language" },
      { label: "Nombre plantilla cancelación", path: "whatsapp.templates_meta.cancel.name" },
      { label: "Idioma plantilla cancelación", path: "whatsapp.templates_meta.cancel.language" },
    ],
    routeChannel: "whatsapp",
    routeDescription: "Registra el número que recibirá mensajes de WhatsApp.",
    validationScope: "whatsapp",
    validationDescription: "Detecta faltantes en config/rutas/secretos para WhatsApp.",
    notes: [
      "Twilio usa sus propios SIDs y plantillas de envío; Meta usa nombre e idioma de plantillas aprobadas.",
      "Los secretos sensibles siguen en la pestaña Secretos con claves como `meta.whatsapp.*`.",
    ],
  },
  {
    title: "Messenger",
    description: "Prompts e inactividad para Messenger.",
    fields: [
      { label: "messenger.prompt_id", path: "messenger.prompt_id" },
      { label: "messenger.prompt_version", path: "messenger.prompt_version" },
      { label: "messenger.assistant_id", path: "messenger.assistant_id" },
      { label: "messenger.inactivity_hours", path: "messenger.inactivity_hours", type: "number" },
    ],
    secrets: [
      {
        clave: "meta.messenger.page_access_token",
        label: "meta.messenger.page_access_token (tier B)",
        tier: "B",
        placeholder: "Page access token",
        note: "Se valida cuando Facebook llama al webhook.",
      },
      {
        clave: "meta.messenger.verify_token",
        label: "meta.messenger.verify_token (tier A)",
        tier: "A",
        placeholder: "Verify token",
      },
      {
        clave: "meta.messenger.app_secret",
        label: "meta.messenger.app_secret (tier B)",
        tier: "B",
        placeholder: "App secret",
      },
    ],
    routeChannel: "messenger",
    routeDescription: "Relaciona el page_id y habilita el webhook de Messenger.",
    validationScope: "messenger",
    validationDescription: "Revisa rutas, configuración y secretos de Messenger.",
  },
  {
    title: "Búsqueda",
    description: "URLs y límites para Denue y Google Places.",
    fields: [
      { label: "denue.base_url", path: "denue.base_url" },
      { label: "google_places.nearby_url", path: "google_places.nearby_url" },
      { label: "google_places.text_url", path: "google_places.text_url" },
      { label: "google_places.details_url", path: "google_places.details_url" },
      { label: "google_places.field_mask", path: "google_places.field_mask", multiline: true },
      {
        label: "google_places.details_field_mask",
        path: "google_places.details_field_mask",
        multiline: true,
      },
      { label: "google_places.language_code", path: "google_places.language_code" },
      { label: "google_places.region_code", path: "google_places.region_code" },
      {
        label: "google_places.grid_max_tile_radius_m",
        path: "google_places.grid_max_tile_radius_m",
        type: "number",
      },
      {
        label: "google_places.pause_between_pages",
        path: "google_places.pause_between_pages",
        type: "number",
      },
      {
        label: "google_places.dense_grid_max_tile_radius_m",
        path: "google_places.dense_grid_max_tile_radius_m",
        type: "number",
      },
      {
        label: "google_places.dense_pause_between_pages",
        path: "google_places.dense_pause_between_pages",
        type: "number",
      },
      {
        label: "google_places.dense_max_results",
        path: "google_places.dense_max_results",
        type: "number",
      },
    ],
    secrets: [
      { clave: "denue.token", label: "denue.token (tier A)", tier: "A", placeholder: "Token Denue" },
      {
        clave: "google.places_api_key",
        label: "google.places_api_key (tier B)",
        tier: "B",
        placeholder: "Google Places API key",
        note: "El valor solo se guarda si pegas una clave nueva.",
      },
    ],
  },
  {
    title: "OpenAI",
    description: "Project ID, prompts y secretos para OpenAI.",
    fields: [
      { label: "openai.general.project_id", path: "openai.general.project_id", placeholder: "openai-project-id" },
      { label: "openai.voice.prompt_id", path: "openai.voice.prompt_id", placeholder: "voice-prompt" },
      { label: "openai.voice.prompt_version", path: "openai.voice.prompt_version" },
      { label: "openai.voice.model", path: "openai.voice.model" },
      { label: "openai.voice.max_tokens", path: "openai.voice.max_tokens", type: "number" },
      { label: "openai.voice.stt_model", path: "openai.voice.stt_model" },
    ],
    secrets: [
      {
        clave: "openai.general.api_key",
        label: "openai.general.api_key (tier B)",
        tier: "B",
        placeholder: "OpenAI API key",
        note: "No se muestra el valor guardado.",
      },
      {
        clave: "openai.voice.api_key",
        label: "openai.voice.api_key (tier B)",
        tier: "B",
        placeholder: "OpenAI voice key",
        note: "Pega una clave nueva para rotarla.",
      },
    ],
  },
]

export function TenantVariablesSectionsPanel({ data }: { data: TenantScopedSettings | null }) {
  const config = data?.config ?? {}
  const routes = data?.routes ?? []

  return (
    <Tabs defaultValue={SECTIONS[0]?.title ?? ""} className="space-y-6">
      <TabsList className="grid grid-cols-2 gap-2 rounded-full border border-input bg-card/50 p-1 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-9">
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
