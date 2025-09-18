# app/core/config.py
from sre_constants import CATEGORY_LINEBREAK
from pydantic_settings import BaseSettings

# Load settings from .env
class Settings(BaseSettings):
    SUPABASE_URL: str
    SUPABASE_SECRET_KEY: str
    OPENAI_KEY: str
    CLERK_SECRET_KEY: str

    class Config:
        env_file = ".env"

# Initialize settings
settings = Settings() # type: ignore