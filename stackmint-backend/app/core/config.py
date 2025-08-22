# app/core/config.py
from pydantic_settings import BaseSettings

# Load settings from .env
class Settings(BaseSettings):
    SUPABASE_URL: str
    SUPABASE_SECRET_KEY: str
    OPENAI_KEY: str

    class Config:
        env_file = ".env"

# Initialize settings
settings = Settings() # type: ignore