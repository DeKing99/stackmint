# from supabase import create_client
# import os
# from datetime import datetime, date
# from typing import Any

# SUPABASE_URL = os.getenv("SUPABASE_URL") or ""
# SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or ""

# supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


# def serialize_value(v: Any) -> Any:
#     """Convert datetime/date objects to ISO strings for JSON serialization."""
#     if isinstance(v, datetime):
#         return v.isoformat()
#     if isinstance(v, date):
#         return v.isoformat()
#     return v


# def serialize_row(row: dict) -> dict:
#     """Recursively serialize all values in a row dict."""
#     if isinstance(row, dict):
#         return {k: serialize_row(v) for k, v in row.items()}
#     elif isinstance(row, list):
#         return [serialize_row(item) for item in row]
#     else:
#         return serialize_value(row)


# def get_pending_upload():
#     response = (
#         supabase.table("company_raw_uploads")
#         .select("*")
#         .eq("status", "pending")
#         .limit(1)
#         .execute()
#     )

#     return response.data[0] if response.data else None


# def mark_as_processing(upload_id):
#     supabase.table("company_raw_uploads").update({
#         "status": "processing",
#         "processing_started_at": "now()"
#     }).eq("id", upload_id).execute()


# def mark_as_completed(upload_id):
#     supabase.table("company_raw_uploads").update({
#         "status": "completed",
#         "processing_completed_at": "now()"
#     }).eq("id", upload_id).execute()


# def mark_as_failed(upload_id, error):
#     supabase.table("company_raw_uploads").update({
#         "status": "failed",
#         "error_message": str(error),
#         "processing_completed_at": "now()"
#     }).eq("id", upload_id).execute()

# def store_validated_data(upload_id, rows):

#     for row in rows:
#         serialized_row = serialize_row(row)
#         supabase.table("company_processed_data").insert({
#             "upload_id": upload_id,
#             "data": serialized_row
#         }).execute()
