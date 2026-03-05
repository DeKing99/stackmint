from typing import Any, Dict, Mapping, Optional, List
from decimal import Decimal, InvalidOperation
from uuid import UUID

from supabase import Client


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


def calculate_emissions_for_row(
    supabase: Client,
    row: Dict[str, Any],
    company_id: UUID,
) -> Dict[str, Any]:
    """
    Synchronous, enterprise-safe emissions calculation.
    Returns a row ready for DB insertion.
    """

    if not isinstance(row, Mapping):
        raise EmissionsCalculationError("Row must be a mapping")

    activity_type = _safe_get_str(row, "activity_type")
    unit = _safe_get_str(row, "unit")
    value = _safe_get_decimal(row, "value")
    region = _safe_get_str(row, "region")
    year_raw = row.get("year")

    if not activity_type or not unit or value is None:
        raise EmissionsCalculationError("Missing required emissions fields")

    year: Optional[int] = None
    if isinstance(year_raw, int):
        year = year_raw
    elif isinstance(year_raw, str) and year_raw.isdigit():
        year = int(year_raw)

    query = (
        supabase.table("emission_factors")
        .select("*")
        .eq("activity_type", activity_type)
        .eq("unit", unit)
    )

    if region:
        query = query.eq("region", region)

    if year:
        query = query.eq("year", year)

    response = query.limit(1).execute()

    if not response.data:
        raise EmissionsCalculationError(
            f"No emission factor found for {activity_type}/{unit}"
        )

    factor_row = response.data[0]

    if not isinstance(factor_row, Mapping):
        raise EmissionsCalculationError("Invalid emission factor row")

    factor_raw = factor_row.get("factor_value")

    try:
        factor = Decimal(str(factor_raw))
    except (InvalidOperation, TypeError):
        raise EmissionsCalculationError("Invalid factor_value")

    emissions_value = value * factor

    return {
        "company_id": str(company_id),
        "upload_id": row.get("upload_id"),
        "row_index": row.get("row_index"),
        "activity_type": activity_type,
        "value": float(value),
        "unit": unit,
        "emissions_value": float(emissions_value),
        "region": region,
        "year": year,
    }


def calculate_emissions_for_batch(
    supabase: Client,
    company_id: UUID,
    rows: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Batch-safe emissions calculation.
    Fully Pylance clean.
    """

    emissions_rows: List[Dict[str, Any]] = []

    for row in rows:
        try:
            result = calculate_emissions_for_row(
                supabase=supabase,
                row=row,
                company_id=company_id,
            )
            emissions_rows.append(result)
        except EmissionsCalculationError:
            # In production you might log this
            continue

    return emissions_rows