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
    log_file_path: str = "/home/devuser/talia/logs/api.log"
    webchat_inactivity_hours: int | None = Field(
        default=None,
        description="Número de horas para reiniciar conversación webchat; usa default SQL cuando no se define.",
    )
    webchat_persist_session: bool = Field(
        default=True,
        description="Controla si el widget reutiliza session_id entre recargas.",
    )
    calendar_default_provider: str | None = Field(
        default=None,
        description="Proveedor de calendario preferido (ej. google, caldav).",
        validation_alias=AliasChoices(
            "CALENDARIO_DEFAULT_PROVIDER",
            "CALENDAR_DEFAULT_PROVIDER",
            "TALIA_CALENDARIO_DEFAULT_PROVIDER",
        ),
    )
    calendar_username: str | None = Field(
        default=None,
        description="Usuario con permisos de agenda en el servidor externo.",
        validation_alias=AliasChoices(
            "CALENDARIO_USERNAME",
            "CALENDAR_USERNAME",
            "TALIA_CALENDARIO_USERNAME",
        ),
    )
    calendar_password: str | None = Field(
        default=None,
        description="Contraseña o token para el servidor de calendario.",
        validation_alias=AliasChoices(
            "CALENDARIO_PASSWORD", "CALENDAR_PASSWORD", "TALIA_CALENDARIO_PASSWORD"
        ),
    )
    calendar_server_url: str | None = Field(
        default=None,
        description="URL base del servidor CalDAV/CardDAV.",
        validation_alias=AliasChoices(
            "CALENDARIO_SERVER_URL", "CALENDAR_SERVER_URL", "TALIA_CALENDARIO_SERVER_URL"
        ),
    )
    calendar_server_port: int | None = Field(
        default=None,
        description="Puerto del servidor de calendario (si aplica).",
        validation_alias=AliasChoices(
            "CALENDARIO_SERVER_PORT", "CALENDAR_SERVER_PORT", "TALIA_CALENDARIO_SERVER_PORT"
        ),
    )
    calendar_server_url_alternate: str | None = Field(
        default=None,
        description="Ruta alternativa del principal CalDAV para el usuario.",
        validation_alias=AliasChoices(
            "CALENDARIO_SERVER_URL_ALTERNATE",
            "CALENDAR_SERVER_URL_ALTERNATE",
            "TALIA_CALENDARIO_SERVER_URL_ALTERNATE",
        ),
    )
    calendar_full_calendar_url: str | None = Field(
        default=None,
        description="URL directa al calendario principal (CalDAV).",
        validation_alias=AliasChoices(
            "CALENDARIO_FULL_CALENDAR_URL",
            "CALENDAR_FULL_CALENDAR_URL",
            "TALIA_CALENDARIO_FULL_CALENDAR_URL",
        ),
    )
    calendar_full_contact_list_url: str | None = Field(
        default=None,
        description="URL directa al address book (CardDAV).",
        validation_alias=AliasChoices(
            "CALENDARIO_FULL_CONTACT_LIST_URL",
            "CALENDAR_FULL_CONTACT_LIST_URL",
            "TALIA_CALENDARIO_FULL_CONTACT_LIST_URL",
        ),
    )
    demo_availability_timezone: str = Field(
        default="America/Mexico_City",
        description="Zona horaria predeterminada para sugerir horarios de demo.",
        validation_alias=AliasChoices(
            "DEMO_AVAILABILITY_TIMEZONE",
            "CALENDARIO_DEMO_TIMEZONE",
            "TALIA_DEMO_AVAILABILITY_TIMEZONE",
        ),
    )
    demo_availability_work_days: str | None = Field(
        default="0,1,2,3,4",
        description="Días laborales permitidos para demos (0=Lunes ... 6=Domingo).",
        validation_alias=AliasChoices(
            "DEMO_AVAILABILITY_WORK_DAYS",
            "CALENDARIO_DEMO_WORK_DAYS",
            "TALIA_DEMO_AVAILABILITY_WORK_DAYS",
        ),
    )
    demo_availability_work_hours: str | None = Field(
        default="09:00-18:00",
        description="Bloques horarios laborales en formato HH:MM-HH:MM separados por coma.",
        validation_alias=AliasChoices(
            "DEMO_AVAILABILITY_WORK_HOURS",
            "CALENDARIO_DEMO_WORK_HOURS",
            "TALIA_DEMO_AVAILABILITY_WORK_HOURS",
        ),
    )
    demo_availability_slot_minutes: int = Field(
        default=45,
        description="Duración estándar de cada demo en minutos.",
        validation_alias=AliasChoices(
            "DEMO_AVAILABILITY_SLOT_MINUTES",
            "CALENDARIO_DEMO_SLOT_MINUTES",
            "TALIA_DEMO_AVAILABILITY_SLOT_MINUTES",
        ),
    )
    demo_availability_buffer_minutes: int = Field(
        default=15,
        description="Minutos de colchón antes y después de cada cita para evitar traslapes.",
        validation_alias=AliasChoices(
            "DEMO_AVAILABILITY_BUFFER_MINUTES",
            "CALENDARIO_DEMO_BUFFER_MINUTES",
            "TALIA_DEMO_AVAILABILITY_BUFFER_MINUTES",
        ),
    )
    demo_availability_lead_minutes: int = Field(
        default=120,
        description="Anticipación mínima (en minutos) entre la hora actual y la primera demo sugerida.",
        validation_alias=AliasChoices(
            "DEMO_AVAILABILITY_LEAD_MINUTES",
            "CALENDARIO_DEMO_LEAD_MINUTES",
            "TALIA_DEMO_AVAILABILITY_LEAD_MINUTES",
        ),
    )
    demo_availability_lookahead_days: int = Field(
        default=21,
        description="Número de días hacia adelante que se analizan para sugerir horarios.",
        validation_alias=AliasChoices(
            "DEMO_AVAILABILITY_LOOKAHEAD_DAYS",
            "CALENDARIO_DEMO_LOOKAHEAD_DAYS",
            "TALIA_DEMO_AVAILABILITY_LOOKAHEAD_DAYS",
        ),
    )
    demo_availability_max_slots: int = Field(
        default=5,
        description="Número máximo de horarios que se devolverán por consulta.",
        validation_alias=AliasChoices(
            "DEMO_AVAILABILITY_MAX_SLOTS",
            "CALENDARIO_DEMO_MAX_SLOTS",
            "TALIA_DEMO_AVAILABILITY_MAX_SLOTS",
        ),
    )
    demo_availability_holidays: str | None = Field(
        default=None,
        description="Fechas feriadas (YYYY-MM-DD) separadas por coma que deben excluirse de la agenda.",
        validation_alias=AliasChoices(
            "DEMO_AVAILABILITY_HOLIDAYS",
            "CALENDARIO_DEMO_HOLIDAYS",
            "TALIA_DEMO_AVAILABILITY_HOLIDAYS",
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

    model_config = SettingsConfigDict(env_file=".env", env_prefix="TALIA_", extra="allow")


settings = Settings()
