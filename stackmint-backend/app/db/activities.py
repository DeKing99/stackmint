# db/activities.py

from db.client import supabase
from typing import List, Dict, Any
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from uuid import UUID

from parsing.schemas import SCHEMAS


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

    return {
        "organization_id": _resolve_organization_id(row.get("organization_id")),
        "source_upload_id": row.get("upload_id"),
        "activity_date": activity_date,
        "activity_type": activity_type,
        "scope": scope,
        "category": category,
        "quantity": _pick_quantity(row, activity_type),
        "unit": row.get("unit"),
        "spend_amount": _to_float(row.get("amount_spent")),
        "currency": row.get("currency"),
        "company_location_id": row.get("company_location_id"),
    }


def insert_activities(rows: List[Dict]) -> List[Dict[str, Any]]:

    if not rows:
        return []

    payload = [_to_activity_insert_row(_serialize_row(row)) for row in rows]
    response = supabase.table("company_activities").insert(payload).execute()
    if not isinstance(response.data, list):
        return []

    inserted_rows: List[Dict[str, Any]] = []
    for item in response.data:
        if isinstance(item, dict):
            inserted_rows.append(item)

    return inserted_rows