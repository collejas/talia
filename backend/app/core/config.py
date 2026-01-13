"""Configuración central basada en variables de entorno."""

import json

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_REQUEST_LOG_SKIP_PREFIXES: tuple[str, ...] = (
    "/shared",
    "/api/shared",
    "/favicon",
    "/site",
    "/robots.txt",
    "/docs",
    "/openapi",
)


class Settings(BaseSettings):
    """Valores globales leídos desde `.env` o el entorno."""

    environment: str = "development"
    log_level: str | None = Field(
        default=None,
        description="Nivel de logging global (ej. debug, info, warning). Cuando no se define, usa un valor por ambiente.",
    )
    request_log_level: str = Field(
        default="info",
        description=(
            "Nivel mínimo para registrar solicitudes en middleware. "
            "Valores más altos (warning/error) reducen registros de peticiones exitosas."
        ),
    )
    request_log_skip_prefixes: tuple[str, ...] = Field(
        default=DEFAULT_REQUEST_LOG_SKIP_PREFIXES,
        description="Prefijos de ruta para los que no se registrarán eventos de request.started/completed.",
    )
    openai_api_key: str | None = None
    embeddings_model: str = Field(
        default="text-embedding-ada-002",
        description="Modelo de embeddings que se usa para la vector store.",
    )
    openai_assistant_id: str | None = None
    # Específico para el webchat (landing). Si no se define, se usa openai_assistant_id.
    openai_webchat_assistant_id: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "TALIA_OPENAI_WEBCHAT_ASSISTANT_ID",
            "OPENAI_WEBCHAT_ASSISTANT_ID",
        ),
    )
    openai_prompt_version: str | None = None
    openai_prompt_webchat_version: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "TALIA_OPENAI_PROMPT_WEBCHAT_VERSION",
            "OPENAI_PROMPT_WEBCHAT_VERSION",
        ),
    )
    openai_project_id: str | None = None
    twilio_account_sid: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "TWILIO_ACCOUNT_SID",
            "TALIA_TWILIO_ACCOUNT_SID",
        ),
    )
    twilio_auth_token: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "TWILIO_AUTH_TOKEN",
            "TALIA_TWILIO_AUTH_TOKEN",
        ),
    )
    twilio_phone_number: str | None = Field(
        default=None,
        validation_alias=AliasChoices("TWILIO_PHONE_NUMBER", "TALIA_TWILIO_PHONE_NUMBER"),
    )
    twilio_phone_number_sid: str | None = Field(
        default=None,
        validation_alias=AliasChoices("TWILIO_PHONE_NUMBER_SID", "TALIA_TWILIO_PHONE_NUMBER_SID"),
    )
    twilio_validate_signatures: bool = Field(
        default=True,
        validation_alias=AliasChoices(
            "TWILIO_VALIDATE_SIGNATURES", "TALIA_TWILIO_VALIDATE_SIGNATURES"
        ),
    )
    supabase_url: str | None = None
    supabase_service_role: str | None = None
    # Acepta varias variantes comunes del anon key para robustez
    supabase_anon: str | None = Field(
        default=None,
        validation_alias=AliasChoices("TALIA_SUPABASE_ANON", "SUPABASE_ANON_KEY", "SUPABASE_ANON"),
    )
    supabase_jwt_secret: str | None = None
    supabase_legacy_jwt_secret: str | None = None
    cliente_portal_base_url: str | None = Field(
        default=None,
        description="URL base pública que usará el enlace del portal de clientes.",
        validation_alias=AliasChoices(
            "CLIENTE_PORTAL_BASE_URL",
            "TALIA_CLIENTE_PORTAL_BASE_URL",
            "PORTAL_CLIENTE_BASE_URL",
            "TALIA_PORTAL_CLIENTE_URL",
        ),
    )
    geolocation_api_url: str | None = None
    geolocation_api_token: str | None = None
    geolocation_cache_ttl_seconds: int = Field(
        default=4 * 60 * 60,
        description="Tiempo de vida (en segundos) para reutilizar resultados de geolocalización por IP.",
    )
    google_places_api_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "GOOGLE_PLACES_API_KEY",
            "TALIA_GOOGLE_PLACES_API_KEY",
        ),
    )
    google_places_nearby_url: str = Field(
        default="https://places.googleapis.com/v1/places:searchNearby",
        validation_alias=AliasChoices(
            "API_NEARBY_SEARCH",
            "GOOGLE_PLACES_NEARBY_URL",
            "TALIA_GOOGLE_PLACES_NEARBY_URL",
        ),
    )
    google_places_text_url: str = Field(
        default="https://places.googleapis.com/v1/places:searchText",
        validation_alias=AliasChoices(
            "GOOGLE_PLACES_TEXT_URL",
            "TALIA_GOOGLE_PLACES_TEXT_URL",
        ),
    )
    google_places_details_url: str = Field(
        default="https://places.googleapis.com/v1/places",
        validation_alias=AliasChoices(
            "GOOGLE_PLACES_DETAILS_URL",
            "TALIA_GOOGLE_PLACES_DETAILS_URL",
        ),
    )
    google_places_field_mask: str = Field(
        default=(
            "places.id,places.displayName,places.formattedAddress,"
            "places.location,places.primaryType,places.primaryTypeDisplayName,"
            "places.types,places.rating,places.userRatingCount,"
            "places.nationalPhoneNumber,places.internationalPhoneNumber,"
            "places.websiteUri,places.googleMapsUri"
        ),
        validation_alias=AliasChoices(
            "PLACES_FIELD_MASK",
            "TALIA_GOOGLE_PLACES_FIELD_MASK",
        ),
    )
    google_places_details_field_mask: str = Field(
        default=(
            "id,displayName,formattedAddress,location,primaryType,primaryTypeDisplayName,"
            "types,rating,userRatingCount,nationalPhoneNumber,internationalPhoneNumber,"
            "websiteUri,googleMapsUri,businessStatus,regularOpeningHours,utcOffsetMinutes,"
            "currentOpeningHours"
        ),
        validation_alias=AliasChoices(
            "PLACES_DETAILS_FIELD_MASK",
            "TALIA_GOOGLE_PLACES_DETAILS_FIELD_MASK",
        ),
    )
    google_places_language_code: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "PLACES_LANGUAGE_CODE",
            "TALIA_GOOGLE_PLACES_LANGUAGE_CODE",
        ),
    )
    google_places_region_code: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "PLACES_REGION_CODE",
            "TALIA_GOOGLE_PLACES_REGION_CODE",
        ),
    )
    google_places_grid_max_tile_radius_m: int = Field(
        default=1200,
        description="Máximo en metros que puede alcanzar una tile en búsquedas Nearby normales.",
    )
    google_places_pause_between_pages: float = Field(
        default=2.0,
        description="Segundos de espera entre páginas cuando se recorren múltiples tiles.",
    )
    google_places_dense_grid_max_tile_radius_m: int = Field(
        default=600,
        description="En modo denso, usamos tiles más pequeños (más pasos) para cubrir zonas amplias.",
    )
    google_places_dense_pause_between_pages: float = Field(
        default=0.6,
        description="Pausa menor entre páginas en modo denso para que avance rápido aunque tome tiempo total.",
    )
    google_places_dense_max_results: int | None = Field(
        default=None,
        description="Máximo de resultados que aceptamos en modo denso (None = sin límite).",
    )
    denue_token: str | None = Field(
        default=None,
        validation_alias=AliasChoices("DENUE_TOKEN", "TALIA_DENUE_TOKEN"),
    )
    denue_base_url: str = Field(
        default="https://www.inegi.org.mx/app/api/denue/v1",
        validation_alias=AliasChoices("DENUE_BASE_URL", "TALIA_DENUE_BASE_URL"),
    )
    log_file_path: str = "/home/devuser/talia/logs/api.log"
    webchat_inactivity_hours: int | None = Field(
        default=None,
        description="Número de horas para reiniciar conversación webchat; usa default SQL cuando no se define.",
    )
    webchat_persist_session: bool = Field(
        default=True,
        description="Controla si el widget reutiliza session_id entre recargas.",
    )
    webchat_calendar_resource_id: str | None = Field(
        default=None,
        description="ID del recurso (calendar_resources.id) que expone disponibilidad en el webchat.",
    )
    webchat_calendar_timezone: str = Field(
        default="America/Mexico_City",
        description="Zona horaria preferida para mostrar la agenda cuando el usuario no especifica otra.",
    )
    webchat_default_organizacion_id: str | None = Field(
        default=None,
        description="Organización que se asignará por defecto a los visitantes del webchat.",
        validation_alias=AliasChoices(
            "WEBCHAT_DEFAULT_ORGANIZACION_ID",
            "WEBCHAT_ORGANIZACION_ID",
            "TALIA_WEBCHAT_DEFAULT_ORGANIZACION_ID",
            "TALIA_ORGANIZACION_ID",
        ),
    )
    webchat_default_tenant_alias: str | None = Field(
        default=None,
        description="Alias público asociado a la organización predeterminada del webchat.",
        validation_alias=AliasChoices(
            "WEBCHAT_DEFAULT_TENANT_ALIAS",
            "TALIA_WEBCHAT_DEFAULT_TENANT_ALIAS",
        ),
    )
    webchat_tenant_alias_map: dict[str, str] = Field(
        default_factory=dict,
        description="Mapa alias → organización para identificar tenants sin filtrar el UUID.",
        validation_alias=AliasChoices(
            "WEBCHAT_TENANT_ALIAS_MAP",
            "TALIA_WEBCHAT_TENANT_ALIAS_MAP",
        ),
    )
    whatsapp_default_organizacion_id: str | None = Field(
        default=None,
        description="Organización predeterminada para el canal WhatsApp.",
        validation_alias=AliasChoices(
            "WHATSAPP_DEFAULT_ORGANIZACION_ID",
            "TALIA_WHATSAPP_DEFAULT_ORGANIZACION_ID",
            "TALIA_ORGANIZACION_ID",
        ),
    )
    whatsapp_phone_org_map: dict[str, str] = Field(
        default_factory=dict,
        description="Mapa número Twilio (E.164) → organización para enrutar mensajes entrantes.",
        validation_alias=AliasChoices(
            "WHATSAPP_TENANT_PHONE_MAP",
            "TALIA_WHATSAPP_TENANT_PHONE_MAP",
        ),
    )
    webchat_calendar_default_days: int = Field(
        default=21,
        description="Ventana predeterminada (en días) para consultar disponibilidad del calendario.",
    )
    webchat_calendar_hold_minutes: int = Field(
        default=10,
        description="Minutos que se mantiene bloqueado un horario antes de confirmar la cita.",
    )
    webchat_reengage_minutes: int = Field(
        default=30,
        description="Minutos sin respuesta en webchat antes de que el bot intente reenganchar.",
    )
    webchat_reengage_max_attempts: int = Field(
        default=2,
        description="Intentos máximos de reenganche automático en conversaciones webchat.",
    )
    webchat_escalate_minutes: int = Field(
        default=0,
        ge=0,
        description="Minutos de espera adicionales después de los reenganches antes de escalar al vendedor. 0 dispara la escalación inmediata.",
    )
    whatsapp_inactivity_minutes: int = Field(
        default=24 * 60,
        description="Minutos de inactividad para abrir una nueva conversación de WhatsApp.",
        validation_alias=AliasChoices(
            "WHATSAPP_INACTIVITY_MINUTES",
            "TALIA_WHATSAPP_INACTIVITY_MINUTES",
        ),
        ge=2,
    )
    whatsapp_reengage_minutes: int = Field(
        default=30,
        description="Minutos sin respuesta del prospecto antes de que el bot envíe un mensaje de reenganche.",
        validation_alias=AliasChoices(
            "WHATSAPP_REENGAGE_MINUTES",
            "TALIA_WHATSAPP_REENGAGE_MINUTES",
        ),
        ge=3,
    )
    whatsapp_escalate_minutes: int = Field(
        default=120,
        description="Minutos sin respuesta tras el reenganche para escalar al vendedor asignado.",
        validation_alias=AliasChoices(
            "WHATSAPP_ESCALATE_MINUTES",
            "TALIA_WHATSAPP_ESCALATE_MINUTES",
        ),
        ge=4,
    )
    whatsapp_sales_template_sid: str | None = Field(
        default=None,
        description="Content SID de la plantilla de WhatsApp para notificar a vendedores.",
        validation_alias=AliasChoices(
            "WHATSAPP_SALES_TEMPLATE_SID",
            "TALIA_WHATSAPP_SALES_TEMPLATE_SID",
        ),
    )
    whatsapp_sales_appointment_template_sid: str | None = Field(
        default=None,
        description="Content SID de la plantilla de WhatsApp para notificar a vendedores sobre citas agendadas.",
        validation_alias=AliasChoices(
            "WHATSAPP_SALES_APPOINTMENT_TEMPLATE_SID",
            "TALIA_WHATSAPP_SALES_APPOINTMENT_TEMPLATE_SID",
        ),
    )
    whatsapp_sales_cancel_appointment_template_sid: str | None = Field(
        default=None,
        description="Content SID de la plantilla de WhatsApp para notificar a vendedores sobre cancelaciones de citas.",
        validation_alias=AliasChoices(
            "WHATSAPP_SALES_CANCEL_APPOINTMENT_TEMPLATE_SID",
            "TALIA_WHATSAPP_SALES_CANCEL_APPOINTMENT_TEMPLATE_SID",
        ),
    )
    webchat_sales_template_sid: str | None = Field(
        default=None,
        description="Content SID de la plantilla para notificar a vendedores cuando el lead viene del webchat.",
        validation_alias=AliasChoices(
            "WEBCHAT_SALES_TEMPLATE_SID",
            "TALIA_WEBCHAT_SALES_TEMPLATE_SID",
        ),
    )
    whatsapp_prompt_id: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "WHATSAPP_PROMPT_ID",
            "TALIA_WHATSAPP_PROMPT_ID",
        ),
    )
    whatsapp_prompt_version: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "WHATSAPP_PROMPT_VERSION",
            "TALIA_WHATSAPP_PROMPT_VERSION",
        ),
    )
    whatsapp_assistant_id: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "WHATSAPP_ASSISTANT_ID",
            "TALIA_WHATSAPP_ASSISTANT_ID",
        ),
    )
    messenger_page_access_token: str | None = Field(
        default=None,
        description="Token de página de Facebook necesario para responder a mensajes.",
        validation_alias=AliasChoices(
            "MESSENGER_PAGE_ACCESS_TOKEN",
            "TALIA_MESSENGER_PAGE_ACCESS_TOKEN",
        ),
    )
    messenger_verify_token: str | None = Field(
        default=None,
        description="Token que Facebook usa para verificar el webhook del canal Messenger.",
        validation_alias=AliasChoices(
            "MESSENGER_VERIFY_TOKEN",
            "TALIA_MESSENGER_VERIFY_TOKEN",
        ),
    )
    messenger_app_secret: str | None = Field(
        default=None,
        description="App Secret de Facebook para verificar las firmas de los webhooks.",
        validation_alias=AliasChoices(
            "MESSENGER_APP_SECRET",
            "TALIA_MESSENGER_APP_SECRET",
        ),
    )
    messenger_default_organizacion_id: str | None = Field(
        default=None,
        description="Organización por defecto que se usa cuando no se identifica el tenant via page_id.",
        validation_alias=AliasChoices(
            "MESSENGER_DEFAULT_ORGANIZACION_ID",
            "TALIA_MESSENGER_DEFAULT_ORGANIZACION_ID",
        ),
    )
    messenger_page_organizacion_map: dict[str, str] = Field(
        default_factory=dict,
        description="Mapa Facebook Page ID → organización para enrutar distintos tenants.",
        validation_alias=AliasChoices(
            "MESSENGER_PAGE_ORGANIZACION_MAP",
            "TALIA_MESSENGER_PAGE_ORGANIZACION_MAP",
        ),
    )
    messenger_prompt_id: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "MESSENGER_PROMPT_ID",
            "TALIA_MESSENGER_PROMPT_ID",
        ),
    )
    messenger_prompt_version: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "MESSENGER_PROMPT_VERSION",
            "TALIA_MESSENGER_PROMPT_VERSION",
        ),
    )
    messenger_assistant_id: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "MESSENGER_ASSISTANT_ID",
            "TALIA_MESSENGER_ASSISTANT_ID",
        ),
    )
    messenger_inactivity_hours: int | None = Field(
        default=None,
        description="Horas sin actividad para reiniciar la conversación de Messenger.",
    )
    conversation_summary_model: str = Field(
        default="gpt-4o-mini",
        description="Modelo que se usa para generar resúmenes de conversaciones antes de invocar al asistente.",
        validation_alias=AliasChoices(
            "CONVERSATION_SUMMARY_MODEL",
            "TALIA_CONVERSATION_SUMMARY_MODEL",
        ),
    )
    conversation_summary_temperature: float = Field(
        default=0.2,
        description="Temperatura utilizada al generar resúmenes.",
        validation_alias=AliasChoices(
            "CONVERSATION_SUMMARY_TEMPERATURE",
            "TALIA_CONVERSATION_SUMMARY_TEMPERATURE",
        ),
    )
    conversation_summary_max_output_tokens: int = Field(
        default=400,
        description="Máximo de tokens de salida para los resúmenes.",
        validation_alias=AliasChoices(
            "CONVERSATION_SUMMARY_MAX_OUTPUT_TOKENS",
            "TALIA_CONVERSATION_SUMMARY_MAX_OUTPUT_TOKENS",
        ),
    )
    conversation_summary_history_limit: int = Field(
        default=12,
        description="Cantidad de mensajes recientes que se consideran al construir el resumen.",
        validation_alias=AliasChoices(
            "CONVERSATION_SUMMARY_HISTORY_LIMIT",
            "TALIA_CONVERSATION_SUMMARY_HISTORY_LIMIT",
        ),
    )

    mail_username: str | None = Field(
        default=None,
        description="Usuario/correo remitente para invitaciones y notificaciones.",
        validation_alias=AliasChoices(
            "MAIL_USERNAME",
            "TALIA_MAIL_USERNAME",
        ),
    )
    mail_password: str | None = Field(
        default=None,
        description="Contraseña del buzón del asistente.",
        validation_alias=AliasChoices(
            "MAIL_PASSWORD",
            "MAIL_CONTRASENA",
            "TALIA_MAIL_PASSWORD",
            "TALIA_MAIL_CONTRASENA",
        ),
    )
    mail_incoming_server: str | None = Field(
        default=None,
        description="Servidor IMAP/POP del buzón.",
        validation_alias=AliasChoices(
            "MAIL_INCOMING_SERVER",
            "TALIA_MAIL_INCOMING_SERVER",
        ),
    )
    mail_incoming_port_imap: int | None = Field(
        default=None,
        description="Puerto IMAP para el buzón.",
        validation_alias=AliasChoices(
            "MAIL_INCOMING_PORT_IMAP",
            "TALIA_MAIL_INCOMING_PORT_IMAP",
        ),
    )
    mail_outgoing_server: str | None = Field(
        default=None,
        description="Servidor SMTP saliente.",
        validation_alias=AliasChoices(
            "MAIL_OUTGOING_SERVER",
            "TALIA_MAIL_OUTGOING_SERVER",
        ),
    )
    mail_outgoing_port_smtp: int | None = Field(
        default=None,
        description="Puerto SMTP para envíos.",
        validation_alias=AliasChoices(
            "MAIL_OUTGOING_PORT_SMTP",
            "TALIA_MAIL_OUTGOING_PORT_SMTP",
        ),
    )
    mail_use_tls: bool = Field(
        default=True,
        description="Indica si SMTP requiere STARTTLS/TLS.",
        validation_alias=AliasChoices(
            "MAIL_USE_TLS",
            "TALIA_MAIL_USE_TLS",
        ),
    )
    mail_use_ssl: bool = Field(
        default=False,
        description="Usa conexión SMTP sobre SSL/TLS implícito (por ejemplo puerto 465).",
        validation_alias=AliasChoices(
            "MAIL_USE_SSL",
            "TALIA_MAIL_USE_SSL",
        ),
    )
    mail_from_name: str | None = Field(
        default=None,
        description="Nombre descriptivo que aparecerá como remitente en los correos salientes.",
        validation_alias=AliasChoices(
            "MAIL_FROM_NAME",
            "TALIA_MAIL_FROM_NAME",
        ),
    )
    brevo_api_key: str | None = Field(
        default=None,
        description="API Key de Brevo para envíos SMTP/API.",
        validation_alias=AliasChoices("BREVO_API_KEY", "TALIA_BREVO_API_KEY"),
    )
    brevo_base_url: str = Field(
        default="https://api.brevo.com/v3",
        description="Endpoint base de la API de Brevo.",
        validation_alias=AliasChoices("BREVO_BASE_URL", "TALIA_BREVO_BASE_URL"),
    )

    model_config = SettingsConfigDict(env_file=".env", env_prefix="TALIA_", extra="allow")

    @staticmethod
    def _parse_kv_map(value: object) -> dict[str, str]:
        if value in (None, "", {}, []):
            return {}
        iterable: list[tuple[str, str]] = []
        if isinstance(value, str):
            candidate = value.strip()
            if not candidate:
                return {}
            parsed: object
            try:
                parsed = json.loads(candidate)
            except json.JSONDecodeError:
                parsed = None
            if isinstance(parsed, dict):
                iterable = [(str(key), str(val)) for key, val in parsed.items()]
            else:
                fragments = [
                    fragment.strip()
                    for fragment in candidate.replace(";", ",").replace("\n", ",").split(",")
                    if fragment.strip()
                ]
                for fragment in fragments:
                    if "=" in fragment:
                        alias, org = fragment.split("=", 1)
                    elif ":" in fragment:
                        alias, org = fragment.split(":", 1)
                    else:
                        continue
                    alias_key = alias.strip()
                    org_value = org.strip()
                    if alias_key and org_value:
                        iterable.append((alias_key, org_value))
        elif isinstance(value, dict):
            iterable = [(str(key), str(val)) for key, val in value.items()]
        if not iterable:
            return {}
        result: dict[str, str] = {}
        for alias_key, org_value in iterable:
            alias = alias_key.strip().lower()
            org = org_value.strip()
            if alias and org:
                result[alias] = org
        return result

    @field_validator("webchat_tenant_alias_map", mode="before")
    @classmethod
    def _validate_webchat_alias_map(cls, value: object) -> dict[str, str]:
        return cls._parse_kv_map(value)

    @field_validator("whatsapp_phone_org_map", mode="before")
    @classmethod
    def _validate_whatsapp_phone_map(cls, value: object) -> dict[str, str]:
        return cls._parse_kv_map(value)

    @field_validator("request_log_skip_prefixes", mode="before")
    @classmethod
    def _parse_request_log_skip_prefixes(cls, value):
        # Permite que una variable vacía use el default y que valores tipo CSV se conviertan en tupla.
        if value in (None, "", [], ()):
            return DEFAULT_REQUEST_LOG_SKIP_PREFIXES
        if isinstance(value, str):
            parts = [p.strip() for p in value.split(",") if p.strip()]
            return tuple(parts) if parts else DEFAULT_REQUEST_LOG_SKIP_PREFIXES
        if isinstance(value, (list, tuple)):
            return tuple(value)
        return value

    @field_validator("messenger_page_organizacion_map", mode="before")
    @classmethod
    def _validate_messenger_map(cls, value: object) -> dict[str, str]:
        return cls._parse_kv_map(value)


settings = Settings()
