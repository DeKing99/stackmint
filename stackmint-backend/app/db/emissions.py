# db/emissions.py

from app.db.client import supabase
from typing import List, Dict
from postgrest.exceptions import APIError
import logging

logger = logging.getLogger(__name__)


def _analytics_core_payload(row: Dict) -> Dict:
    return {
        "activity_id": row.get("activity_id"),
        "emission_factor_id": row.get("emission_factor_id"),
        "co2e": row.get("co2e"),
        "organization_id": row.get("organization_id"),
        "company_location_id": row.get("company_location_id"),
        "department_id": row.get("department_id"),
        "supplier_id": row.get("supplier_id"),
        "emission_category_id": row.get("emission_category_id"),
        "scope": row.get("scope"),
        "category": row.get("category"),
        "reporting_year": row.get("reporting_year"),
        "reporting_month": row.get("reporting_month"),
        "reporting_quarter": row.get("reporting_quarter"),
        "reporting_period": row.get("reporting_period"),
        "emissions_kgco2e": row.get("emissions_kgco2e"),
        "emissions_tco2e": row.get("emissions_tco2e"),
        "activity_quantity": row.get("activity_quantity"),
        "activity_unit": row.get("activity_unit"),
        "calculation_method": row.get("calculation_method"),
        "calculation_confidence": row.get("calculation_confidence"),
        "verification_status": row.get("verification_status"),
        "source_system": row.get("source_system"),
        "tags": row.get("tags"),
        "metadata": row.get("metadata"),
        "calculated_at": row.get("calculated_at"),
    }


def _legacy_core_payload(row: Dict) -> Dict:
    return {
        "activity_id": row.get("activity_id"),
        "emission_factor_id": row.get("emission_factor_id"),
        "co2e": row.get("co2e"),
        "calculated_at": row.get("calculated_at"),
    }


def _build_insert_candidates(rows: List[Dict]) -> List[List[Dict]]:
    full_rows = [dict(row) for row in rows]
    analytics_core_rows = [_analytics_core_payload(row) for row in rows]
    legacy_core_rows = [_legacy_core_payload(row) for row in rows]

    # Insert strategy:
    # 1) full_rows: richest payload for upgraded analytics schemas
    # 2) analytics_core_rows: reduced, schema-aligned analytics subset
    # 3) legacy_core_rows: backward-compatible minimal subset
    return [full_rows, analytics_core_rows, legacy_core_rows]


def insert_emissions(rows: List[Dict]):

    if not rows:
        logger.info("[Emissions Insert] No rows to insert")
        return

    logger.info(f"[Emissions Insert] Attempting to insert {len(rows)} rows")
    logger.info(f"[Emissions Insert] First row fields: {list(rows[0].keys()) if rows else 'N/A'}")
    logger.info(f"[Emissions Insert] First row sample: {rows[0] if rows else 'N/A'}")

    for attempt_num, candidate_rows in enumerate(_build_insert_candidates(rows), 1):
        try:
            fields_in_attempt = list(candidate_rows[0].keys()) if candidate_rows else []
            logger.info(f"[Emissions Insert] Attempt {attempt_num}: Inserting {len(candidate_rows)} rows with {len(fields_in_attempt)} fields: {fields_in_attempt}")
            supabase.table("company_emissions").insert(candidate_rows).execute()
            logger.info(f"[Emissions Insert] ✅ Success on attempt {attempt_num}")
            return
        except APIError as e:
            logger.warning(f"[Emissions Insert] Attempt {attempt_num} failed with APIError: {str(e)}")
            continue
        except Exception as e:
            logger.error(f"[Emissions Insert] Attempt {attempt_num} failed with unexpected error: {type(e).__name__}: {str(e)}")
            continue

    raise RuntimeError("Failed to insert emissions rows into company_emissions after all attempts")


def get_emission_factor(
    activity_type: str,
    unit: str,
    region: str | None = None,
    year: int | None = None,
):

    query = (
        supabase.table("emission_factors")
        .select("*")
        .eq("activity_type", activity_type)
        .eq("unit", unit)
    )

    if region:
        query = query.eq("region", region)

    if year is not None:
        query = query.eq("year", year)

    response = query.limit(1).execute()

    return response.data[0] if response.data else None