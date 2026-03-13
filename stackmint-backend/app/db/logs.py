# db/logs.py

from db.client import supabase
from datetime import datetime
from postgrest.exceptions import APIError


def log_parsing_event(upload_id: str, severity: str, message: str, row_number: int | None = None):
    common_payload = {
        "raw_upload_id": upload_id,
        "row_number": row_number,
        "error_message": message,
        "severity": severity,
        "created_at": datetime.utcnow().isoformat(),
    }

    candidate_payloads = [
        common_payload,
        {k: v for k, v in common_payload.items() if k != "row_number"},
        {
            "upload_id": upload_id,
            "message": message,
            "level": severity,
            "created_at": datetime.utcnow().isoformat(),
        },
    ]

    for payload in candidate_payloads:
        try:
            supabase.table("company_parsing_logs").insert(payload).execute()
            return
        except APIError:
            continue