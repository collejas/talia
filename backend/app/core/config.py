"""Configuración central basada en variables de entorno."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Valores globales leídos desde `.env` o el entorno."""

    environment: str = "development"
    openai_api_key: str | None = None
    openai_assistant_id: str | None = None
    openai_project_id: str | None = None
    twilio_account_sid: str | None = None
    twilio_auth_token: str | None = None
    supabase_url: str | None = None
    supabase_service_role: str | None = None
    geolocation_api_url: str | None = None
    geolocation_api_token: str | None = None
    log_file_path: str = "/home/devuser/talia/logs/api.log"
    webchat_inactivity_hours: int = 24

    model_config = SettingsConfigDict(env_file=".env", env_prefix="TALIA_", extra="allow")


settings = Settings()
