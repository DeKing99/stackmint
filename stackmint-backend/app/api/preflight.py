"""
Preflight endpoint — deterministic pre-run check for uploads.

Returns, without side effects:
- Inferred activity type + confidence
- Required fields: which are present / missing in the file
- Emission factor coverage: how many (activity_type, unit) combinations
  from the file actually have matching rows in emission_factors
- Verdict: "ready" | "review_required" | "no_factor_coverage"

Prevents silent zero-emissions runs.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Set, Tuple

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.db.client import supabase
from app.parsing.activity_type_inference import infer_activity_type
from app.parsing.extractors import extract_rows
from app.parsing.mapping import normalize_columns
from app.parsing.pipeline import _preclean_row, _is_effectively_empty_row, _is_empty_cell
from app.parsing.schemas import SCHEMAS
from app.parsing.storage import resolve_upload_file_path

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/pipeline", tags=["pipeline"])


# ---------------------------------------------------------------------------
# Pydantic request / response models
# ---------------------------------------------------------------------------

class PreflightRequest(BaseModel):
    upload_id: str
    activity_type_override: Optional[str] = None


class FieldPresence(BaseModel):
    field: str
    required: bool
    present: bool


class FactorCoverageItem(BaseModel):
    activity_type: str
    unit: Optional[str]
    row_count: int
    has_factor: bool
    factor_id: Optional[str] = None
    factor_name: Optional[str] = None


class PreflightResponse(BaseModel):
    upload_id: str
    inferred_activity_type: Optional[str]
    inference_confidence: float
    inference_score: float
    review_required: bool
    resolved_activity_type: Optional[str]
    required_fields: List[FieldPresence]
    factor_coverage: List[FactorCoverageItem]
    factor_coverage_pct: float
    verdict: str          # "ready" | "review_required" | "no_factor_coverage" | "missing_required_fields"
    verdict_detail: str


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _check_factor_exists(activity_type: str, unit: Optional[str]) -> Tuple[bool, Optional[str], Optional[str]]:
    """Return (exists, factor_id, factor_name) for the broadest match."""
    query = (
        supabase.table("emission_factors")
        .select("id, name")
        .eq("activity_type", activity_type)
    )
    if unit:
        # Try unit-specific first.
        unit_resp = query.eq("unit", unit).limit(1).execute()
        if unit_resp.data:
            row = unit_resp.data[0]
            return True, str(row.get("id", "")), str(row.get("name", ""))
        # Fall back to any factor for this activity_type.
        broad_resp = (
            supabase.table("emission_factors")
            .select("id, name")
            .eq("activity_type", activity_type)
            .limit(1)
            .execute()
        )
        if broad_resp.data:
            row = broad_resp.data[0]
            return True, str(row.get("id", "")), str(row.get("name", ""))
        return False, None, None
    else:
        resp = query.limit(1).execute()
        if resp.data:
            row = resp.data[0]
            return True, str(row.get("id", "")), str(row.get("name", ""))
        return False, None, None


def _sample_rows(upload: Dict[str, Any], max_rows: int = 200) -> List[Dict[str, Any]]:
    local_path, _ = resolve_upload_file_path(upload)
    working_upload = {**upload, "file_path": local_path}
    rows = extract_rows(working_upload)
    return [_preclean_row(r) for r in rows[:max_rows] if not _is_effectively_empty_row(_preclean_row(r))]


def _required_fields_for(activity_type: str, sample_rows: List[Dict[str, Any]]) -> List[FieldPresence]:
    """Compare schema required fields against columns present in the sample."""
    schema = SCHEMAS.get(activity_type, {})
    fields = schema.get("fields", {})

    # Collect all mapped column names across sampled rows.
    present_keys: Set[str] = set()
    for row in sample_rows:
        mapped, _ = normalize_columns(row, activity_type, {})
        for k, v in mapped.items():
            if not _is_empty_cell(v):
                present_keys.add(k)

    result: List[FieldPresence] = []
    for field_name, field_def in fields.items():
        if not isinstance(field_def, dict):
            continue
        required = bool(field_def.get("required", False))
        result.append(FieldPresence(
            field=field_name,
            required=required,
            present=(field_name in present_keys),
        ))
    return result


def _factor_coverage(
    activity_type: str,
    sample_rows: List[Dict[str, Any]],
) -> Tuple[List[FactorCoverageItem], float]:
    """Returns (coverage_items, coverage_pct)."""
    # Gather unique (activity_type, unit) pairs and their row counts.
    combo_counts: Dict[Tuple[str, Optional[str]], int] = {}
    for row in sample_rows:
        mapped, _ = normalize_columns(row, activity_type, {})
        unit: Optional[str] = mapped.get("unit")
        if isinstance(unit, str) and not unit.strip():
            unit = None
        key = (activity_type, unit)
        combo_counts[key] = combo_counts.get(key, 0) + 1

    items: List[FactorCoverageItem] = []
    covered = 0
    total = 0
    for (act_type, unit), row_count in combo_counts.items():
        has_factor, fid, fname = _check_factor_exists(act_type, unit)
        items.append(FactorCoverageItem(
            activity_type=act_type,
            unit=unit,
            row_count=row_count,
            has_factor=has_factor,
            factor_id=fid,
            factor_name=fname,
        ))
        total += row_count
        if has_factor:
            covered += row_count

    pct = (covered / total * 100.0) if total else 0.0
    return items, pct


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------

@router.post("/preflight", response_model=PreflightResponse)
async def preflight_upload(request: PreflightRequest) -> PreflightResponse:
    """
    Deterministic pre-run check.  No data is modified.
    """
    upload_id = request.upload_id

    # Fetch upload record.
    resp = supabase.table("company_raw_uploads").select("*").eq("id", upload_id).limit(1).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail=f"Upload {upload_id} not found")

    upload: Dict[str, Any] = resp.data[0]

    # Sample rows from file.
    try:
        sample_rows = _sample_rows(upload)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not read upload file: {exc}")

    if not sample_rows:
        return PreflightResponse(
            upload_id=upload_id,
            inferred_activity_type=None,
            inference_confidence=0.0,
            inference_score=0.0,
            review_required=True,
            resolved_activity_type=None,
            required_fields=[],
            factor_coverage=[],
            factor_coverage_pct=0.0,
            verdict="review_required",
            verdict_detail="File produced no readable rows.",
        )

    # Resolve activity type.
    override = request.activity_type_override or upload.get("activity_type")
    if isinstance(override, str) and override.strip() in SCHEMAS:
        resolved_activity_type: Optional[str] = override.strip()
        inference = infer_activity_type(upload, sample_rows)
        review_required = False
        confidence = 1.0
        score = 10.0
    else:
        inference = infer_activity_type(upload, sample_rows)
        resolved_activity_type = inference.activity_type if not inference.review_required else None
        review_required = inference.review_required
        confidence = inference.confidence
        score = inference.score

    # Required fields check.
    if resolved_activity_type:
        field_presences = _required_fields_for(resolved_activity_type, sample_rows)
        coverage_items, coverage_pct = _factor_coverage(resolved_activity_type, sample_rows)
    else:
        field_presences = []
        coverage_items = []
        coverage_pct = 0.0

    # Determine verdict.
    missing_required = [f for f in field_presences if f.required and not f.present]
    if review_required or not resolved_activity_type:
        verdict = "review_required"
        verdict_detail = (
            f"Activity type inference requires manual confirmation. "
            f"Best guess: {inference.activity_type} at confidence {inference.confidence:.2f}."
        )
    elif missing_required:
        verdict = "missing_required_fields"
        names = [f.field for f in missing_required]
        verdict_detail = f"Required fields not found in file: {names}. Pipeline will attempt heuristic recovery."
    elif coverage_pct == 0.0:
        verdict = "no_factor_coverage"
        verdict_detail = (
            f"No emission factors found for activity_type={resolved_activity_type}. "
            "All emissions rows will be skipped. Add factors to emission_factors table first."
        )
    elif coverage_pct < 50.0:
        verdict = "partial_factor_coverage"
        verdict_detail = f"Only {coverage_pct:.1f}% of rows have matching emission factors. Remaining rows will be skipped."
    else:
        verdict = "ready"
        verdict_detail = f"Upload appears ready. Factor coverage: {coverage_pct:.1f}%."

    logger.info(
        "[Preflight] upload=%s resolved_type=%s coverage_pct=%.1f verdict=%s",
        upload_id, resolved_activity_type, coverage_pct, verdict,
    )

    return PreflightResponse(
        upload_id=upload_id,
        inferred_activity_type=inference.activity_type,
        inference_confidence=inference.confidence,
        inference_score=inference.score,
        review_required=review_required,
        resolved_activity_type=resolved_activity_type,
        required_fields=field_presences,
        factor_coverage=coverage_items,
        factor_coverage_pct=round(coverage_pct, 1),
        verdict=verdict,
        verdict_detail=verdict_detail,
    )
