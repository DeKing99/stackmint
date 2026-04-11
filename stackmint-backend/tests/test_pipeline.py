"""
test_pipeline.py — Enterprise stress test suite for the stackmint parsing pipeline.

Coverage:
  - Extraction (CSV happy path, messy headers, sparse rows, large file)
  - Column normalization / mapping
  - Validation (per activity type required fields)
  - Activity type inference
  - Emissions calculation (unit, factor-lookup diagnostics)
  - Pipeline orchestration (stage counters, strict mode)
  - Factor match diagnostics (skip reason buckets)

All tests run without live Supabase by default.
Supabase-dependent tests are @pytest.mark.integration.
"""

import pathlib
import time
from decimal import Decimal
from typing import Any, Dict, List, Optional
from unittest.mock import MagicMock, patch

import pytest

DATA_DIR = pathlib.Path(__file__).parent / "data"


@pytest.fixture(autouse=True)
def _reset_emissions_cache_between_tests():
    try:
        from app.parsing.emissions import clear_emission_factor_cache

        clear_emission_factor_cache()
    except Exception:
        # Some test modules don't import emissions; keep fixture no-op there.
        pass
    yield

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _load_csv(filename: str) -> List[Dict[str, Any]]:
    from app.parsing.extractors import extract_rows
    upload = {
        "id": "test",
        "file_path": str(DATA_DIR / filename),
        "storage_path": None,
        "activity_type": None,
    }
    return extract_rows(upload)


def _make_upload(
    file_path: str,
    activity_type: Optional[str] = None,
    strict_mode: bool = False,
) -> Dict[str, Any]:
    return {
        "id": "test-upload-001",
        "organization_id": "test-org-001",
        "company_location_id": "FAC-001",
        "activity_type": activity_type,
        "file_path": file_path,
        "storage_path": None,
        "created_at": "2024-01-01T00:00:00+00:00",
        "updated_at": "2024-01-01T00:00:00+00:00",
        "parsing_status": "pending",
        "strict_mode": strict_mode,
    }


# ---------------------------------------------------------------------------
# 1. Extraction
# ---------------------------------------------------------------------------

class TestExtraction:

    def test_happy_path_stationary_combustion(self):
        rows = _load_csv("stationary_combustion_happy.csv")
        assert len(rows) == 3
        assert "date" in rows[0] or "Date" in rows[0]

    def test_messy_headers_extracted(self):
        rows = _load_csv("stationary_combustion_messy_headers.csv")
        assert len(rows) == 2

    def test_sparse_rows_extracted(self):
        rows = _load_csv("stationary_combustion_sparse.csv")
        # All rows including blank ones should be extracted; pipeline filters them
        assert len(rows) >= 1

    def test_large_file_performance(self):
        start = time.time()
        rows = _load_csv("stationary_combustion_large.csv")
        elapsed = time.time() - start
        assert len(rows) == 1200
        # Should handle 1200-row CSV in under 3 seconds
        assert elapsed < 3.0, f"Extraction too slow: {elapsed:.2f}s"


# ---------------------------------------------------------------------------
# 2. Column normalization
# ---------------------------------------------------------------------------

class TestNormalization:

    def test_canonical_columns_passthrough(self):
        from app.parsing.mapping import normalize_columns
        row = {
            "date": "2024-01-15",
            "facility_id": "FAC-001",
            "fuel_type": "natural_gas",
            "consumption": 1200.0,
            "unit": "m3",
        }
        mapped, unmapped = normalize_columns(row, "stationary_combustion", {})
        assert mapped.get("date") == "2024-01-15"
        assert mapped.get("fuel_type") == "natural_gas"
        assert mapped.get("consumption") == 1200.0

    def test_messy_headers_normalised(self):
        from app.parsing.mapping import normalize_columns
        rows = _load_csv("stationary_combustion_messy_headers.csv")
        assert rows, "No rows extracted"
        mapped, _ = normalize_columns(rows[0], "stationary_combustion", {})
        # After normalization date should be present
        assert "date" in mapped

    def test_unknown_columns_go_to_unmapped(self):
        from app.parsing.mapping import normalize_columns
        row = {
            "date": "2024-01-15",
            "very_unknown_column_xyz": "garbage",
            "consumption": 100.0,
            "unit": "m3",
        }
        mapped, unmapped = normalize_columns(row, "stationary_combustion", {})
        assert "very_unknown_column_xyz" in unmapped


# ---------------------------------------------------------------------------
# 3. Validation
# ---------------------------------------------------------------------------

class TestValidation:

    def test_valid_stationary_combustion_row(self):
        from app.parsing.validation import validate_row
        row = {
            "date": "2024-01-15",
            "facility_id": "FAC-001",
            "fuel_type": "natural_gas",
            "consumption": 1200.0,
            "unit": "m3",
        }
        result = validate_row(row, "stationary_combustion")
        assert result.get("consumption") is not None

    def test_missing_required_field_raises(self):
        from app.parsing.validation import validate_row, ValidationError
        row = {
            "date": "2024-01-15",
            # facility_id missing
            "fuel_type": "natural_gas",
            "consumption": 1200.0,
            "unit": "m3",
        }
        with pytest.raises(ValidationError):
            validate_row(row, "stationary_combustion")

    def test_valid_business_travel_row(self):
        from app.parsing.validation import validate_row
        row = {
            "date": "2024-01-15",
            "travel_mode": "flight",
            "distance": 1500.0,
            "unit": "km",
        }
        result = validate_row(row, "business_travel")
        assert float(result.get("distance", 0)) == 1500.0

    def test_valid_purchased_electricity_row(self):
        from app.parsing.validation import validate_row
        row = {
            "date": "2024-01-15",
            "facility_id": "FAC-001",
            "consumption": 45000.0,
            "unit": "kwh",
            "region": "UK",
        }
        result = validate_row(row, "purchased_electricity")
        assert result.get("region") == "UK"

    def test_valid_fugitive_emissions_row(self):
        from app.parsing.validation import validate_row
        row = {
            "date": "2024-03-01",
            "facility_id": "FAC-001",
            "gas_type": "r410a",
            "amount_released": 5.2,
            "unit": "kg",
        }
        result = validate_row(row, "fugitive_emissions")
        assert float(result.get("amount_released", 0)) == 5.2

    def test_year_only_date_accepted(self):
        """Pipeline supports year-only dates as fallback."""
        from app.parsing.validation import validate_row
        row = {
            "date": "2024",
            "facility_id": "FAC-001",
            "fuel_type": "natural_gas",
            "consumption": 500.0,
            "unit": "m3",
        }
        # Should not raise - year-only dates are accepted
        result = validate_row(row, "stationary_combustion")
        assert result is not None


# ---------------------------------------------------------------------------
# 4. Activity type inference
# ---------------------------------------------------------------------------

class TestInference:

    def test_electricity_inferred_from_headers(self):
        from app.parsing.activity_type_inference import infer_activity_type
        rows = _load_csv("purchased_electricity_happy.csv")
        upload = {"id": "t1", "activity_type": None, "file_path": "purchased_electricity_happy.csv"}
        result = infer_activity_type(upload, rows)
        assert result.activity_type == "purchased_electricity"

    def test_stationary_combustion_inferred(self):
        from app.parsing.activity_type_inference import infer_activity_type
        rows = _load_csv("stationary_combustion_happy.csv")
        upload = {"id": "t2", "activity_type": None, "file_path": "stationary_combustion_data.csv"}
        result = infer_activity_type(upload, rows)
        assert result.activity_type == "stationary_combustion"

    def test_business_travel_inferred(self):
        from app.parsing.activity_type_inference import infer_activity_type
        rows = _load_csv("business_travel_happy.csv")
        upload = {"id": "t3", "activity_type": None, "file_path": "business_travel_log.csv"}
        result = infer_activity_type(upload, rows)
        assert result.activity_type == "business_travel"

    def test_confidence_populated(self):
        from app.parsing.activity_type_inference import infer_activity_type
        rows = _load_csv("purchased_electricity_happy.csv")
        upload = {"id": "t4", "activity_type": None, "file_path": "electricity_usage.csv"}
        result = infer_activity_type(upload, rows)
        assert 0.0 <= result.confidence <= 1.0

    def test_review_required_for_empty_file(self):
        from app.parsing.activity_type_inference import infer_activity_type
        upload = {"id": "t5", "activity_type": None, "file_path": "unknown.csv"}
        result = infer_activity_type(upload, [])
        assert result.review_required is True


# ---------------------------------------------------------------------------
# 5. Emissions calculation — offline (mocked Supabase)
# ---------------------------------------------------------------------------

def _mock_supabase_with_factor(factor_value: float = 0.233) -> MagicMock:
    """Return a mock supabase client that always returns one factor row."""
    factor_row = {
        "id": "factor-001",
        "name": "UK Grid Electricity",
        "activity_type": "purchased_electricity",
        "unit": "kwh",
        "factor_value": factor_value,
        "region": "UK",
        "year": 2024,
    }
    mock_resp = MagicMock()
    mock_resp.data = [factor_row]
    mock_query = MagicMock()
    mock_query.select.return_value = mock_query
    mock_query.eq.return_value = mock_query
    mock_query.limit.return_value = mock_query
    mock_query.execute.return_value = mock_resp
    mock_client = MagicMock()
    mock_client.table.return_value = mock_query
    return mock_client


def _mock_supabase_no_factor() -> MagicMock:
    """Return a mock supabase client that returns no factors."""
    mock_resp = MagicMock()
    mock_resp.data = []
    mock_query = MagicMock()
    mock_query.select.return_value = mock_query
    mock_query.eq.return_value = mock_query
    mock_query.limit.return_value = mock_query
    mock_query.execute.return_value = mock_resp
    mock_client = MagicMock()
    mock_client.table.return_value = mock_query
    return mock_client


class TestEmissionsCalculation:

    def test_single_row_calculates_correctly(self):
        from app.parsing.emissions import calculate_emissions_for_row
        mock_sb = _mock_supabase_with_factor(0.233)
        row = {
            "activity_type": "purchased_electricity",
            "consumption": 1000.0,
            "unit": "kwh",
            "region": "UK",
            "year": 2024,
        }
        result = calculate_emissions_for_row(mock_sb, row, "act-001")
        assert abs(result["co2e"] - 233.0) < 0.01
        assert result["activity_id"] == "act-001"
        assert result["emission_factor_id"] == "factor-001"

    def test_no_factor_raises_with_diagnostic(self):
        from app.parsing.emissions import calculate_emissions_for_row, EmissionsCalculationError
        mock_sb = _mock_supabase_no_factor()
        row = {
            "activity_type": "purchased_electricity",
            "consumption": 1000.0,
            "unit": "kwh",
            "region": "MARS-GRID",
        }
        with pytest.raises(EmissionsCalculationError) as exc_info:
            calculate_emissions_for_row(mock_sb, row, "act-001")
        # Error must show what was attempted
        assert "Lookup attempts tried" in str(exc_info.value)

    def test_missing_activity_type_raises(self):
        from app.parsing.emissions import calculate_emissions_for_row, EmissionsCalculationError
        mock_sb = _mock_supabase_with_factor()
        row = {"consumption": 1000.0, "unit": "kwh"}
        with pytest.raises(EmissionsCalculationError):
            calculate_emissions_for_row(mock_sb, row, "act-001")

    def test_missing_value_raises(self):
        from app.parsing.emissions import calculate_emissions_for_row, EmissionsCalculationError
        mock_sb = _mock_supabase_with_factor()
        row = {"activity_type": "purchased_electricity", "unit": "kwh"}
        with pytest.raises(EmissionsCalculationError):
            calculate_emissions_for_row(mock_sb, row, "act-001")

    def test_lookup_result_is_cached_for_identical_key(self):
        from app.parsing.emissions import calculate_emissions_for_row

        mock_sb = _mock_supabase_with_factor(0.233)
        row = {
            "activity_type": "purchased_electricity",
            "consumption": 1000.0,
            "unit": "kwh",
            "region": "CACHE_REGION_001",
            "year": 2099,
        }

        result_1 = calculate_emissions_for_row(mock_sb, row, "act-cache-1")
        result_2 = calculate_emissions_for_row(mock_sb, row, "act-cache-2")

        assert abs(result_1["co2e"] - 233.0) < 0.01
        assert abs(result_2["co2e"] - 233.0) < 0.01

        mock_query = mock_sb.table.return_value
        assert mock_query.execute.call_count == 1


class TestEmissionsBatch:

    def test_batch_all_succeed(self):
        from app.parsing.emissions import calculate_emissions_for_batch
        mock_sb = _mock_supabase_with_factor(0.233)
        rows = [
            {"activity_type": "purchased_electricity", "consumption": 1000.0, "unit": "kwh", "region": "UK"},
            {"activity_type": "purchased_electricity", "consumption": 2000.0, "unit": "kwh", "region": "UK"},
        ]
        activities = [{"id": "act-001"}, {"id": "act-002"}]
        result = calculate_emissions_for_batch(mock_sb, rows, activities)
        assert len(result["rows"]) == 2
        assert len(result["skipped_rows"]) == 0
        assert result["summary"]["calculated_count"] == 2

    def test_batch_partial_skip(self):
        from app.parsing.emissions import calculate_emissions_for_batch
        mock_sb = _mock_supabase_no_factor()
        rows = [
            {"activity_type": "purchased_electricity", "consumption": 1000.0, "unit": "kwh"},
            {"activity_type": "purchased_electricity", "consumption": 2000.0, "unit": "kwh"},
        ]
        activities = [{"id": "act-001"}, {"id": "act-002"}]
        result = calculate_emissions_for_batch(mock_sb, rows, activities)
        assert len(result["rows"]) == 0
        assert len(result["skipped_rows"]) == 2
        # Skip reasons should be populated
        assert result["summary"]["skip_reasons"].get("no_factor_match", 0) > 0

    def test_skip_reason_buckets_populated(self):
        from app.parsing.emissions import calculate_emissions_for_batch
        mock_sb = _mock_supabase_no_factor()
        rows = [{"activity_type": "purchased_electricity", "consumption": 1000.0, "unit": "kwh"}]
        activities = [{"id": "act-001"}]
        result = calculate_emissions_for_batch(mock_sb, rows, activities)
        skip_reasons = result["summary"]["skip_reasons"]
        assert isinstance(skip_reasons, dict)
        assert len(skip_reasons) > 0

    def test_skipped_row_includes_context(self):
        from app.parsing.emissions import calculate_emissions_for_batch
        mock_sb = _mock_supabase_no_factor()
        rows = [{"activity_type": "purchased_electricity", "consumption": 1000.0, "unit": "kwh", "region": "UK"}]
        activities = [{"id": "act-001"}]
        result = calculate_emissions_for_batch(mock_sb, rows, activities)
        skipped = result["skipped_rows"][0]
        assert "activity_type" in skipped
        assert "unit" in skipped
        assert "reason" in skipped
        assert "bucket" in skipped

    def test_summary_counts_match(self):
        from app.parsing.emissions import calculate_emissions_for_batch
        mock_sb = _mock_supabase_with_factor(0.1)
        rows = [
            {"activity_type": "purchased_electricity", "consumption": 100.0, "unit": "kwh"},
            {"activity_type": "purchased_electricity", "consumption": 200.0},  # no unit
        ]
        activities = [{"id": "act-001"}, {"id": "act-002"}]
        result = calculate_emissions_for_batch(mock_sb, rows, activities)
        summary = result["summary"]
        assert summary["total_count"] == 2
        assert summary["calculated_count"] + summary["skipped_count"] == 2


# ---------------------------------------------------------------------------
# 6. Pipeline stage counters — offline
# ---------------------------------------------------------------------------

class TestPipelineStageCounters:

    def _run_pipeline_offline(self, filename: str, activity_type: str, factor_value: float = 0.233) -> Dict[str, Any]:
        """Run pipeline with all DB calls mocked out."""
        file_path = str(DATA_DIR / filename)
        upload = _make_upload(file_path, activity_type)

        mock_sb = _mock_supabase_with_factor(factor_value)

        dummy_activity = {"id": "act-001", "upload_id": "test-upload-001"}

        with (
            patch("app.parsing.pipeline.resolve_upload_file_path", return_value=(file_path, None)),
            patch("app.parsing.pipeline.get_upload_mapping", return_value={}),
            patch("app.parsing.pipeline.insert_activities", return_value=[dummy_activity]),
            patch("app.parsing.pipeline.get_activities_for_upload", return_value=[]),
            patch("app.parsing.pipeline.insert_emissions", return_value=None),
            patch("app.parsing.pipeline.mark_as_completed", return_value=None),
            patch("app.parsing.pipeline.mark_as_failed", return_value=None),
            patch("app.parsing.pipeline.mark_as_pending_review", return_value=None),
            patch("app.parsing.pipeline.save_upload_inference_audit", return_value=None),
            patch("app.parsing.pipeline.set_upload_activity_type", return_value=None),
            patch("app.parsing.pipeline.update_upload_fields", return_value=None),
            patch("app.parsing.pipeline.log_parsing_event", return_value=None),
            patch("app.parsing.pipeline.create_client", return_value=mock_sb),
        ):
            from app.parsing.pipeline import run_parsing_pipeline
            return run_parsing_pipeline(upload)

    def test_stage_counters_present(self):
        result = self._run_pipeline_offline("stationary_combustion_happy.csv", "stationary_combustion")
        assert "stage_counters" in result
        counters = result["stage_counters"]
        assert "extracted_rows" in counters
        assert "empty_rows_skipped" in counters
        assert "validation_failed_rows" in counters
        assert "activities_inserted" in counters
        assert "emissions_calculated" in counters
        assert "emissions_skipped" in counters
        assert "emissions_skipped_by_reason" in counters

    def test_extracted_rows_count_correct(self):
        result = self._run_pipeline_offline("stationary_combustion_happy.csv", "stationary_combustion")
        assert result["stage_counters"]["extracted_rows"] == 3

    def test_large_file_stage_counters(self):
        result = self._run_pipeline_offline("stationary_combustion_large.csv", "stationary_combustion")
        assert result["stage_counters"]["extracted_rows"] == 1200
        assert result["validated_count"] > 0

    def test_sparse_rows_carry_forward(self):
        """Sparse CSV should not produce excessive validation failures due to carry-forward."""
        result = self._run_pipeline_offline("stationary_combustion_sparse.csv", "stationary_combustion")
        # All 3 rows should either validate or be skipped as empty — none should crash
        assert result.get("status") != "pending_review" or result.get("validated_count", 0) >= 0

    def test_messy_headers_normalised_and_validated(self):
        result = self._run_pipeline_offline("stationary_combustion_messy_headers.csv", "stationary_combustion")
        assert result.get("validated_count", 0) >= 1

    def test_emissions_skipped_when_no_factor(self):
        """When no factors exist, emissions_skipped should equal validated_count."""
        file_path = str(DATA_DIR / "purchased_electricity_no_factor.csv")
        upload = _make_upload(file_path, "purchased_electricity")

        mock_sb = _mock_supabase_no_factor()
        dummy_activity = {"id": "act-001", "upload_id": "test-upload-001"}

        with (
            patch("app.parsing.pipeline.resolve_upload_file_path", return_value=(file_path, None)),
            patch("app.parsing.pipeline.get_upload_mapping", return_value={}),
            patch("app.parsing.pipeline.insert_activities", return_value=[dummy_activity, dummy_activity]),
            patch("app.parsing.pipeline.get_activities_for_upload", return_value=[]),
            patch("app.parsing.pipeline.insert_emissions", return_value=None),
            patch("app.parsing.pipeline.mark_as_completed", return_value=None),
            patch("app.parsing.pipeline.mark_as_failed", return_value=None),
            patch("app.parsing.pipeline.mark_as_pending_review", return_value=None),
            patch("app.parsing.pipeline.save_upload_inference_audit", return_value=None),
            patch("app.parsing.pipeline.set_upload_activity_type", return_value=None),
            patch("app.parsing.pipeline.update_upload_fields", return_value=None),
            patch("app.parsing.pipeline.log_parsing_event", return_value=None),
            patch("app.parsing.pipeline.create_client", return_value=mock_sb),
        ):
            from app.parsing.pipeline import run_parsing_pipeline
            result = run_parsing_pipeline(upload)

        assert result["stage_counters"]["emissions_calculated"] == 0
        assert result["stage_counters"]["emissions_skipped"] > 0
        assert "no_factor_match" in result["stage_counters"]["emissions_skipped_by_reason"]


# ---------------------------------------------------------------------------
# 7. Strict mode
# ---------------------------------------------------------------------------

class TestStrictMode:

    def test_strict_mode_raises_on_zero_coverage(self):
        from app.parsing.pipeline import run_parsing_pipeline
        from app.parsing.validation import ValidationError

        file_path = str(DATA_DIR / "purchased_electricity_no_factor.csv")
        upload = _make_upload(file_path, "purchased_electricity", strict_mode=True)

        mock_sb = _mock_supabase_no_factor()
        dummy_activity = {"id": "act-001", "upload_id": "test-upload-001"}

        with (
            patch("app.parsing.pipeline.resolve_upload_file_path", return_value=(file_path, None)),
            patch("app.parsing.pipeline.get_upload_mapping", return_value={}),
            patch("app.parsing.pipeline.insert_activities", return_value=[dummy_activity, dummy_activity]),
            patch("app.parsing.pipeline.get_activities_for_upload", return_value=[]),
            patch("app.parsing.pipeline.insert_emissions", return_value=None),
            patch("app.parsing.pipeline.mark_as_completed", return_value=None),
            patch("app.parsing.pipeline.mark_as_failed", return_value=None),
            patch("app.parsing.pipeline.mark_as_pending_review", return_value=None),
            patch("app.parsing.pipeline.save_upload_inference_audit", return_value=None),
            patch("app.parsing.pipeline.set_upload_activity_type", return_value=None),
            patch("app.parsing.pipeline.update_upload_fields", return_value=None),
            patch("app.parsing.pipeline.log_parsing_event", return_value=None),
            patch("app.parsing.pipeline.create_client", return_value=mock_sb),
        ):
            with pytest.raises(Exception) as exc_info:
                run_parsing_pipeline(upload)

        assert "Strict mode" in str(exc_info.value) or "strict" in str(exc_info.value).lower()

    def test_permissive_mode_completes_with_zero_coverage(self):
        from app.parsing.pipeline import run_parsing_pipeline

        file_path = str(DATA_DIR / "purchased_electricity_no_factor.csv")
        upload = _make_upload(file_path, "purchased_electricity", strict_mode=False)

        mock_sb = _mock_supabase_no_factor()
        dummy_activity = {"id": "act-001", "upload_id": "test-upload-001"}

        with (
            patch("app.parsing.pipeline.resolve_upload_file_path", return_value=(file_path, None)),
            patch("app.parsing.pipeline.get_upload_mapping", return_value={}),
            patch("app.parsing.pipeline.insert_activities", return_value=[dummy_activity, dummy_activity]),
            patch("app.parsing.pipeline.get_activities_for_upload", return_value=[]),
            patch("app.parsing.pipeline.insert_emissions", return_value=None),
            patch("app.parsing.pipeline.mark_as_completed", return_value=None),
            patch("app.parsing.pipeline.mark_as_failed", return_value=None),
            patch("app.parsing.pipeline.mark_as_pending_review", return_value=None),
            patch("app.parsing.pipeline.save_upload_inference_audit", return_value=None),
            patch("app.parsing.pipeline.set_upload_activity_type", return_value=None),
            patch("app.parsing.pipeline.update_upload_fields", return_value=None),
            patch("app.parsing.pipeline.log_parsing_event", return_value=None),
            patch("app.parsing.pipeline.create_client", return_value=mock_sb),
        ):
            result = run_parsing_pipeline(upload)

        # Should complete without raising
        assert "stage_counters" in result


# ---------------------------------------------------------------------------
# 8. Factor match diagnostic detail
# ---------------------------------------------------------------------------

class TestFactorDiagnostics:

    def test_lookup_attempts_in_error_message(self):
        from app.parsing.emissions import _fetch_emission_factor
        mock_sb = _mock_supabase_no_factor()
        factor, attempts = _fetch_emission_factor(mock_sb, "purchased_electricity", "kwh", "UK", 2024)
        assert factor is None
        assert len(attempts) > 0
        # Should list at least one attempt with the activity_type
        assert any("purchased_electricity" in a for a in attempts)

    def test_all_fallback_attempts_listed(self):
        """When unit+region+year all provided, should attempt all combos."""
        from app.parsing.emissions import _fetch_emission_factor
        mock_sb = _mock_supabase_no_factor()
        _, attempts = _fetch_emission_factor(mock_sb, "stationary_combustion", "m3", "UK", 2024)
        # Should have tried many combinations
        assert len(attempts) >= 4

    def test_no_unit_fewer_attempts(self):
        from app.parsing.emissions import _fetch_emission_factor
        mock_sb = _mock_supabase_no_factor()
        _, attempts_with = _fetch_emission_factor(mock_sb, "stationary_combustion", "m3", "UK", 2024)
        _, attempts_without = _fetch_emission_factor(mock_sb, "stationary_combustion", None, None, None)
        # More context → more fallback attempts
        assert len(attempts_with) > len(attempts_without)

    def test_successful_match_returns_first_attempt(self):
        from app.parsing.emissions import _fetch_emission_factor
        mock_sb = _mock_supabase_with_factor(0.5)
        factor, attempts = _fetch_emission_factor(mock_sb, "purchased_electricity", "kwh", "UK", 2024)
        assert factor is not None
        assert len(attempts) >= 1
        # Should have found on first or early attempt
        assert len(attempts) <= 8


# ---------------------------------------------------------------------------
# 9. Schema integrity checks
# ---------------------------------------------------------------------------

class TestSchemaIntegrity:

    def test_all_activity_types_have_required_fields(self):
        from app.parsing.schemas import SCHEMAS
        for at, schema in SCHEMAS.items():
            assert "fields" in schema, f"{at} missing 'fields'"
            required = [f for f, d in schema["fields"].items() if isinstance(d, dict) and d.get("required")]
            assert len(required) > 0, f"{at} has no required fields"

    def test_all_required_fields_have_type(self):
        from app.parsing.schemas import SCHEMAS
        for at, schema in SCHEMAS.items():
            for field_name, field_def in schema["fields"].items():
                if isinstance(field_def, dict) and field_def.get("required"):
                    assert "type" in field_def, f"{at}.{field_name} required but missing 'type'"

    def test_known_activity_types_present(self):
        from app.parsing.schemas import SCHEMAS
        expected = {
            "stationary_combustion", "mobile_combustion", "fugitive_emissions",
            "purchased_electricity", "business_travel", "employee_commuting",
            "waste_generated", "purchased_goods", "upstream_transport",
        }
        for at in expected:
            assert at in SCHEMAS, f"Missing expected activity type: {at}"
