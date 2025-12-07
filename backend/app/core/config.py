"""Configuración central basada en variables de entorno."""

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
    webchat_calendar_default_days: int = Field(
        default=21,
        description="Ventana predeterminada (en días) para consultar disponibilidad del calendario.",
    )
    webchat_calendar_hold_minutes: int = Field(
        default=10,
        description="Minutos que se mantiene bloqueado un horario antes de confirmar la cita.",
    )
    whatsapp_inactivity_hours: int = Field(
        default=24,
        description="Horas de inactividad para abrir una nueva conversación de WhatsApp.",
        validation_alias=AliasChoices(
            "WHATSAPP_INACTIVITY_HOURS",
            "TALIA_WHATSAPP_INACTIVITY_HOURS",
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

    model_config = SettingsConfigDict(env_file=".env", env_prefix="TALIA_", extra="allow")

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


settings = Settings()
