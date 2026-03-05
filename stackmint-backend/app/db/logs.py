# db/logs.py

from db.client import supabase
from datetime import datetime


def log_parsing_event(upload_id: str, level: str, message: str):

    supabase.table("company_parsing_logs").insert({
        "upload_id": upload_id,
        "level": level,
        "message": message,
        "created_at": datetime.utcnow().isoformat()
    }).execute()