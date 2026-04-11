# db/uploads.py

from typing import Optional, Dict, Any, List
from datetime import datetime, timezone
import re
import logging
import threading
from app.db.client import supabase
from postgrest.exceptions import APIError


logger = logging.getLogger(__name__)

_status_column_cache: str | None = None
_status_column_lock = threading.Lock()


def _detect_status_column() -> str:
    global _status_column_cache

    if _status_column_cache:
        return _status_column_cache

    with _status_column_lock:
        if _status_column_cache:
            return _status_column_cache

        for column in ("parsing_status", "status"):
            try:
                supabase.table("company_raw_uploads").select("id").eq(column, "pending").limit(1).execute()
                _status_column_cache = column
                return column
            except APIError:
                continue

    raise RuntimeError("No supported upload status column found")


def _claim_upload(upload: Dict[str, Any], status_column: str, expected_status: str) -> bool:
    upload_id = upload.get("id")
    if not upload_id:
        return False

    query = (
        supabase.table("company_raw_uploads")
        .update({status_column: "processing"}, count="exact", returning="minimal")
        .eq("id", upload_id)
        .eq(status_column, expected_status)
    )

    # If updated_at is present, include it as a compare-and-swap guard.
    # This makes stale reclaims safer under concurrent workers.
    previous_updated_at = upload.get("updated_at")
    if isinstance(previous_updated_at, str) and previous_updated_at.strip():
        query = query.eq("updated_at", previous_updated_at)

    response = query.execute()
    if response.count is not None:
        return response.count > 0
    return bool(getattr(response, "data", None))


def _claim_pending_upload(status_column: str) -> Optional[Dict[str, Any]]:
    response = (
        supabase.table("company_raw_uploads")
        .select("*")
        .eq(status_column, "pending")
        .limit(25)
        .execute()
    )

    if not response.data:
        return None

    for item in response.data:
        if not isinstance(item, dict):
            continue
        if _claim_upload(item, status_column, "pending"):
            return item

    return None


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
    Claim one upload and transition it to processing.
    """
    status_column = _detect_status_column()
    claimed_pending = _claim_pending_upload(status_column)
    if claimed_pending:
        return claimed_pending

    # Recovery path: reclaim stale processing uploads that likely got stuck.
    stale = _get_stale_processing_upload(status_column)
    if stale and _claim_upload(stale, status_column, "processing"):
        return stale

    return None


def _parse_iso(value: Any) -> Optional[datetime]:
    if not isinstance(value, str):
        return None
    text = value.strip()
    if not text:
        return None
    try:
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        return datetime.fromisoformat(text)
    except ValueError:
        return None


def _get_stale_processing_upload(status_column: str, stale_after_seconds: int = 300) -> Optional[Dict[str, Any]]:
    response = (
        supabase.table("company_raw_uploads")
        .select("*")
        .eq(status_column, "processing")
        .limit(50)
        .execute()
    )

    if not response.data:
        return None

    now = datetime.now(timezone.utc)
    for item in response.data:
        if not isinstance(item, dict):
            continue
        ts = _parse_iso(item.get("updated_at") or item.get("created_at"))
        if ts is None:
            continue
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        age = (now - ts).total_seconds()
        if age >= stale_after_seconds:
            return item

    return None


def mark_as_processing(upload_id: str):
    """
    Mark upload as processing with real UTC timestamp
    """
    _update_upload_status(upload_id, "processing")


def mark_as_completed(upload_id: str):
    _update_upload_status(upload_id, "completed")


def mark_as_failed(upload_id: str, error: str):
    _update_upload_status(upload_id, "failed", error=error)


def mark_as_pending_review(upload_id: str, reason: str):
    payload: Dict[str, Any] = {
        "parsing_status": "pending_review",
        "error_message": reason,
    }
    supabase.table("company_raw_uploads").update(payload).eq("id", upload_id).execute()


def set_upload_activity_type(upload_id: str, activity_type: str):
    supabase.table("company_raw_uploads").update({"activity_type": activity_type}).eq("id", upload_id).execute()


def update_upload_fields(upload_id: str, fields: Dict[str, Any]):
    if not fields:
        return

    # Some environments don't yet have all optional analytics columns.
    # Retry by stripping unknown columns reported by PostgREST schema cache.
    remaining = dict(fields)
    while remaining:
        try:
            supabase.table("company_raw_uploads").update(remaining).eq("id", upload_id).execute()
            return
        except APIError as exc:
            message = ""
            if isinstance(exc.args, tuple) and exc.args:
                first = exc.args[0]
                if isinstance(first, dict):
                    message = str(first.get("message") or "")
                else:
                    message = str(first)

            match = re.search(r"Could not find the '([^']+)' column", message)
            if not match:
                raise

            missing_column = match.group(1)
            if missing_column not in remaining:
                raise

            logger.warning(
                "Skipping unknown column '%s' while updating upload %s",
                missing_column,
                upload_id,
            )
            remaining.pop(missing_column, None)

    logger.info("No supported metadata columns to update for upload %s", upload_id)


def save_upload_inference_audit(
    upload_id: str,
    inferred_activity_type: Optional[str] = None,
    inference_confidence: Optional[float] = None,
    inference_second_best_type: Optional[str] = None,
    inference_second_best_score: Optional[float] = None,
    activity_type_review_status: Optional[str] = None,
    activity_type_review_reason: Optional[str] = None,
):
    payload: Dict[str, Any] = {
        "id": upload_id,
    }
    if inferred_activity_type is not None:
        payload["inferred_activity_type"] = inferred_activity_type
    if inference_confidence is not None:
        payload["inference_confidence"] = inference_confidence
    if inference_second_best_type is not None:
        payload["inference_second_best_type"] = inference_second_best_type
    if inference_second_best_score is not None:
        payload["inference_second_best_score"] = inference_second_best_score
    if activity_type_review_status is not None:
        payload["activity_type_review_status"] = activity_type_review_status
    if activity_type_review_reason is not None:
        payload["activity_type_review_reason"] = activity_type_review_reason

    # Best effort: schema can differ per environment.
    try:
        supabase.table("company_raw_uploads").update(payload).eq("id", upload_id).execute()
    except Exception:
        pass


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