# db/activities.py

from app.db.client import supabase
from typing import List, Dict, Any
from datetime import date, datetime
import calendar
from decimal import Decimal, InvalidOperation
from uuid import UUID
from postgrest.exceptions import APIError
import logging

from app.parsing.schemas import SCHEMAS

logger = logging.getLogger(__name__)


def _serialize_row(row: Dict) -> Dict:
    serialized: Dict = {}
    for key, value in row.items():
        if isinstance(value, (date, datetime)):
            serialized[key] = value.isoformat()
        else:
            serialized[key] = value
    return serialized


def _to_float(value: object) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        try:
            return float(Decimal(text))
        except (InvalidOperation, ValueError):
            return None
    return None


def _parse_date(value: object) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if not isinstance(value, str):
        return None

    text = value.strip()
    if not text:
        return None

    if len(text) == 4 and text.isdigit():
        return date(int(text), 1, 1)
    if len(text) == 7:
        try:
            return datetime.strptime(text, "%Y-%m").date()
        except ValueError:
            return None

    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).date()
    except ValueError:
        return None


def _reporting_period_bounds(value: object) -> tuple[str | None, str | None]:
    parsed_date = _parse_date(value)
    if parsed_date is None:
        return (None, None)

    start = parsed_date.replace(day=1)
    end = parsed_date.replace(day=calendar.monthrange(parsed_date.year, parsed_date.month)[1])
    return (start.isoformat(), end.isoformat())


def _to_metadata(value: object) -> Dict[str, Any] | None:
    if isinstance(value, dict):
        return value
    return None


def _pick_quantity(row: Dict, activity_type: str) -> float | None:
    # Backward compatibility for pre-normalized payloads.
    legacy_value = _to_float(row.get("value"))
    if legacy_value is not None:
        return legacy_value

    schema = SCHEMAS.get(activity_type, {})
    fields = schema.get("fields", {}) if isinstance(schema, dict) else {}
    for field_name, field_def in fields.items():
        if isinstance(field_def, dict) and field_def.get("type") == "float":
            parsed = _to_float(row.get(field_name))
            if parsed is not None:
                return parsed
    return None


def _resolve_organization_id(raw_org_id: object) -> object:
    if not isinstance(raw_org_id, str):
        return raw_org_id

    org_id = raw_org_id.strip()
    if not org_id:
        return None

    # Already an internal UUID.
    try:
        UUID(org_id)
        return org_id
    except ValueError:
        pass

    # Try resolving Clerk external org id to internal UUID.
    response = (
        supabase.table("clerk_organisations")
        .select("id")
        .eq("clerk_org_id", org_id)
        .limit(1)
        .execute()
    )
    if response.data:
        first = response.data[0]
        if isinstance(first, dict):
            return first.get("id")

    return org_id


def _to_activity_insert_row(row: Dict) -> Dict:
    activity_type = str(row.get("activity_type") or "")
    schema = SCHEMAS.get(activity_type, {})
    scope = schema.get("scope") if isinstance(schema, dict) else None
    category = schema.get("emissions_category") if isinstance(schema, dict) else None

    raw_date = row.get("date")
    if isinstance(raw_date, (date, datetime)):
        activity_date = raw_date.isoformat()
    else:
        activity_date = str(raw_date) if raw_date is not None else None

    reporting_period_start, reporting_period_end = _reporting_period_bounds(activity_date)
    return {
        "organization_id": _resolve_organization_id(row.get("organization_id")),
        "source_upload_id": row.get("upload_id"),
        "activity_date": activity_date,
        "reporting_period_start": reporting_period_start,
        "reporting_period_end": reporting_period_end,
        "activity_type": activity_type,
        "scope": scope,
        "category": category,
        "company_department_id": row.get("company_department_id") or row.get("department_id"),
        "company_supplier_id": row.get("company_supplier_id") or row.get("supplier_id"),
        "quantity": _pick_quantity(row, activity_type),
        "unit": row.get("unit"),
        "spend_amount": _to_float(row.get("amount_spent")),
        "currency": row.get("currency"),
        "invoice_reference": row.get("invoice_reference"),
        "verification_status": row.get("verification_status"),
        "data_quality_score": _to_float(row.get("data_quality_score")),
        "calculation_method": row.get("calculation_method"),
        "metadata": _to_metadata(row.get("metadata")),
        "company_location_id": row.get("company_location_id"),
    }


def _to_activity_core_insert_row(row: Dict) -> Dict:
    return {
        "organization_id": row.get("organization_id"),
        "source_upload_id": row.get("source_upload_id"),
        "activity_date": row.get("activity_date"),
        "activity_type": row.get("activity_type"),
        "scope": row.get("scope"),
        "category": row.get("category"),
        "quantity": row.get("quantity"),
        "unit": row.get("unit"),
        "spend_amount": row.get("spend_amount"),
        "currency": row.get("currency"),
        "company_location_id": row.get("company_location_id"),
    }


def insert_activities(rows: List[Dict]) -> List[Dict[str, Any]]:

    if not rows:
        return []

    enriched_payload = [_to_activity_insert_row(_serialize_row(row)) for row in rows]
    # Try full analytics payload first, then fallback to core fields for older schemas.
    payload_candidates = [enriched_payload, [_to_activity_core_insert_row(r) for r in enriched_payload]]

    response_data: List[Dict[str, Any]] = []
    for idx, payload in enumerate(payload_candidates, start=1):
        try:
            response = supabase.table("company_activities").insert(payload).execute()
            if isinstance(response.data, list):
                response_data = [item for item in response.data if isinstance(item, dict)]
                break
        except APIError:
            logger.debug(
                "Insert into company_activities failed for payload candidate %s/%s",
                idx,
                len(payload_candidates),
                exc_info=True,
            )
            continue
        except Exception:
            logger.debug(
                "Unexpected insert error for company_activities payload candidate %s/%s",
                idx,
                len(payload_candidates),
                exc_info=True,
            )
            continue

    inserted_rows: List[Dict[str, Any]] = []
    for item in response_data:
        if isinstance(item, dict):
            inserted_rows.append(item)

    return inserted_rows


def get_activities_for_upload(upload_id: str) -> List[Dict[str, Any]]:
    response = (
        supabase.table("company_activities")
        .select("*")
        .eq("source_upload_id", upload_id)
        .execute()
    )
    if not isinstance(response.data, list):
        return []
    return [row for row in response.data if isinstance(row, dict)]