import os
from supabase import create_client
from app.core.config import settings

SUPABASE_URL = os.getenv("SUPABASE_URL") or settings.SUPABASE_URL
SUPABASE_KEY = (
    os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    or settings.SUPABASE_SECRET_KEY
    or os.getenv("SUPABASE_SECRET_KEY")
    or os.getenv("supabase_service_role_key")
    or os.getenv("supabase_secret_key")
)

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("Supabase credentials not configured")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)