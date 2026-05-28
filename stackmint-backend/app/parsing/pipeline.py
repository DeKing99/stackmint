import time
import logging
import os
import math
import json
from typing import Dict, Any, List, Optional, cast
from pathlib import Path
import re
from datetime import datetime
from uuid import UUID

from app.parsing.extractors import extract_rows
from app.parsing.mapping import normalize_columns
from app.parsing.validation import validate_row, ValidationError
from app.parsing.pdf import extract_pdf_with_ai
from app.parsing.storage import resolve_upload_file_path
from app.parsing.schemas import SCHEMAS
from app.parsing.activity_type_inference import infer_activity_type

from app.db.uploads import mark_as_completed, mark_as_failed
from app.db.uploads import mark_as_pending_review, save_upload_inference_audit, set_upload_activity_type
from app.db.uploads import update_upload_fields
from app.db.mappings import get_upload_mapping
from app.db.activities import insert_activities, get_activities_for_upload
from app.db.emissions import insert_emissions
from app.db.logs import log_parsing_event
from app.core.config import settings

from app.parsing.emissions import calculate_emissions_for_batch

from supabase import create_client

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

CANONICAL_ACTIVITY_TYPE_TO_SCHEMA_ACTIVITY_TYPE: Dict[str, str] = {
    "stationary_combustion_liquid_fuels": "stationary_combustion",
    "stationary_combustion_gaseous_fuels": "stationary_combustion",
    "purchased_electricity_uk_grid": "purchased_electricity",
    "electricity_for_evs": "purchased_electricity",
    "freight_hgv": "upstream_transport",
    "freight_air": "upstream_transport",
    "freight_cargo_ship": "upstream_transport",
    "business_travel_air": "business_travel",
    "business_travel_rail": "business_travel",
    "hotel_stays": "business_travel",
    "waste_plastic": "waste_generated",
    "waste_construction": "waste_generated",
    "materials_construction": "purchased_goods",
    "fugitive_refrigerants_blends": "fugitive_emissions",
    "water_supply": "water_usage",
    "homeworking_heating": "employee_commuting",
    "managed_vehicle_hgv": "mobile_combustion",
    "well_to_tank_liquid_fuels": "stationary_combustion",
    "secr_transport": "upstream_transport",
}

ENTERPRISE_ROW_PASSTHROUGH_FIELDS = (
    "department_id",
    "supplier_id",
    "emission_category_id",
    "source_system",
    "invoice_number",
    "reference_code",
    "description",
    "notes",
    "data_quality_score",
    "verification_status",
    "calculation_method",
    "reporting_period",
    "tags",
    "metadata",
    "amount_spent",
    "currency",
    "category",
    "factor_activity_type",
)


class ActivityTypeReviewRequired(Exception):
    pass


def _format_upload_summary(
    upload: Dict[str, Any],
    upload_id: str,
    resolved_activity_type: str,
    validated_count: int,
    error_count: int,
    emissions_count: int,
    skipped_count: int,
    duration: float,
) -> str:
    file_name = upload.get("file_name") or upload.get("storage_path") or "unknown_file"
    return (
        "[UploadSummary] "
        f"id={upload_id} "
        f"file={file_name} "
        f"activity_type={resolved_activity_type} "
        f"validated={validated_count} "
        f"errors={error_count} "
        f"emissions={emissions_count} "
        f"skipped={skipped_count} "
        f"duration_s={duration:.2f}"
    )


def _preview_activity_ids(rows: List[Dict[str, Any]], limit: int = 10) -> str:
    ids = [row.get("id") for row in rows if isinstance(row, dict) and row.get("id")]
    if not ids:
        return "[]"
    preview = ids[:limit]
    suffix = " ..." if len(ids) > limit else ""
    return f"{preview}{suffix} (total={len(ids)})"


def _is_empty_cell(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, float) and math.isnan(value):
        return True
    if isinstance(value, str) and value.strip().lower() in {"", "none", "null", "nan", "n/a", "na", "-"}:
        return True
    return False


def _is_effectively_empty_row(row: Dict[str, Any]) -> bool:
    if not row:
        return True
    return all(_is_empty_cell(v) for v in row.values())


def _safe_int(value: Any) -> int | None:
    if _is_empty_cell(value):
        return None
    try:
        return int(float(str(value).strip()))
    except Exception:
        return None


def _safe_float(value: Any) -> float | None:
    if _is_empty_cell(value):
        return None
    try:
        return float(str(value).strip())
    except Exception:
        return None


def _normalize_activity_type(candidate: str) -> str:
    if candidate in SCHEMAS:
        return candidate
    return CANONICAL_ACTIVITY_TYPE_TO_SCHEMA_ACTIVITY_TYPE.get(candidate, candidate)


def _is_uuid_like(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    text = value.strip()
    if not text:
        return False
    try:
        UUID(text)
        return True
    except ValueError:
        return False


def _safe_dict(value: Any) -> Dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str) and value.strip():
        try:
            parsed = json.loads(value)
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            return {}
    return {}


def _get_upload_enterprise_inputs(upload: Dict[str, Any]) -> Dict[str, Any]:
    # Preferred source: parsing_stage_summary.enterprise_inputs from the upload form.
    stage_summary = _safe_dict(upload.get("parsing_stage_summary"))
    enterprise_inputs = _safe_dict(stage_summary.get("enterprise_inputs"))
    if enterprise_inputs:
        return enterprise_inputs

    # Fallback source: upload metadata payload.
    metadata = _safe_dict(upload.get("metadata"))
    fallback_inputs = _safe_dict(metadata.get("enterprise_inputs"))
    if fallback_inputs:
        return fallback_inputs

    return {}


def _preclean_row(row: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normalize raw spreadsheet exports to reduce downstream validator noise.
    """
    cleaned: Dict[str, Any] = {}
    for raw_key, raw_value in row.items():
        key = str(raw_key).strip() if raw_key is not None else ""
        if not key:
            continue

        if isinstance(raw_value, str):
            value = raw_value.strip()
            cleaned[key] = None if _is_empty_cell(value) else value
        elif isinstance(raw_value, float) and math.isnan(raw_value):
            cleaned[key] = None
        else:
            cleaned[key] = raw_value
    return cleaned


def _normalize_lookup_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.strip().lower())


def _fill_missing_required_from_unmapped(
    mapped_row: Dict[str, Any],
    unmapped: Dict[str, Any],
    resolved_activity_type: str,
) -> Dict[str, Any]:
    """
    Rescue missing required fields from unmapped columns using curated aliases.
    """
    schema = SCHEMAS.get(resolved_activity_type, {})
    fields = schema.get("fields", {})

    normalized_unmapped = {
        _normalize_lookup_key(str(k)): v
        for k, v in unmapped.items()
        if isinstance(k, str)
    }

    rescue_aliases: Dict[str, List[str]] = {
        "gas_type": ["refrigerant", "refrigeranttype", "gas", "ghggas", "fugitivegas"],
        "amount_released": ["amount", "quantity", "kg", "leakage", "leakageamount", "released"],
        "fuel_type": ["fuel", "fuelcategory", "fuelname"],
        "consumption": ["usage", "quantity", "amount", "value"],
        "distance": ["tripdistance", "distancetravelled", "mileage"],
        "facility_id": ["facility", "site", "location", "plant", "facilityname"],
        "date": ["activitydate", "transactiondate", "invoice_date", "billingdate"],
        "unit": ["uom", "measure", "unitofmeasure"],
        "year": ["fiscalyear", "reportingyear", "calendaryear"],
    }

    for field_name, field_def in fields.items():
        if not isinstance(field_def, dict):
            continue
        if not field_def.get("required"):
            continue
        if not _is_empty_cell(mapped_row.get(field_name)):
            continue

        for alias in rescue_aliases.get(str(field_name), []):
            alias_key = _normalize_lookup_key(alias)
            if alias_key not in normalized_unmapped:
                continue

            candidate = normalized_unmapped[alias_key]
            if _is_empty_cell(candidate):
                continue

            mapped_row[field_name] = candidate
            break

    return mapped_row


def _is_date_like(value: Any) -> bool:
    if not isinstance(value, str):
        return False

    s = value.strip()
    if not s:
        return False

    for fmt in (
        "%Y-%m-%d",
        "%Y/%m/%d",
        "%d-%m-%Y",
        "%m-%d-%Y",
        "%m/%d/%Y",
        "%d/%m/%Y",
        "%m.%d.%Y",
        "%d.%m.%Y",
    ):
        try:
            datetime.strptime(s, fmt)
            return True
        except Exception:
            continue

    return bool(re.fullmatch(r"\d{4}", s))


def _normalize_unit_token(value: Any) -> str | None:
    if not isinstance(value, str):
        return None

    token = re.sub(r"[^a-z0-9]", "", value.strip().lower())
    if not token:
        return None

    unit_map = {
        "kwh": "kwh",
        "kilowatthour": "kwh",
        "kilowatthours": "kwh",
        "mwh": "mwh",
        "therm": "therms",
        "therms": "therms",
        "m3": "m3",
        "cubicmeter": "m3",
        "cubicmeters": "m3",
        "liter": "liters",
        "litre": "liters",
        "litres": "liters",
        "liters": "liters",
        "gallon": "gallons",
        "gallons": "gallons",
        "mile": "miles",
        "miles": "miles",
        "km": "km",
        "kilometer": "km",
        "kilometers": "km",
        "kilometre": "km",
        "kilometres": "km",
        "ton": "tonnes",
        "tons": "tonnes",
        "tonne": "tonnes",
        "tonnes": "tonnes",
        "kg": "kg",
    }
    return unit_map.get(token)


def _infer_missing_required_from_values(
    mapped_row: Dict[str, Any],
    raw_row: Dict[str, Any],
    resolved_activity_type: str,
) -> Dict[str, Any]:
    """
    Heuristic recovery for headerless or badly-mapped rows using value patterns.
    """
    schema = SCHEMAS.get(resolved_activity_type, {})
    fields = schema.get("fields", {})

    noise_tokens = {
        "urgent",
        "note",
        "notes",
        "n/a",
        "na",
        "none",
        "null",
        "misc",
        "other",
    }

    values = [v for v in raw_row.values() if not _is_empty_cell(v)]

    used_indexes: set[int] = set()
    for idx, value in enumerate(values):
        if value in mapped_row.values():
            used_indexes.add(idx)

    def _next_value(predicate):
        for i, v in enumerate(values):
            if i in used_indexes:
                continue
            if predicate(v):
                used_indexes.add(i)
                return v
        return None

    for field_name, field_def in fields.items():
        if not isinstance(field_def, dict):
            continue
        if not field_def.get("required"):
            continue
        if not _is_empty_cell(mapped_row.get(field_name)):
            continue

        field_type = field_def.get("type")

        if field_name == "date":
            candidate = _next_value(_is_date_like)
            if candidate is not None:
                mapped_row[field_name] = candidate
            continue

        if field_name == "year":
            candidate = _next_value(lambda v: (_safe_int(v) or 0) >= 1900 and (_safe_int(v) or 0) <= 2100)
            if candidate is not None:
                mapped_row[field_name] = candidate
            continue

        if field_name == "unit":
            candidate = _next_value(lambda v: _normalize_unit_token(v) is not None)
            if candidate is not None:
                mapped_row[field_name] = _normalize_unit_token(candidate)
            continue

        if field_type == "float":
            candidate = _next_value(lambda v: _safe_float(v) is not None)
            if candidate is not None:
                mapped_row[field_name] = candidate
            continue

        if field_type == "string":
            candidate = _next_value(
                lambda v: isinstance(v, str)
                and not _is_date_like(v)
                and _normalize_unit_token(v) is None
                and _safe_float(v) is None
                and v.strip().lower() not in noise_tokens
            )
            if candidate is not None:
                mapped_row[field_name] = candidate

    return mapped_row


def _apply_carry_forward_fallbacks(
    mapped_row: Dict[str, Any],
    resolved_activity_type: str,
    carry_state: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Fill sparse rows where spreadsheet exports leave repeated dimensions blank.
    """
    schema = SCHEMAS.get(resolved_activity_type, {})
    fields = schema.get("fields", {})

    carry_eligible = {
        "date",
        "facility_id",
        "unit",
        "gas_type",
        "fuel_type",
        "travel_mode",
        "transport_mode",
        "commute_mode",
        "waste_type",
        "category",
        "currency",
        "region",
        "year",
    }

    for field_name, field_def in fields.items():
        if field_name not in carry_eligible:
            continue
        if not isinstance(field_def, dict):
            continue
        if not field_def.get("required"):
            continue

        current = mapped_row.get(field_name)
        if _is_empty_cell(current):
            previous = carry_state.get(field_name)
            if not _is_empty_cell(previous):
                mapped_row[field_name] = previous

    return mapped_row


def _compute_quality_summary(validated_count: int, error_count: int) -> Dict[str, float | int]:
    total = validated_count + error_count
    score = (validated_count / total) * 100 if total else 0.0
    return {
        "total_rows": total,
        "validated_rows": validated_count,
        "error_rows": error_count,
        "quality_score": round(score, 2),
    }


def _derive_date_string_from_row(row: Dict[str, Any]) -> str | None:
    year = _safe_int(row.get("year"))
    if year is None or year < 1900 or year > 2100:
        return None

    month = _safe_int(row.get("month")) or 1
    if month < 1 or month > 12:
        month = 1

    return f"{year:04d}-{month:02d}-01"


def _apply_required_field_fallbacks(
    mapped_row: Dict[str, Any],
    upload: Dict[str, Any],
    resolved_activity_type: str,
) -> Dict[str, Any]:
    schema = SCHEMAS.get(resolved_activity_type, {})
    fields = schema.get("fields", {})

    if "facility_id" in fields and _is_empty_cell(mapped_row.get("facility_id")):
        fallback_facility = upload.get("company_location_id") or upload.get("file_site_id")
        if not _is_empty_cell(fallback_facility):
            mapped_row["facility_id"] = str(fallback_facility)

    if "date" in fields and _is_empty_cell(mapped_row.get("date")):
        derived = _derive_date_string_from_row(mapped_row)
        if derived:
            mapped_row["date"] = derived
        else:
            created_at = upload.get("created_at")
            if isinstance(created_at, str) and len(created_at) >= 10:
                # Keep only ISO date part (YYYY-MM-DD) from timestamp fallback.
                mapped_row["date"] = created_at[:10]

    return mapped_row


def _apply_enterprise_upload_fallbacks(
    mapped_row: Dict[str, Any],
    upload: Dict[str, Any],
) -> Dict[str, Any]:
    enterprise_inputs = _get_upload_enterprise_inputs(upload)
    if not enterprise_inputs:
        return mapped_row

    if _is_empty_cell(mapped_row.get("reporting_period")):
        reporting_period = enterprise_inputs.get("reporting_period")
        if isinstance(reporting_period, str) and reporting_period.strip():
            mapped_row["reporting_period"] = reporting_period.strip()

    if _is_empty_cell(mapped_row.get("invoice_number")):
        invoice_number = enterprise_inputs.get("invoice_number")
        if isinstance(invoice_number, str) and invoice_number.strip():
            mapped_row["invoice_number"] = invoice_number.strip()

    if _is_empty_cell(mapped_row.get("amount_spent")):
        spend_amount = _safe_float(enterprise_inputs.get("spend_amount"))
        if spend_amount is not None:
            mapped_row["amount_spent"] = spend_amount

    if _is_empty_cell(mapped_row.get("category")):
        category = enterprise_inputs.get("category")
        if isinstance(category, str) and category.strip():
            mapped_row["category"] = category.strip()

    supplier_value = enterprise_inputs.get("supplier")
    if _is_empty_cell(mapped_row.get("supplier_id")) and _is_uuid_like(supplier_value):
        mapped_row["supplier_id"] = str(supplier_value).strip()

    department_value = enterprise_inputs.get("department")
    if _is_empty_cell(mapped_row.get("department_id")) and _is_uuid_like(department_value):
        mapped_row["department_id"] = str(department_value).strip()

    current_metadata = mapped_row.get("metadata")
    merged_metadata: Dict[str, Any] = {}
    if isinstance(current_metadata, dict):
        merged_metadata.update(current_metadata)

    if isinstance(supplier_value, str) and supplier_value.strip() and not _is_uuid_like(supplier_value):
        merged_metadata["supplier_name"] = supplier_value.strip()
    if isinstance(department_value, str) and department_value.strip() and not _is_uuid_like(department_value):
        merged_metadata["department_name"] = department_value.strip()
    if merged_metadata:
        mapped_row["metadata"] = merged_metadata

    if _is_empty_cell(mapped_row.get("source_system")):
        mapped_row["source_system"] = "stackmint_upload"

    return mapped_row


def _propagate_enterprise_fields(
    validated_row: Dict[str, Any],
    mapped_row: Dict[str, Any],
) -> Dict[str, Any]:
    for field_name in ENTERPRISE_ROW_PASSTHROUGH_FIELDS:
        value = mapped_row.get(field_name)
        if _is_empty_cell(value):
            continue
        validated_row[field_name] = value

    if _is_empty_cell(validated_row.get("amount_spent")):
        spend_amount = _safe_float(mapped_row.get("spend_amount"))
        if spend_amount is not None:
            validated_row["amount_spent"] = spend_amount

    return validated_row


def _resolve_upload_activity_type(
    upload: Dict[str, Any],
    raw_rows: List[Dict[str, Any]],
) -> str:
    upload_id = upload.get("id")
    raw_activity_type = upload.get("activity_type")
    if isinstance(raw_activity_type, str):
        candidate = raw_activity_type.strip()
        normalized_candidate = _normalize_activity_type(candidate)
        if normalized_candidate in SCHEMAS:
            # Guard against stale/manual type mismatches on messy real-world files.
            inference_for_conflict = infer_activity_type(upload, raw_rows)
            if (
                inference_for_conflict.activity_type
                and inference_for_conflict.activity_type != normalized_candidate
                and (
                    inference_for_conflict.confidence >= 0.65
                    or inference_for_conflict.score >= 8.0
                )
            ):
                if isinstance(upload_id, str) and upload_id:
                    save_upload_inference_audit(
                        upload_id,
                        inferred_activity_type=inference_for_conflict.activity_type,
                        inference_confidence=inference_for_conflict.confidence,
                        inference_second_best_type=inference_for_conflict.second_best_activity_type,
                        inference_second_best_score=inference_for_conflict.second_best_score,
                        activity_type_review_status="auto_corrected",
                        activity_type_review_reason=(
                            "Provided activity type conflicted with file structure; "
                            f"auto-corrected to {inference_for_conflict.activity_type}."
                        ),
                    )
                return inference_for_conflict.activity_type

            if isinstance(upload_id, str) and upload_id:
                save_upload_inference_audit(
                    upload_id,
                    activity_type_review_status="manual_override",
                    activity_type_review_reason=(
                        "Activity type supplied explicitly by user or reviewer."
                        if candidate == normalized_candidate
                        else (
                            "Canonical activity type supplied by user/reviewer and "
                            f"mapped to schema type {normalized_candidate}."
                        )
                    ),
                )
            return normalized_candidate

    inference = infer_activity_type(upload, raw_rows)
    if isinstance(upload_id, str) and upload_id:
        save_upload_inference_audit(
            upload_id,
            inferred_activity_type=inference.activity_type,
            inference_confidence=inference.confidence,
            inference_second_best_type=inference.second_best_activity_type,
            inference_second_best_score=inference.second_best_score,
            activity_type_review_status=(
                "pending_review" if inference.review_required else "auto_accepted"
            ),
            activity_type_review_reason=(
                "Confidence below auto-accept threshold; awaiting manual confirmation."
                if inference.review_required
                else "Auto-accepted by inference engine."
            ),
        )

    if not inference.activity_type:
        reason = "Could not infer activity type from file. Manual review is required."
        if isinstance(upload_id, str) and upload_id:
            mark_as_pending_review(upload_id, reason)
        raise ActivityTypeReviewRequired(reason)

    if inference.review_required:
        reason = (
            f"Suggested {inference.activity_type} at confidence {inference.confidence:.2f}. "
            "Manual confirmation is required before parsing continues."
        )
        if isinstance(upload_id, str) and upload_id:
            mark_as_pending_review(upload_id, reason)
        raise ActivityTypeReviewRequired(reason)

    if isinstance(upload_id, str) and upload_id:
        try:
            set_upload_activity_type(upload_id, inference.activity_type)
        except Exception:
            logger.warning("Failed to persist inferred activity type for upload %s", upload_id)

    logger.info(
        "Inferred activity_type=%s confidence=%.2f score=%.2f second=%s second_score=%.2f for upload=%s",
        inference.activity_type,
        inference.confidence,
        inference.score,
        inference.second_best_activity_type,
        inference.second_best_score,
        upload.get("id"),
    )
    return inference.activity_type


def run_parsing_pipeline(upload: Dict[str, Any]) -> Dict[str, Any]:

    start_time = time.time()

    upload_id = upload["id"]
    activity_type = upload.get("activity_type")
    # strict_mode: when True, fail the upload if emissions coverage is below threshold.
    # Set upload.strict_mode=true from the API or DB to opt in.
    strict_mode: bool = bool(upload.get("strict_mode", False))
    STRICT_MIN_COVERAGE: float = 0.5  # fail if < 50% of validated rows produce emissions

    temp_file_path: str | None = None

    validated_rows: List[Dict[str, Any]] = []
    errors: List[Dict[str, Any]] = []
    carry_state: Dict[str, Any] = {}

    # Stage counters — persisted to DB at end
    stage_counters: Dict[str, Any] = {
        "extracted_rows": 0,
        "empty_rows_skipped": 0,
        "validation_failed_rows": 0,
        "activities_inserted": 0,
        "emissions_calculated": 0,
        "emissions_skipped": 0,
        "emissions_skipped_by_reason": {},
    }

    try:
        logger.info(f"[Pipeline] Starting for upload {upload_id}, activity_type={activity_type}, strict_mode={strict_mode}")

        local_file_path, temp_file_path = resolve_upload_file_path(upload)
        logger.info(f"[Pipeline] Resolved file path: {local_file_path}")
        working_upload = {**upload, "file_path": local_file_path}

        # -----------------------------------------
        # 1️⃣ Extract rows
        # -----------------------------------------

        normalized_activity_type = (
            _normalize_activity_type(activity_type.strip())
            if isinstance(activity_type, str)
            else None
        )

        if local_file_path.lower().endswith(".pdf"):
            if not isinstance(normalized_activity_type, str) or normalized_activity_type not in SCHEMAS:
                raise ValidationError(
                    "PDF uploads currently require a manual or pre-inferred activity type"
                )
            logger.info(f"[Pipeline] Extracting from PDF with activity_type={normalized_activity_type}")
            raw_rows = extract_pdf_with_ai(local_file_path, normalized_activity_type)
        else:
            logger.info("[Pipeline] Extracting rows from file")
            raw_rows = extract_rows(working_upload)
        
        logger.info(f"[Pipeline] Extracted {len(raw_rows)} raw rows")
        stage_counters["extracted_rows"] = len(raw_rows)

        resolved_activity_type = _resolve_upload_activity_type(upload, raw_rows)
        logger.info(f"[Pipeline] Resolved activity_type={resolved_activity_type}")
        manual_factor_activity_type: Optional[str] = None
        if isinstance(activity_type, str):
            raw_candidate = activity_type.strip()
            normalized_candidate = _normalize_activity_type(raw_candidate)
            if (
                raw_candidate
                and raw_candidate != normalized_candidate
                and normalized_candidate == resolved_activity_type
            ):
                manual_factor_activity_type = raw_candidate

        # -----------------------------------------
        # 2️⃣ Load company mappings
        # -----------------------------------------

        logger.info("[Pipeline] Loading company mappings")
        mapping_upload = {**upload, "activity_type": resolved_activity_type}
        mapping_record_raw = get_upload_mapping(mapping_upload)
        
        company_mappings: Dict[str, str] = {}

        if isinstance(mapping_record_raw, dict):
            mappings_field = mapping_record_raw.get("mappings")

            if isinstance(mappings_field, dict):
            # Ensure keys + values are strings
                company_mappings = {
                    str(k): str(v)
                    for k, v in mappings_field.items()
                }
        
        logger.info(f"[Pipeline] Loaded {len(company_mappings)} column mappings")


        # -----------------------------------------
        # 3️⃣ Process each row
        # -----------------------------------------

        logger.info(f"[Pipeline] Processing {len(raw_rows)} rows")
        for idx, raw_row in enumerate(raw_rows):

            raw_row = _preclean_row(raw_row)

            if _is_effectively_empty_row(raw_row):
                logger.info(f"[Pipeline] Skipping empty row {idx}")
                stage_counters["empty_rows_skipped"] += 1
                continue

            try:
                mapped_row, unmapped = normalize_columns(
                    raw_row,
                    resolved_activity_type,
                    company_mappings
                )

                mapped_row = _fill_missing_required_from_unmapped(
                    mapped_row,
                    unmapped,
                    resolved_activity_type,
                )

                mapped_row = _apply_required_field_fallbacks(
                    mapped_row,
                    upload,
                    resolved_activity_type,
                )
                mapped_row = _apply_enterprise_upload_fallbacks(
                    mapped_row,
                    upload,
                )
                if manual_factor_activity_type and _is_empty_cell(mapped_row.get("factor_activity_type")):
                    mapped_row["factor_activity_type"] = manual_factor_activity_type

                mapped_row = _apply_carry_forward_fallbacks(
                    mapped_row,
                    resolved_activity_type,
                    carry_state,
                )

                mapped_row = _infer_missing_required_from_values(
                    mapped_row,
                    raw_row,
                    resolved_activity_type,
                )

                # Keep known dimension values even when another field on the row fails validation.
                for k, v in mapped_row.items():
                    if _is_empty_cell(v):
                        continue
                    carry_state[k] = v

                validated_row = validate_row(
                    mapped_row,
                    resolved_activity_type
                )
                validated_row = _propagate_enterprise_fields(validated_row, mapped_row)

                # Keep activity type on each row so emissions lookup can match factors.
                validated_row["activity_type"] = resolved_activity_type
                validated_row["upload_id"] = upload_id
                validated_row["row_index"] = idx
                validated_row["organization_id"] = upload.get("organization_id")
                validated_row["company_location_id"] = upload.get("company_location_id") or upload.get("file_site_id")

                validated_rows.append(validated_row)

                for k, v in validated_row.items():
                    if _is_empty_cell(v):
                        continue
                    carry_state[k] = v

            except ValidationError as ve:
                errors.append({
                    "row_index": idx,
                    "error": str(ve),
                })
                stage_counters["validation_failed_rows"] += 1
                logger.warning(f"[Pipeline] Validation error at row {idx}: {str(ve)}")
                log_parsing_event(upload_id, "ERROR", str(ve), row_number=idx)

        # -----------------------------------------
        # 4️⃣ Fail if too many errors
        # -----------------------------------------

        total = len(validated_rows) + len(errors)
        logger.info(f"[Pipeline] Validation complete: {len(validated_rows)} valid, {len(errors)} errors out of {total} total")

        quality = _compute_quality_summary(len(validated_rows), len(errors))
        failure_ratio = (len(errors) / total) if total else 0.0

        if len(validated_rows) == 0:
            raise ValidationError("No valid rows found after normalization and validation")

        # Enterprise gate: fail only when quality is critically low and sample size is too small.
        if failure_ratio > 0.8 and len(validated_rows) < 25:
            raise ValidationError(
                f"Data quality too low for ingestion: {quality['quality_score']}% valid rows"
            )

        if failure_ratio > 0.5:
            logger.warning(
                "[Pipeline] Proceeding with degraded quality: %.2f%% valid rows (%s/%s)",
                quality["quality_score"],
                quality["validated_rows"],
                quality["total_rows"],
            )

        # -----------------------------------------
        # 5️⃣ Insert activities
        # -----------------------------------------

        existing_activities = get_activities_for_upload(upload_id)
        if existing_activities:
            inserted_activities = existing_activities
            logger.warning(
                "[Pipeline] Reusing %s existing activities for upload %s to avoid duplicate inserts",
                len(inserted_activities),
                upload_id,
            )
        else:
            logger.info(f"[Pipeline] Inserting {len(validated_rows)} activities")
            inserted_activities = insert_activities(validated_rows)
            logger.info(
                "[Pipeline] Inserted %s activities, activity_ids=%s",
                len(inserted_activities),
                _preview_activity_ids(inserted_activities),
            )

        stage_counters["activities_inserted"] = len(inserted_activities)

        # -----------------------------------------
        
        # Build supabase client using settings/env fallbacks so worker processes
        # do not crash when shell env vars are not explicitly exported.
        supabase_key = (
            os.getenv("SUPABASE_SERVICE_ROLE_KEY")
            or os.getenv("SUPABASE_SECRET_KEY")
            or settings.SUPABASE_SECRET_KEY
        )
        if not supabase_key:
            raise RuntimeError("Supabase credentials not configured")

        supabase = create_client(
            os.getenv("SUPABASE_URL") or settings.SUPABASE_URL,
            supabase_key,
        )

        # 6️⃣ Emissions based on inserted activity IDs
        logger.info(f"[Pipeline] Calculating emissions for {len(validated_rows)} rows...")
        logger.info(f"[Pipeline] First validated row sample: {validated_rows[0] if validated_rows else 'N/A'}")
        logger.info(f"[Pipeline] First activity sample: {inserted_activities[0] if inserted_activities else 'N/A'}")
        
        emissions_result = calculate_emissions_for_batch(
            supabase=supabase,
            rows=validated_rows,
            inserted_activities=inserted_activities,
        )
        emissions_rows = cast(List[Dict[str, Any]], emissions_result.get("rows", []))
        skipped_emissions = cast(List[Dict[str, Any]], emissions_result.get("skipped_rows", []))
        emissions_summary = cast(Dict[str, Any], emissions_result.get("summary", {}))
        logger.info(f"[Pipeline] Emissions calculation returned {len(emissions_rows)} rows")

        # Populate stage counters from emissions result.
        stage_counters["emissions_calculated"] = len(emissions_rows)
        stage_counters["emissions_skipped"] = len(skipped_emissions)
        stage_counters["emissions_skipped_by_reason"] = emissions_summary.get("skip_reasons", {})

        # Log factor match diagnostics prominently when everything was skipped.
        if not emissions_rows and skipped_emissions:
            skip_reasons = emissions_summary.get("skip_reasons", {})
            first_samples = [
                f"row={s.get('row_index')} activity_type={s.get('activity_type')} unit={s.get('unit')} region={s.get('region')} year={s.get('year')}: {s.get('reason', '')}"
                for s in skipped_emissions[:5]
            ]
            logger.warning(
                "[Pipeline] ⚠️ ALL emissions were skipped for upload %s. "
                "Skip buckets: %s. First samples: %s",
                upload_id,
                skip_reasons,
                first_samples,
            )

        # Strict mode: refuse to mark as completed when emissions coverage is too low.
        if strict_mode and validated_rows:
            coverage = len(emissions_rows) / len(validated_rows)
            if coverage < STRICT_MIN_COVERAGE:
                skip_reasons = emissions_summary.get("skip_reasons", {})
                raise ValidationError(
                    f"Strict mode: emissions coverage {coverage:.0%} is below threshold "
                    f"{STRICT_MIN_COVERAGE:.0%}. Skip reasons: {skip_reasons}"
                )

        if emissions_rows:
            logger.info(f"[Pipeline] Inserting {len(emissions_rows)} emissions rows")
            insert_emissions(emissions_rows)
            logger.info(f"[Pipeline] Emissions inserted successfully")
        else:
            logger.warning("[Pipeline] No trusted emissions rows were calculated for this upload")
            log_parsing_event(upload_id, "WARN", "No trusted emissions rows were calculated")

        if skipped_emissions:
            logger.info(
                "[Pipeline] Emissions skipped for %s/%s validated rows",
                emissions_summary.get("skipped_count", len(skipped_emissions)),
                emissions_summary.get("total_count", len(validated_rows)),
            )
            for skipped in skipped_emissions[:25]:
                row_number = skipped.get("row_index")
                reason = skipped.get("reason") or "Emissions skipped"
                if isinstance(row_number, int):
                    log_parsing_event(upload_id, "WARN", f"Emissions skipped: {reason}", row_number=row_number)
                else:
                    log_parsing_event(upload_id, "WARN", f"Emissions skipped: {reason}")
            
        # -----------------------------------------
        # Skipped for now unless emissions.py confirmed working

        mark_as_completed(upload_id)

        update_upload_fields(
            upload_id,
            {
                "quality_score": quality["quality_score"],
                "validated_rows": quality["validated_rows"],
                "error_rows": quality["error_rows"],
                "total_rows": quality["total_rows"],
                "emissions_calculated_rows": emissions_summary.get("calculated_count", len(emissions_rows)),
                "emissions_skipped_rows": emissions_summary.get("skipped_count", len(skipped_emissions)),
                "parsing_stage_summary": stage_counters,
            },
        )

        duration = time.time() - start_time
        logger.info(
            f"[Pipeline] ✅ Completed upload {upload_id} in {duration:.2f}s. Valid: {len(validated_rows)}, Errors: {len(errors)}, Emissions: {len(emissions_rows) if emissions_rows else 0}"
        )
        logger.info(
            _format_upload_summary(
                upload=upload,
                upload_id=upload_id,
                resolved_activity_type=resolved_activity_type,
                validated_count=len(validated_rows),
                error_count=len(errors),
                emissions_count=emissions_summary.get("calculated_count", len(emissions_rows)),
                skipped_count=emissions_summary.get("skipped_count", len(skipped_emissions)),
                duration=duration,
            )
        )

        log_parsing_event(
            upload_id,
            "INFO",
            f"Completed. Valid: {len(validated_rows)}, Errors: {len(errors)}, Emissions: {len(emissions_rows) if emissions_rows else 0}, Duration: {duration:.2f}s"
        )

        return {
            "validated_count": len(validated_rows),
            "error_count": len(errors),
            "quality_score": quality["quality_score"],
            "total_count": quality["total_rows"],
            "emissions_calculated_count": emissions_summary.get("calculated_count", len(emissions_rows)),
            "emissions_skipped_count": emissions_summary.get("skipped_count", len(skipped_emissions)),
            "stage_counters": stage_counters,
        }

    except ActivityTypeReviewRequired as e:
        logger.info(f"[Pipeline] ⚠️ Activity type review required for {upload_id}: {str(e)}")
        log_parsing_event(upload_id, "WARN", str(e))

        return {
            "validated_count": 0,
            "error_count": 0,
            "status": "pending_review",
        }

    except Exception as e:
        logger.exception(f"[Pipeline] ❌ Pipeline failed for upload {upload_id}")
        mark_as_failed(upload_id, str(e))
        log_parsing_event(upload_id, "ERROR", str(e))
        raise
    finally:
        if temp_file_path and Path(temp_file_path).exists():
            try:
                Path(temp_file_path).unlink()
            except Exception:
                pass