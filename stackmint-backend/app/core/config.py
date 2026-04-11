from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    SUPABASE_URL: str
    SUPABASE_SECRET_KEY: str = Field(
        validation_alias=AliasChoices(
            "SUPABASE_SECRET_KEY",
            "SUPABASE_SERVICE_ROLE_KEY",
            "supabase_secret_key",
            "supabase_service_role_key",
        )
    )
    OPENAI_KEY: str = Field(
        validation_alias=AliasChoices(
            "OPENAI_KEY",
            "OPENAI_API_KEY",
            "openai_key",
            "openai_api_key",
        )
    )
    CLERK_SECRET_KEY: str
    INGEST_WORKER_CONCURRENCY: int = 2
    INGEST_POLL_INTERVAL_SECONDS: float = 2.0
    EMISSION_FACTOR_CACHE_SIZE: int = 2048
    EMISSION_FACTOR_CACHE_TTL_SECONDS: int = 300
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()  # pyright: ignore[reportCallIssue]