from typing import Any, Dict, Mapping, Optional, List, Sequence
from decimal import Decimal, InvalidOperation
from datetime import datetime, timezone, date
import logging
import re
import time
import threading
import calendar
from collections import OrderedDict

from supabase import Client
from app.parsing.schemas import SCHEMAS
from app.core.config import settings


logger = logging.getLogger(__name__)


class EmissionsCalculationError(Exception):
    pass


class _TTLFactorCache:
    def __init__(self, maxsize: int, ttl_seconds: int):
        self.maxsize = max(1, int(maxsize))
        self.ttl_seconds = max(1, int(ttl_seconds))
        self._store: OrderedDict[
            tuple[str, str, str, int, str],
            tuple[float, tuple[Optional[Dict[str, Any]], tuple[str, ...]]],
        ] = OrderedDict()
        self._lock = threading.Lock()

    def get(self, key: tuple[str, str, str, int, str]) -> Optional[tuple[Optional[Dict[str, Any]], List[str]]]:
        now = time.time()
        with self._lock:
            payload = self._store.get(key)
            if payload is None:
                return None

            expires_at, value = payload
            if expires_at < now:
                self._store.pop(key, None)
                return None

            self._store.move_to_end(key)
            factor_row, attempts = value
            return (dict(factor_row) if isinstance(factor_row, dict) else None, list(attempts))

    def set(
        self,
        key: tuple[str, str, str, int, str],
        factor_row: Optional[Mapping[str, Any]],
        attempts_tried: List[str],
    ) -> None:
        now = time.time()
        normalized_factor = dict(factor_row) if isinstance(factor_row, Mapping) else None
        normalized_attempts = tuple(attempts_tried)

        with self._lock:
            self._store[key] = (
                now + self.ttl_seconds,
                (normalized_factor, normalized_attempts),
            )
            self._store.move_to_end(key)
            while len(self._store) > self.maxsize:
                self._store.popitem(last=False)

    def clear(self) -> None:
        with self._lock:
            self._store.clear()


_factor_cache = _TTLFactorCache(
    maxsize=settings.EMISSION_FACTOR_CACHE_SIZE,
    ttl_seconds=settings.EMISSION_FACTOR_CACHE_TTL_SECONDS,
)


def clear_emission_factor_cache() -> None:
    _factor_cache.clear()


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


def _derive_reporting_period_bounds(raw_date: object) -> tuple[Optional[str], Optional[str]]:
    parsed: date | None = None
    if isinstance(raw_date, datetime):
        parsed = raw_date.date()
    elif isinstance(raw_date, date):
        parsed = raw_date
    elif isinstance(raw_date, str):
        text = raw_date.strip()
        if text:
            try:
                if len(text) == 4 and text.isdigit():
                    parsed = date(int(text), 1, 1)
                elif len(text) == 7:
                    parsed = datetime.strptime(text, "%Y-%m").date()
                else:
                    parsed = datetime.fromisoformat(text.replace("Z", "+00:00")).date()
            except ValueError:
                parsed = None

    if parsed is None:
        return (None, None)

    start = parsed.replace(day=1)
    end = parsed.replace(day=calendar.monthrange(parsed.year, parsed.month)[1])
    return (start.isoformat(), end.isoformat())


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


def _normalize_token(value: Optional[str]) -> str:
    if not isinstance(value, str):
        return ""
    return re.sub(r"[^a-z0-9]", "", value.lower())


def _token_variants(value: Optional[str]) -> set[str]:
    """
    Build comparable token variants for strings that may include protocol prefixes,
    e.g. R134a <-> HFC-134a.
    """
    base = _normalize_token(value)
    if not base:
        return set()

    variants = {base}
    for prefix in ("hfc", "hcfc", "cfc", "r"):
        if base.startswith(prefix) and len(base) > len(prefix):
            variants.add(base[len(prefix):])
    return variants


def _search_tokens(value: Optional[str]) -> List[str]:
    """
    Build text search tokens for PostgREST ilike queries.
    """
    if not isinstance(value, str):
        return []

    raw = value.strip()
    out: List[str] = []
    if raw:
        out.append(raw)

    for variant in sorted(_token_variants(value), key=len, reverse=True):
        if variant and variant not in out:
            out.append(variant)
    return out[:4]


def _extract_factor_decimal(factor_row: Mapping[str, Any]) -> Optional[Decimal]:
    """
    Resolve the numeric factor from common factor columns.
    Prefer factor_value, then fall back to co2/ch4/n2o if present.
    """
    for key in ("factor_value", "co2", "ch4", "n2o"):
        value = factor_row.get(key)
        if value is None:
            continue
        try:
            return Decimal(str(value))
        except (InvalidOperation, TypeError):
            continue
    return None


def _select_best_factor_row(
    rows: Sequence[Mapping[str, Any]],
    match_token: Optional[str],
) -> Optional[Mapping[str, Any]]:
    """
    Choose the best factor row by:
    1) requiring a parseable numeric factor
    2) preferring detail/name that matches gas_type/fuel_type token when provided
    """
    if not rows:
        return None

    token_variants = _token_variants(match_token)
    numeric_rows: List[Mapping[str, Any]] = [r for r in rows if _extract_factor_decimal(r) is not None]
    if not numeric_rows:
        return None

    if not token_variants:
        return numeric_rows[0]

    for row in numeric_rows:
        detail_variants = _token_variants(row.get("detail") if isinstance(row.get("detail"), str) else None)
        name_variants = _token_variants(row.get("name") if isinstance(row.get("name"), str) else None)
        category_variants = _token_variants(row.get("category") if isinstance(row.get("category"), str) else None)

        # Direct/alias match catches common pairs like R134a -> HFC-134a.
        for tv in token_variants:
            if any(tv == dv or tv in dv for dv in detail_variants):
                return row
            if any(tv == nv or tv in nv for nv in name_variants):
                return row
            if any(tv == cv or tv in cv for cv in category_variants):
                return row

    return numeric_rows[0]


def _fetch_emission_factor(
    supabase: Client,
    activity_type: str,
    unit: Optional[str],
    region: Optional[str],
    year: Optional[int],
    match_token: Optional[str] = None,
) -> tuple[Optional[Mapping[str, Any]], List[str]]:
    """
    Returns (factor_row | None, list_of_attempts_tried).
    Each attempt string describes the exact filter tuple so callers can log why
    a match was not found.
    """
    cache_key = (
        activity_type,
        unit or "",
        region or "",
        year if year is not None else -1,
        _normalize_token(match_token),
    )
    cached = _factor_cache.get(cache_key)
    if cached is not None:
        return cached

    attempts_tried: List[str] = []
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
        filter_unit = unit if use_unit else None
        filter_region = region if use_region else None
        filter_year = year if use_year else None

        attempt_desc = (
            f"activity_type={activity_type}"
            + (f" unit={filter_unit}" if filter_unit else "")
            + (f" region={filter_region}" if filter_region else "")
            + (f" year={filter_year}" if filter_year is not None else "")
        )
        attempts_tried.append(attempt_desc)

        def _build_base_query():
            base_query = (
                supabase.table("emission_factors")
                .select("*")
                .eq("activity_type", activity_type)
            )

            if use_unit and unit:
                base_query = base_query.eq("unit", unit)

            if use_region and region:
                base_query = base_query.eq("region", region)

            if use_year and year is not None:
                base_query = base_query.eq("year", year)

            return base_query

        # 1) Targeted match (detail/name) when a token like gas_type is available.
        if match_token:
            for token in _search_tokens(match_token):
                detail_response = _build_base_query().ilike("detail", f"%{token}%").limit(100).execute()
                if detail_response.data:
                    candidate_rows = [r for r in detail_response.data if isinstance(r, Mapping)]
                    selected = _select_best_factor_row(candidate_rows, match_token)
                    if selected is not None:
                        _factor_cache.set(cache_key, selected, attempts_tried)
                        return selected, attempts_tried

                name_response = _build_base_query().ilike("name", f"%{token}%").limit(100).execute()
                if name_response.data:
                    candidate_rows = [r for r in name_response.data if isinstance(r, Mapping)]
                    selected = _select_best_factor_row(candidate_rows, match_token)
                    if selected is not None:
                        _factor_cache.set(cache_key, selected, attempts_tried)
                        return selected, attempts_tried

        # 2) Broad fallback when no targeted match found.
        response = _build_base_query().limit(200).execute()
        if response.data:
            candidate_rows = [r for r in response.data if isinstance(r, Mapping)]
            selected = _select_best_factor_row(candidate_rows, match_token)
            if selected is not None:
                _factor_cache.set(cache_key, selected, attempts_tried)
                return selected, attempts_tried

    _factor_cache.set(cache_key, None, attempts_tried)
    return None, attempts_tried


def calculate_emissions_for_row(
    supabase: Client,
    row: Dict[str, Any],
    activity_id: str,
    inserted_activity: Optional[Mapping[str, Any]] = None,
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
    region = _safe_get_str(row, "region") or (
        _safe_get_str(inserted_activity, "region") if isinstance(inserted_activity, Mapping) else None
    )
    year = _safe_get_int(row, "year")
    match_token = (
        _safe_get_str(row, "gas_type")
        or _safe_get_str(row, "fuel_type")
        or _safe_get_str(row, "waste_type")
        or _safe_get_str(row, "travel_mode")
        or _safe_get_str(row, "transport_mode")
        or _safe_get_str(row, "commute_mode")
        or _safe_get_str(row, "category")
    )

    if not activity_type or value is None:
        raise EmissionsCalculationError(
            f"Missing required emissions fields: activity_type={activity_type!r} value={value!r}"
        )

    factor_row, attempts_tried = _fetch_emission_factor(
        supabase=supabase,
        activity_type=activity_type,
        unit=unit,
        region=region,
        year=year,
        match_token=match_token,
    )

    if not factor_row:
        attempts_str = "; ".join(attempts_tried) if attempts_tried else "none"
        raise EmissionsCalculationError(
            f"No emission factor found. Lookup attempts tried: [{attempts_str}]"
        )

    factor = _extract_factor_decimal(factor_row)
    if factor is None:
        raise EmissionsCalculationError("Invalid factor_value")

    emissions_value = value * factor
    activity_date = (
        row.get("date")
        or (inserted_activity.get("activity_date") if isinstance(inserted_activity, Mapping) else None)
    )
    reporting_period_start, reporting_period_end = _derive_reporting_period_bounds(activity_date)
    company_department_id = row.get("company_department_id") or row.get("department_id")
    company_supplier_id = row.get("company_supplier_id") or row.get("supplier_id")
    metadata = row.get("metadata")
    calc_confidence_decimal = _safe_get_decimal(row, "calculation_confidence")
    calc_confidence = float(calc_confidence_decimal) if calc_confidence_decimal is not None else 1.0

    return {
        "activity_id": activity_id,
        "emission_factor_id": factor_row.get("id"),
        "co2e": float(emissions_value),
        "calculated_at": datetime.now(timezone.utc).isoformat(),
        "reporting_period_start": reporting_period_start,
        "reporting_period_end": reporting_period_end,
        "organization_id": (
            inserted_activity.get("organization_id") if isinstance(inserted_activity, Mapping) else None
        ),
        "company_location_id": (
            inserted_activity.get("company_location_id") if isinstance(inserted_activity, Mapping) else None
        ),
        "company_department_id": company_department_id,
        "company_supplier_id": company_supplier_id,
        "activity_quantity": float(value),
        "activity_unit": unit,
        "verification_status": row.get("verification_status"),
        "calculation_method": row.get("calculation_method"),
        "calculation_confidence": calc_confidence,
        "metadata": metadata if isinstance(metadata, Mapping) else None,
    }


def calculate_emissions_for_batch(
    supabase: Client,
    rows: List[Dict[str, Any]],
    inserted_activities: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Batch-safe emissions calculation.
    Fully Pylance clean.
    """

    emissions_rows: List[Dict[str, Any]] = []
    skipped_rows: List[Dict[str, Any]] = []
    skip_reason_counts: Dict[str, int] = {}

    for index, row in enumerate(rows):
        try:
            activity = inserted_activities[index] if index < len(inserted_activities) else None
            activity_id = activity.get("id") if isinstance(activity, Mapping) else None
            if not isinstance(activity_id, str) or not activity_id:
                reason = "no_activity_id"
                skip_reason_counts[reason] = skip_reason_counts.get(reason, 0) + 1
                skipped_rows.append({
                    "row_index": index,
                    "reason": reason,
                    "status": "skipped",
                })
                continue

            result = calculate_emissions_for_row(
                supabase=supabase,
                row=row,
                activity_id=activity_id,
                inserted_activity=activity if isinstance(activity, Mapping) else None,
            )
            emissions_rows.append(result)
        except EmissionsCalculationError as e:
            reason_str = str(e)
            # Bucket skip reasons for aggregated diagnostics.
            if "No emission factor found" in reason_str:
                bucket = "no_factor_match"
            elif "Missing required" in reason_str:
                bucket = "missing_fields"
            elif "Invalid factor_value" in reason_str:
                bucket = "invalid_factor"
            else:
                bucket = "calculation_error"
            skip_reason_counts[bucket] = skip_reason_counts.get(bucket, 0) + 1

            skipped_rows.append({
                "row_index": index,
                "reason": reason_str,
                "bucket": bucket,
                "status": "skipped",
                "activity_type": row.get("activity_type"),
                "unit": row.get("unit"),
                "region": row.get("region"),
                "year": row.get("year"),
            })
            logger.warning("[Emissions] Row %s skipped (%s): %s", index, bucket, reason_str)
            continue
        except Exception as e:
            skip_reason_counts["unexpected_error"] = skip_reason_counts.get("unexpected_error", 0) + 1
            skipped_rows.append({
                "row_index": index,
                "reason": f"unexpected emissions error: {str(e)}",
                "bucket": "unexpected_error",
                "status": "skipped",
            })
            logger.exception("[Emissions] Row %s unexpected error", index)
            continue

    if skipped_rows:
        logger.warning(
            "[Emissions] Batch complete: %s calculated, %s skipped. Skip buckets: %s",
            len(emissions_rows),
            len(skipped_rows),
            skip_reason_counts,
        )

    return {
        "rows": emissions_rows,
        "skipped_rows": skipped_rows,
        "summary": {
            "calculated_count": len(emissions_rows),
            "skipped_count": len(skipped_rows),
            "total_count": len(rows),
            "skip_reasons": skip_reason_counts,
        },
    }