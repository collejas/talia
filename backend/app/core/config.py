"""Configuración central basada en variables de entorno."""

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


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
        default=(
            "/panel",
            "/api/panel",
            "/shared",
            "/api/shared",
            "/favicon",
            "/site",
            "/robots.txt",
            "/docs",
            "/openapi",
        ),
        description="Prefijos de ruta para los que no se registrarán eventos de request.started/completed.",
    )
    openai_api_key: str | None = None
    openai_assistant_id: str | None = None
    openai_prompt_version: str | None = None
    openai_project_id: str | None = None
    twilio_account_sid: str | None = None
    twilio_auth_token: str | None = None
    supabase_url: str | None = None
    supabase_service_role: str | None = None
    # Acepta varias variantes comunes del anon key para robustez
    supabase_anon: str | None = Field(
        default=None,
        validation_alias=AliasChoices("TALIA_SUPABASE_ANON", "SUPABASE_ANON_KEY", "SUPABASE_ANON"),
    )
    supabase_jwt_secret: str | None = None
    supabase_legacy_jwt_secret: str | None = None
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

    model_config = SettingsConfigDict(env_file=".env", env_prefix="TALIA_", extra="allow")


settings = Settings()
