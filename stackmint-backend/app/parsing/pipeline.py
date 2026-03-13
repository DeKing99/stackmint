import time
import logging
from typing import Dict, Any, List, cast
from pathlib import Path

from parsing.extractors import extract_rows
from parsing.mapping import normalize_columns
from parsing.validation import validate_row, ValidationError
from parsing.pdf import extract_pdf_with_ai
from parsing.storage import resolve_upload_file_path

from db.uploads import mark_as_completed, mark_as_failed
from db.mappings import get_upload_mapping
from db.activities import insert_activities
from db.emissions import insert_emissions
from db.logs import log_parsing_event

from parsing.emissions import calculate_emissions_for_batch

from supabase import create_client
import os

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


def run_parsing_pipeline(upload: Dict[str, Any]) -> Dict[str, Any]:

    start_time = time.time()

    upload_id = upload["id"]
    activity_type = upload["activity_type"]
    temp_file_path: str | None = None

    validated_rows: List[Dict[str, Any]] = []
    errors: List[Dict[str, Any]] = []

    try:

        local_file_path, temp_file_path = resolve_upload_file_path(upload)
        working_upload = {**upload, "file_path": local_file_path}

        # -----------------------------------------
        # 1️⃣ Extract rows
        # -----------------------------------------

        if local_file_path.lower().endswith(".pdf"):
            raw_rows = extract_pdf_with_ai(local_file_path, activity_type)
        else:
            raw_rows = extract_rows(working_upload)

        # -----------------------------------------
        # 2️⃣ Load company mappings
        # -----------------------------------------

        #mapping_record = get_upload_mapping(upload_id)
        #company_mappings = mapping_record.get("mappings") if mapping_record else {}
        
        mapping_record_raw = get_upload_mapping(upload)
        
        company_mappings: Dict[str, str] = {}

        if isinstance(mapping_record_raw, dict):
            mappings_field = mapping_record_raw.get("mappings")

            if isinstance(mappings_field, dict):
            # Ensure keys + values are strings
                company_mappings = {
                    str(k): str(v)
                    for k, v in mappings_field.items()
                }


        # -----------------------------------------
        # 3️⃣ Process each row
        # -----------------------------------------

        for idx, raw_row in enumerate(raw_rows):

            try:
                mapped_row, _ = normalize_columns(
                    raw_row,
                    activity_type,
                    company_mappings
                )

                validated_row = validate_row(
                    mapped_row,
                    activity_type
                )

                # Keep activity type on each row so emissions lookup can match factors.
                validated_row["activity_type"] = activity_type
                validated_row["upload_id"] = upload_id
                validated_row["row_index"] = idx
                validated_row["organization_id"] = upload.get("organization_id")
                validated_row["company_location_id"] = upload.get("company_location_id") or upload.get("file_site_id")

                validated_rows.append(validated_row)

            except ValidationError as ve:
                errors.append({
                    "row_index": idx,
                    "error": str(ve),
                })
                log_parsing_event(upload_id, "ERROR", str(ve), row_number=idx)

        # -----------------------------------------
        # 4️⃣ Fail if too many errors
        # -----------------------------------------

        total = len(validated_rows) + len(errors)

        if total > 0:
            failure_ratio = len(errors) / total
            if failure_ratio > 0.5:
                raise ValidationError("More than 50% of rows failed validation")

        # -----------------------------------------
        # 5️⃣ Insert activities
        # -----------------------------------------

        inserted_activities = insert_activities(validated_rows)

        # -----------------------------------------
        
        # Build supabase client
        supabase = create_client(
            os.environ["SUPABASE_URL"],
            os.environ["SUPABASE_SERVICE_ROLE_KEY"],
        )

        # 6️⃣ Emissions based on inserted activity IDs
        emissions_rows = calculate_emissions_for_batch(
            supabase=supabase,
            rows=validated_rows,
            inserted_activities=inserted_activities,
        )
        if emissions_rows:
            insert_emissions(emissions_rows)
        else:
            log_parsing_event(upload_id, "WARN", "No emissions rows were calculated")
            
        # -----------------------------------------
        # Skipped for now unless emissions.py confirmed working

        mark_as_completed(upload_id)

        duration = time.time() - start_time

        log_parsing_event(
            upload_id,
            "INFO",
            f"Completed. Valid: {len(validated_rows)}, Errors: {len(errors)}, Duration: {duration:.2f}s"
        )

        return {
            "validated_count": len(validated_rows),
            "error_count": len(errors),
        }

    except Exception as e:

        logger.exception("Pipeline failed for upload %s", upload_id)

        mark_as_failed(upload_id, str(e))

        log_parsing_event(upload_id, "ERROR", str(e))

        raise
    finally:
        if temp_file_path and Path(temp_file_path).exists():
            try:
                Path(temp_file_path).unlink()
            except Exception:
                pass