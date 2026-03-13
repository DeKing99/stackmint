from typing import Any, Dict, Mapping, Optional, List
from decimal import Decimal, InvalidOperation
from datetime import datetime

from supabase import Client
from parsing.schemas import SCHEMAS


class EmissionsCalculationError(Exception):
    pass


def _safe_get_str(data: Mapping[str, Any], key: str) -> Optional[str]:
    value = data.get(key)
    return value if isinstance(value, str) else None


def _safe_get_decimal(data: Mapping[str, Any], key: str) -> Optional[Decimal]:
    value = data.get(key)

    if isinstance(value, (int, float, str)):
        try:
            return Decimal(str(value))
        except InvalidOperation:
            return None

    return None


def _safe_get_int(data: Mapping[str, Any], key: str) -> Optional[int]:
    value = data.get(key)

    if isinstance(value, int):
        return value

    if isinstance(value, str) and value.isdigit():
        return int(value)

    return None


def _resolve_activity_value(row: Mapping[str, Any], activity_type: str) -> Optional[Decimal]:
    # Backward compatibility: honor pre-normalized "value" when present.
    direct_value = _safe_get_decimal(row, "value")
    if direct_value is not None:
        return direct_value

    schema = SCHEMAS.get(activity_type, {})
    schema_fields = schema.get("fields", {}) if isinstance(schema, Mapping) else {}

    # Use the first numeric schema field found in the row.
    for field_name, field_def in schema_fields.items():
        if not isinstance(field_def, Mapping):
            continue
        if field_def.get("type") != "float":
            continue

        parsed = _safe_get_decimal(row, str(field_name))
        if parsed is not None:
            return parsed

    return None


def _fetch_emission_factor(
    supabase: Client,
    activity_type: str,
    unit: Optional[str],
    region: Optional[str],
    year: Optional[int],
) -> Optional[Mapping[str, Any]]:
    attempts: List[tuple[bool, bool, bool]] = []

    if unit:
        if region and year is not None:
            attempts.append((True, True, True))
        if region:
            attempts.append((True, False, True))
        if year is not None:
            attempts.append((False, True, True))
        attempts.append((False, False, True))

    if region and year is not None:
        attempts.append((True, True, False))
    if region:
        attempts.append((True, False, False))
    if year is not None:
        attempts.append((False, True, False))
    attempts.append((False, False, False))

    for use_region, use_year, use_unit in attempts:
        query = (
            supabase.table("emission_factors")
            .select("*")
            .eq("activity_type", activity_type)
        )

        if use_unit and unit:
            query = query.eq("unit", unit)

        if use_region and region:
            query = query.eq("region", region)

        if use_year and year is not None:
            query = query.eq("year", year)

        response = query.limit(1).execute()
        if response.data:
            row = response.data[0]
            if isinstance(row, Mapping):
                return row

    return None


def calculate_emissions_for_row(
    supabase: Client,
    row: Dict[str, Any],
    activity_id: str,
) -> Dict[str, Any]:
    """
    Synchronous, enterprise-safe emissions calculation.
    Returns a row ready for DB insertion.
    """

    if not isinstance(row, Mapping):
        raise EmissionsCalculationError("Row must be a mapping")

    activity_type = _safe_get_str(row, "activity_type")
    unit = _safe_get_str(row, "unit")
    value = _resolve_activity_value(row, activity_type or "")
    region = _safe_get_str(row, "region")
    year = _safe_get_int(row, "year")

    if not activity_type or value is None:
        raise EmissionsCalculationError("Missing required emissions fields")

    factor_row = _fetch_emission_factor(
        supabase=supabase,
        activity_type=activity_type,
        unit=unit,
        region=region,
        year=year,
    )

    if not factor_row:
        raise EmissionsCalculationError(
            f"No emission factor found for activity_type={activity_type}"
        )

    factor_raw = factor_row.get("factor_value")

    try:
        factor = Decimal(str(factor_raw))
    except (InvalidOperation, TypeError):
        raise EmissionsCalculationError("Invalid factor_value")

    emissions_value = value * factor

    return {
        "activity_id": activity_id,
        "emission_factor_id": factor_row.get("id"),
        "co2e": float(emissions_value),
        "calculated_at": datetime.utcnow().isoformat(),
    }


def calculate_emissions_for_batch(
    supabase: Client,
    rows: List[Dict[str, Any]],
    inserted_activities: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Batch-safe emissions calculation.
    Fully Pylance clean.
    """

    emissions_rows: List[Dict[str, Any]] = []

    for index, row in enumerate(rows):
        try:
            activity = inserted_activities[index] if index < len(inserted_activities) else None
            activity_id = activity.get("id") if isinstance(activity, Mapping) else None
            if not isinstance(activity_id, str) or not activity_id:
                continue

            result = calculate_emissions_for_row(
                supabase=supabase,
                row=row,
                activity_id=activity_id,
            )
            emissions_rows.append(result)
        except EmissionsCalculationError:
            # In production you might log this
            continue

    return emissions_rows