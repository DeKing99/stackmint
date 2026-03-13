# db/uploads.py

from typing import Optional, Dict, Any, List
from db.client import supabase
from postgrest.exceptions import APIError


def _detect_status_column() -> str:
    for column in ("parsing_status", "status"):
        try:
            supabase.table("company_raw_uploads").select("id").eq(column, "pending").limit(1).execute()
            return column
        except APIError:
            continue
    raise RuntimeError("No supported upload status column found")


def _update_upload_status(upload_id: str, new_status: str, error: str | None = None) -> None:
    status_column = _detect_status_column()
    payload: Dict[str, Any] = {status_column: new_status}

    if error is not None:
        try:
            supabase.table("company_raw_uploads").update({**payload, "error_message": error}).eq("id", upload_id).execute()
            return
        except APIError:
            pass

    supabase.table("company_raw_uploads").update(payload).eq("id", upload_id).execute()


def get_pending_upload() -> Optional[Dict[str, Any]]:
    """
    Fetch one upload with status='pending'
    """
    status_column = _detect_status_column()
    response = (
        supabase.table("company_raw_uploads")
        .select("*")
        .eq(status_column, "pending")
        .limit(1)
        .execute()
    )
    #im not too sure about the type ignore perhaps it could cause some issues later on.
    return response.data[0] if response.data else None  # type: ignore


def mark_as_processing(upload_id: str):
    """
    Mark upload as processing with real UTC timestamp
    """
    _update_upload_status(upload_id, "processing")


def mark_as_completed(upload_id: str):
    _update_upload_status(upload_id, "completed")


def mark_as_failed(upload_id: str, error: str):
    _update_upload_status(upload_id, "failed", error=error)


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