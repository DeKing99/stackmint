# db/uploads.py

from datetime import datetime
from typing import Optional, Dict, Any, List
from db.client import supabase


def get_pending_upload() -> Optional[Dict[str, Any]]:
    """
    Fetch one upload with status='pending'
    """
    response = (
        supabase.table("company_raw_uploads")
        .select("*")
        .eq("status", "pending")
        .limit(1)
        .execute()
    )
    #im not too sure about the type ignore perhaps it could cause some issues later on.
    return response.data[0] if response.data else None  # type: ignore


def mark_as_processing(upload_id: str):
    """
    Mark upload as processing with real UTC timestamp
    """
    supabase.table("company_raw_uploads").update({
        "status": "processing",
        "processing_started_at": datetime.utcnow().isoformat()
    }).eq("id", upload_id).execute()


def mark_as_completed(upload_id: str):
    supabase.table("company_raw_uploads").update({
        "status": "completed",
        "processing_completed_at": datetime.utcnow().isoformat()
    }).eq("id", upload_id).execute()


def mark_as_failed(upload_id: str, error: str):
    supabase.table("company_raw_uploads").update({
        "status": "failed",
        "error_message": error,
        "processing_completed_at": datetime.utcnow().isoformat()
    }).eq("id", upload_id).execute()


def store_validated_rows(upload_id: str, rows: List[Dict[str, Any]]):
    """
    Insert validated rows into company_processed_data
    """
    payload = [
        {
            "upload_id": upload_id,
            "data": row
        }
        for row in rows
    ]

    supabase.table("company_processed_data").insert(payload).execute()