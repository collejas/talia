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
    log_file_path: str = "/home/devuser/talia/logs/api.log"
    webchat_inactivity_hours: int | None = Field(
        default=None,
        description="Número de horas para reiniciar conversación webchat; usa default SQL cuando no se define.",
    )
    webchat_persist_session: bool = Field(
        default=True,
        description="Controla si el widget reutiliza session_id entre recargas.",
    )
    model_config = SettingsConfigDict(env_file=".env", env_prefix="TALIA_", extra="allow")


settings = Settings()
