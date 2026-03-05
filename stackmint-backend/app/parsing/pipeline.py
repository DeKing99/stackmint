import time
import logging
from typing import Dict, Any, List, cast

from parsing.extractors import extract_rows
from parsing.mapping import normalize_columns
from parsing.validation import validate_row, ValidationError
from parsing.pdf import extract_pdf_with_ai

from db.uploads import mark_as_completed, mark_as_failed
from db.mappings import get_upload_mapping
from db.activities import insert_activities
from db.emissions import insert_emissions
from db.logs import log_parsing_event

from parsing.emissions import calculate_emissions_for_batch

from supabase import create_client
from uuid import UUID
import os

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


def run_parsing_pipeline(upload: Dict[str, Any]) -> Dict[str, Any]:

    start_time = time.time()

    upload_id = upload["id"]
    activity_type = upload["activity_type"]
    file_path = upload["file_path"]

    validated_rows: List[Dict[str, Any]] = []
    errors: List[Dict[str, Any]] = []

    try:

        # -----------------------------------------
        # 1️⃣ Extract rows
        # -----------------------------------------

        if file_path.lower().endswith(".pdf"):
            raw_rows = extract_pdf_with_ai(file_path, activity_type)
        else:
            raw_rows = extract_rows(upload)

        # -----------------------------------------
        # 2️⃣ Load company mappings
        # -----------------------------------------

        #mapping_record = get_upload_mapping(upload_id)
        #company_mappings = mapping_record.get("mappings") if mapping_record else {}
        
        mapping_record_raw = get_upload_mapping(upload_id)
        
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

                validated_row["upload_id"] = upload_id
                validated_row["row_index"] = idx

                validated_rows.append(validated_row)

            except ValidationError as ve:
                errors.append({
                    "row_index": idx,
                    "error": str(ve),
                })

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

        insert_activities(validated_rows)

        # -----------------------------------------
        
        # Build supabase client
        supabase = create_client(
            os.environ["SUPABASE_URL"],
            os.environ["SUPABASE_SERVICE_ROLE_KEY"],
        )

        company_id = UUID(upload["company_id"])
        # 6️⃣ (Optional) Emissions
        
        emissions_rows = calculate_emissions_for_batch(
            supabase=supabase,
            company_id=company_id,
            rows=validated_rows,
        )

        if emissions_rows:
            insert_emissions(emissions_rows)
            
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