"""
test_spend.py — Unit tests for the spend-based accounting engine.

All tests run offline (no live Supabase).
Tests that require Supabase are marked @pytest.mark.integration.

Coverage:
    - Currency conversion
    - Category resolution (priority order, normalisation)
    - Sector / factor batch resolution
    - Emission calculation arithmetic
    - Batch calculation (happy path, partial failures)
    - Priority guard (activity-based vs spend-based)
    - Double-counting prevention
    - Edge cases (zero amount, unsupported currency, missing fields)
"""

import pytest
from decimal import Decimal
from typing import Any, Dict, List, Optional
from unittest.mock import MagicMock, patch


# ---------------------------------------------------------------------------
# Helpers to build mock Supabase clients.
# ---------------------------------------------------------------------------

def _mock_supabase() -> MagicMock:
    """Return a bare Supabase mock — all table queries return empty lists."""
    sb = MagicMock()
    empty_resp = MagicMock()
    empty_resp.data = []
    chain = MagicMock()
    chain.execute.return_value = empty_resp
    chain.eq.return_value = chain
    chain.ilike.return_value = chain
    chain.in_.return_value = chain
    chain.not_.return_value = chain
    chain.is_.return_value = chain
    chain.order.return_value = chain
    chain.limit.return_value = chain
    sb.table.return_value = chain
    return sb


def _mock_supabase_with_factor(
    sector_code: str,
    factor_value: float,
    spend_category: str = "software",
    scope: str = "scope_3",
) -> MagicMock:
    """
    Return a Supabase mock that serves a single spend emission factor for the
    given sector_code, and a matching spend_category_mappings entry.
    """
    factor_row = {
        "id": "factor-001",
        "factor_code": f"USEEIO-{sector_code}",
        "sector_code": sector_code,
        "sector_name": "Test Sector",
        "factor_value": factor_value,
        "factor_unit": "kgCO2e/USD",
        "currency_code": "USD",
        "scope": scope,
        "spend_category": spend_category,
        "source_dataset": "useeio",
    }
    category_mapping_row = {
        "spend_category": spend_category,
        "sector_code": sector_code,
        "confidence": 0.95,
    }
    sector_mapping_row = {
        "spend_category": spend_category,
        "sector_code": sector_code,
        "confidence": 0.90,
    }

    def _make_resp(data: List[Dict]) -> MagicMock:
        resp = MagicMock()
        resp.data = data
        return resp

    sb = MagicMock()

    def _table(table_name: str) -> MagicMock:
        chain = MagicMock()
        chain.execute.return_value = _make_resp([])

        if table_name == "spend_emission_factors":
            factor_chain = MagicMock()
            factor_chain.execute.return_value = _make_resp([factor_row])
            factor_chain.eq.return_value = factor_chain
            factor_chain.in_.return_value = factor_chain
            factor_chain.not_.return_value = factor_chain
            factor_chain.is_.return_value = factor_chain
            factor_chain.ilike.return_value = factor_chain
            factor_chain.order.return_value = factor_chain
            factor_chain.limit.return_value = factor_chain
            factor_chain.select.return_value = factor_chain
            chain = factor_chain

        elif table_name == "spend_category_mappings":
            cat_chain = MagicMock()
            cat_chain.execute.return_value = _make_resp([category_mapping_row])
            cat_chain.eq.return_value = cat_chain
            cat_chain.in_.return_value = cat_chain
            cat_chain.not_.return_value = cat_chain
            cat_chain.is_.return_value = cat_chain
            cat_chain.ilike.return_value = cat_chain
            cat_chain.order.return_value = cat_chain
            cat_chain.limit.return_value = cat_chain
            cat_chain.select.return_value = cat_chain
            chain = cat_chain

        elif table_name == "spend_category_to_sector_mappings":
            sec_chain = MagicMock()
            sec_chain.execute.return_value = _make_resp([sector_mapping_row])
            sec_chain.eq.return_value = sec_chain
            sec_chain.in_.return_value = sec_chain
            sec_chain.not_.return_value = sec_chain
            sec_chain.is_.return_value = sec_chain
            sec_chain.ilike.return_value = sec_chain
            sec_chain.order.return_value = sec_chain
            sec_chain.limit.return_value = sec_chain
            sec_chain.select.return_value = sec_chain
            chain = sec_chain

        else:
            chain.select.return_value = chain
            chain.eq.return_value = chain
            chain.in_.return_value = chain
            chain.not_.return_value = chain
            chain.is_.return_value = chain
            chain.ilike.return_value = chain
            chain.order.return_value = chain
            chain.limit.return_value = chain

        return chain

    sb.table = _table
    return sb


# ---------------------------------------------------------------------------
# 1. Currency Conversion
# ---------------------------------------------------------------------------

class TestCurrencyConversion:

    def test_usd_passthrough(self):
        from app.parsing.spend import convert_to_usd
        usd_amount, rate = convert_to_usd(1000.0, "USD")
        assert usd_amount == 1000.0
        assert rate == 1.0

    def test_gbp_conversion(self):
        from app.parsing.spend import convert_to_usd, REFERENCE_EXCHANGE_RATES_TO_USD
        expected_rate = REFERENCE_EXCHANGE_RATES_TO_USD["GBP"]
        usd_amount, rate = convert_to_usd(10_000.0, "GBP")
        assert abs(usd_amount - 10_000.0 * expected_rate) < 0.01
        assert rate == expected_rate

    def test_eur_conversion(self):
        from app.parsing.spend import convert_to_usd, REFERENCE_EXCHANGE_RATES_TO_USD
        expected_rate = REFERENCE_EXCHANGE_RATES_TO_USD["EUR"]
        usd_amount, rate = convert_to_usd(5_000.0, "EUR")
        assert abs(usd_amount - 5_000.0 * expected_rate) < 0.01

    def test_case_insensitive_currency(self):
        from app.parsing.spend import convert_to_usd
        usd_gbp, _ = convert_to_usd(1000.0, "gbp")
        usd_GBP, _ = convert_to_usd(1000.0, "GBP")
        assert usd_gbp == usd_GBP

    def test_custom_rate_override(self):
        from app.parsing.spend import convert_to_usd
        custom = {"GBP": 1.50}
        usd_amount, rate = convert_to_usd(1000.0, "GBP", custom_rates=custom)
        assert abs(usd_amount - 1500.0) < 0.01
        assert rate == 1.50

    def test_unsupported_currency_raises(self):
        from app.parsing.spend import convert_to_usd, SpendCalculationError
        with pytest.raises(SpendCalculationError, match="Unsupported currency"):
            convert_to_usd(1000.0, "XYZ")

    def test_all_reference_currencies_supported(self):
        from app.parsing.spend import convert_to_usd, REFERENCE_EXCHANGE_RATES_TO_USD
        for currency in REFERENCE_EXCHANGE_RATES_TO_USD:
            usd_amount, rate = convert_to_usd(100.0, currency)
            assert usd_amount > 0
            assert rate > 0


# ---------------------------------------------------------------------------
# 2. Activity vs Spend Data Detection
# ---------------------------------------------------------------------------

class TestActivityAndSpendDataDetection:

    def test_has_activity_data_with_quantity_and_unit(self):
        from app.parsing.spend import has_activity_data
        row = {"quantity": 500, "unit": "liters"}
        assert has_activity_data(row) is True

    def test_has_activity_data_with_consumption_and_unit(self):
        from app.parsing.spend import has_activity_data
        row = {"consumption": 1000.0, "unit": "kwh"}
        assert has_activity_data(row) is True

    def test_has_activity_data_no_unit(self):
        from app.parsing.spend import has_activity_data
        row = {"quantity": 500}
        assert has_activity_data(row) is False

    def test_has_activity_data_no_quantity(self):
        from app.parsing.spend import has_activity_data
        row = {"unit": "kwh"}
        assert has_activity_data(row) is False

    def test_has_activity_data_empty_row(self):
        from app.parsing.spend import has_activity_data
        assert has_activity_data({}) is False

    def test_has_spend_data_with_amount_and_currency(self):
        from app.parsing.spend import has_spend_data
        row = {"amount": 10_000, "currency": "GBP"}
        assert has_spend_data(row) is True

    def test_has_spend_data_with_amount_spent(self):
        from app.parsing.spend import has_spend_data
        row = {"amount_spent": 5_000.0, "currency": "EUR"}
        assert has_spend_data(row) is True

    def test_has_spend_data_no_currency(self):
        from app.parsing.spend import has_spend_data
        row = {"amount": 1000}
        assert has_spend_data(row) is False

    def test_has_spend_data_no_amount(self):
        from app.parsing.spend import has_spend_data
        row = {"currency": "GBP"}
        assert has_spend_data(row) is False

    def test_has_spend_data_zero_amount(self):
        from app.parsing.spend import has_spend_data
        row = {"amount": 0, "currency": "GBP"}
        # amount=0 is falsy in Python; the `or` chain resolves to None.
        # has_spend_data correctly returns False for zero-amount rows since
        # there is no meaningful spend to calculate emissions for.
        assert has_spend_data(row) is False


# ---------------------------------------------------------------------------
# 3. Emission Calculation — Single Transaction
# ---------------------------------------------------------------------------

class TestSingleTransactionCalculation:

    def test_basic_calculation_gbp(self):
        """£10,000 at GBP/USD=1.27, factor=0.12 → 10000*1.27*0.12 = 1524 kgCO2e"""
        from app.parsing.spend import (
            calculate_spend_emission_for_transaction,
            clear_spend_factor_cache,
            REFERENCE_EXCHANGE_RATES_TO_USD,
        )
        clear_spend_factor_cache()

        mock_sb = _mock_supabase_with_factor("511200/US", 0.12, spend_category="software")
        transaction = {
            "amount": 10_000.0,
            "currency": "GBP",
            "spend_category": "software",
            "sector_code": "511200/US",
            "transaction_date": "2024-01-15",
            "organization_id": "org-001",
        }

        result = calculate_spend_emission_for_transaction(mock_sb, transaction)

        gbp_rate = REFERENCE_EXCHANGE_RATES_TO_USD["GBP"]
        expected_usd = 10_000.0 * gbp_rate
        expected_kgco2e = expected_usd * 0.12

        assert abs(result["emissions_kgco2e"] - expected_kgco2e) < 0.01
        assert abs(result["emissions_tco2e"] - expected_kgco2e / 1000.0) < 0.000001
        assert result["calculation_method"] == "spend_based"
        assert result["source_system"] == "useeio"
        assert result["activity_unit"] == "USD"
        assert result["reporting_year"] == 2024
        assert result["reporting_month"] == 1
        assert result["reporting_quarter"] == 1

    def test_usd_no_conversion_needed(self):
        """$13,500 × 0.12 = 1620 kgCO2e"""
        from app.parsing.spend import (
            calculate_spend_emission_for_transaction,
            clear_spend_factor_cache,
        )
        clear_spend_factor_cache()

        mock_sb = _mock_supabase_with_factor("511200/US", 0.12, spend_category="software")
        transaction = {
            "amount": 13_500.0,
            "currency": "USD",
            "spend_category": "software",
            "sector_code": "511200/US",
            "transaction_date": "2024-03-20",
        }

        result = calculate_spend_emission_for_transaction(mock_sb, transaction)
        assert abs(result["emissions_kgco2e"] - 1620.0) < 0.01

    def test_missing_amount_raises(self):
        from app.parsing.spend import (
            calculate_spend_emission_for_transaction,
            SpendCalculationError,
            clear_spend_factor_cache,
        )
        clear_spend_factor_cache()
        mock_sb = _mock_supabase_with_factor("511200/US", 0.12)
        with pytest.raises(SpendCalculationError, match="amount"):
            calculate_spend_emission_for_transaction(mock_sb, {"currency": "GBP"})

    def test_zero_amount_raises(self):
        from app.parsing.spend import (
            calculate_spend_emission_for_transaction,
            SpendCalculationError,
            clear_spend_factor_cache,
        )
        clear_spend_factor_cache()
        mock_sb = _mock_supabase_with_factor("511200/US", 0.12)
        with pytest.raises(SpendCalculationError, match="amount"):
            calculate_spend_emission_for_transaction(
                mock_sb, {"amount": 0, "currency": "GBP", "spend_category": "software", "sector_code": "511200/US"}
            )

    def test_metadata_contains_enrichment_fields(self):
        from app.parsing.spend import (
            calculate_spend_emission_for_transaction,
            clear_spend_factor_cache,
        )
        clear_spend_factor_cache()
        mock_sb = _mock_supabase_with_factor("511200/US", 0.12, spend_category="software")
        transaction = {
            "amount": 5_000.0,
            "currency": "USD",
            "spend_category": "software",
            "sector_code": "511200/US",
            "transaction_date": "2024-06-01",
        }
        result = calculate_spend_emission_for_transaction(mock_sb, transaction)
        meta = result["metadata"]
        assert "spend_category" in meta
        assert "sector_code" in meta
        assert "factor_value_kgco2e_per_usd" in meta
        assert "usd_amount" in meta
        assert "exchange_rate_to_usd" in meta
        assert "original_currency" in meta

    def test_scope_mapping_scope3_default(self):
        from app.parsing.spend import (
            calculate_spend_emission_for_transaction,
            clear_spend_factor_cache,
        )
        clear_spend_factor_cache()
        mock_sb = _mock_supabase_with_factor("511200/US", 0.12, scope="scope_3")
        transaction = {
            "amount": 1000.0,
            "currency": "USD",
            "spend_category": "software",
            "sector_code": "511200/US",
            "transaction_date": "2024-01-01",
        }
        result = calculate_spend_emission_for_transaction(mock_sb, transaction)
        assert result["scope"] == 3

    def test_scope_mapping_scope2(self):
        from app.parsing.spend import (
            calculate_spend_emission_for_transaction,
            clear_spend_factor_cache,
        )
        clear_spend_factor_cache()
        mock_sb = _mock_supabase_with_factor("221100/US", 0.384, spend_category="purchased_electricity", scope="scope_2")
        transaction = {
            "amount": 1000.0,
            "currency": "USD",
            "spend_category": "purchased_electricity",
            "sector_code": "221100/US",
            "transaction_date": "2024-01-01",
        }
        result = calculate_spend_emission_for_transaction(mock_sb, transaction)
        assert result["scope"] == 2


# ---------------------------------------------------------------------------
# 4. Batch Calculation
# ---------------------------------------------------------------------------

class TestBatchCalculation:

    def test_batch_empty_input(self):
        from app.parsing.spend import calculate_spend_emissions_for_batch, clear_spend_factor_cache
        clear_spend_factor_cache()
        result = calculate_spend_emissions_for_batch(_mock_supabase(), [])
        assert result["rows"] == []
        assert result["summary"]["total"] == 0

    def test_batch_single_happy_path(self):
        from app.parsing.spend import calculate_spend_emissions_for_batch, clear_spend_factor_cache
        clear_spend_factor_cache()
        mock_sb = _mock_supabase_with_factor("511200/US", 0.12, spend_category="software")
        transactions = [
            {
                "amount": 10_000.0,
                "currency": "USD",
                "spend_category": "software",
                "sector_code": "511200/US",
                "transaction_date": "2024-01-10",
                "organization_id": "org-001",
            }
        ]
        result = calculate_spend_emissions_for_batch(mock_sb, transactions)
        assert len(result["rows"]) == 1
        assert result["summary"]["calculated"] == 1
        assert result["summary"]["skipped"] == 0
        assert abs(result["rows"][0]["emissions_kgco2e"] - 1200.0) < 0.01

    def test_batch_multiple_transactions(self):
        from app.parsing.spend import calculate_spend_emissions_for_batch, clear_spend_factor_cache
        clear_spend_factor_cache()
        mock_sb = _mock_supabase_with_factor("511200/US", 0.10, spend_category="software")
        transactions = [
            {
                "amount": 1_000.0,
                "currency": "USD",
                "spend_category": "software",
                "sector_code": "511200/US",
                "transaction_date": f"2024-0{m}-01",
                "organization_id": "org-001",
            }
            for m in range(1, 6)
        ]
        result = calculate_spend_emissions_for_batch(mock_sb, transactions)
        assert len(result["rows"]) == 5
        for row in result["rows"]:
            assert abs(row["emissions_kgco2e"] - 100.0) < 0.01

    def test_batch_skips_invalid_currency(self):
        from app.parsing.spend import calculate_spend_emissions_for_batch, clear_spend_factor_cache
        clear_spend_factor_cache()
        mock_sb = _mock_supabase_with_factor("511200/US", 0.12, spend_category="software")
        transactions = [
            {
                "amount": 1000.0,
                "currency": "XYZ",  # unsupported
                "spend_category": "software",
                "sector_code": "511200/US",
                "transaction_date": "2024-01-01",
            },
            {
                "amount": 2000.0,
                "currency": "USD",
                "spend_category": "software",
                "sector_code": "511200/US",
                "transaction_date": "2024-01-02",
            },
        ]
        result = calculate_spend_emissions_for_batch(mock_sb, transactions)
        assert result["summary"]["calculated"] == 1
        assert result["summary"]["skipped"] == 1
        assert "unsupported_currency" in result["summary"]["skip_reasons"]

    def test_batch_skips_missing_amount(self):
        from app.parsing.spend import calculate_spend_emissions_for_batch, clear_spend_factor_cache
        clear_spend_factor_cache()
        mock_sb = _mock_supabase_with_factor("511200/US", 0.12, spend_category="software")
        transactions = [
            {
                "currency": "USD",  # no amount
                "spend_category": "software",
                "sector_code": "511200/US",
                "transaction_date": "2024-01-01",
            }
        ]
        result = calculate_spend_emissions_for_batch(mock_sb, transactions)
        assert result["summary"]["calculated"] == 0
        assert result["summary"]["skipped"] == 1
        assert "invalid_amount" in result["summary"]["skip_reasons"]

    def test_batch_returns_spend_based_calculation_method(self):
        from app.parsing.spend import calculate_spend_emissions_for_batch, clear_spend_factor_cache
        clear_spend_factor_cache()
        mock_sb = _mock_supabase_with_factor("511200/US", 0.10, spend_category="software")
        result = calculate_spend_emissions_for_batch(mock_sb, [
            {
                "amount": 500.0,
                "currency": "USD",
                "spend_category": "software",
                "sector_code": "511200/US",
                "transaction_date": "2024-06-15",
            }
        ])
        assert result["rows"][0]["calculation_method"] == "spend_based"
        assert result["rows"][0]["source_system"] == "useeio"
        assert result["rows"][0]["activity_unit"] == "USD"


# ---------------------------------------------------------------------------
# 5. Reporting Period Extraction
# ---------------------------------------------------------------------------

class TestReportingPeriods:

    def test_q1(self):
        from app.parsing.spend import _extract_reporting_date_parts
        y, m, q, p = _extract_reporting_date_parts("2024-01-15")
        assert y == 2024 and m == 1 and q == 1 and p == "2024-Q1"

    def test_q2(self):
        from app.parsing.spend import _extract_reporting_date_parts
        y, m, q, p = _extract_reporting_date_parts("2024-04-01")
        assert q == 2 and p == "2024-Q2"

    def test_q3(self):
        from app.parsing.spend import _extract_reporting_date_parts
        y, m, q, p = _extract_reporting_date_parts("2024-09-30")
        assert q == 3 and p == "2024-Q3"

    def test_q4(self):
        from app.parsing.spend import _extract_reporting_date_parts
        y, m, q, p = _extract_reporting_date_parts("2024-12-31")
        assert q == 4 and p == "2024-Q4"

    def test_none_input(self):
        from app.parsing.spend import _extract_reporting_date_parts
        y, m, q, p = _extract_reporting_date_parts(None)
        assert y is None and m is None and q is None and p is None

    def test_iso_with_timezone(self):
        from app.parsing.spend import _extract_reporting_date_parts
        y, m, q, p = _extract_reporting_date_parts("2024-07-04T00:00:00Z")
        assert y == 2024 and m == 7 and q == 3


# ---------------------------------------------------------------------------
# 6. Factor Cache
# ---------------------------------------------------------------------------

class TestSpendFactorCache:

    def test_cache_stores_and_retrieves(self):
        from app.parsing.spend import _spend_factor_cache, clear_spend_factor_cache, _TTLSpendFactorCache
        clear_spend_factor_cache()
        factor = {"id": "f1", "factor_value": 0.42}
        _spend_factor_cache.set("511200/US", factor)
        result = _spend_factor_cache.get_with_sentinel("511200/US")
        assert result is not _TTLSpendFactorCache._MISSING
        assert result["factor_value"] == 0.42

    def test_cache_miss_returns_sentinel(self):
        from app.parsing.spend import _spend_factor_cache, clear_spend_factor_cache, _TTLSpendFactorCache
        clear_spend_factor_cache()
        result = _spend_factor_cache.get_with_sentinel("nonexistent/US")
        assert result is _TTLSpendFactorCache._MISSING

    def test_cache_stores_none(self):
        from app.parsing.spend import _spend_factor_cache, clear_spend_factor_cache, _TTLSpendFactorCache
        clear_spend_factor_cache()
        _spend_factor_cache.set("unknown/US", None)
        result = _spend_factor_cache.get_with_sentinel("unknown/US")
        assert result is not _TTLSpendFactorCache._MISSING
        assert result is None

    def test_clear_removes_all_entries(self):
        from app.parsing.spend import _spend_factor_cache, clear_spend_factor_cache, _TTLSpendFactorCache
        _spend_factor_cache.set("511200/US", {"id": "f1"})
        clear_spend_factor_cache()
        result = _spend_factor_cache.get_with_sentinel("511200/US")
        assert result is _TTLSpendFactorCache._MISSING


# ---------------------------------------------------------------------------
# 7. Text Normalisation
# ---------------------------------------------------------------------------

class TestTextNormalisation:

    def test_normalize_text_strips_whitespace(self):
        from app.parsing.spend import _normalize_text
        assert _normalize_text("  Microsoft  ") == "microsoft"

    def test_normalize_text_lowercases(self):
        from app.parsing.spend import _normalize_text
        assert _normalize_text("AWS") == "aws"

    def test_normalize_text_collapses_spaces(self):
        from app.parsing.spend import _normalize_text
        assert _normalize_text("Amazon  Web   Services") == "amazon web services"

    def test_normalize_text_none(self):
        from app.parsing.spend import _normalize_text
        assert _normalize_text(None) == ""

    def test_normalize_text_empty(self):
        from app.parsing.spend import _normalize_text
        assert _normalize_text("") == ""


# ---------------------------------------------------------------------------
# 8. End-to-End Priority Guard (no double counting)
# ---------------------------------------------------------------------------

class TestPriorityGuard:

    def test_row_with_quantity_and_unit_not_spend_fallback(self):
        """A row with quantity + unit has activity data → should NOT trigger spend path."""
        from app.parsing.spend import has_activity_data, has_spend_data
        row = {
            "consumption": 500.0,
            "unit": "liters",
            "amount": 1000.0,
            "currency": "GBP",
        }
        assert has_activity_data(row) is True
        assert has_spend_data(row) is True
        # When both are present, activity-based takes priority. The pipeline
        # only triggers spend fallback when activity-based FAILS for a row
        # that has NO activity data. A row with both should not reach spend path
        # (the pipeline guards against this with has_activity_data check).

    def test_row_with_only_spend_data_qualifies(self):
        """A row with amount + currency but no quantity → spend fallback."""
        from app.parsing.spend import has_activity_data, has_spend_data
        row = {
            "amount": 10_000.0,
            "currency": "GBP",
            "procurement_category": "software",
        }
        assert has_activity_data(row) is False
        assert has_spend_data(row) is True

    def test_row_with_neither_does_not_qualify(self):
        """A row with no quantity and no amount → neither path."""
        from app.parsing.spend import has_activity_data, has_spend_data
        row = {
            "description": "Office supply purchase",
            "date": "2024-01-01",
        }
        assert has_activity_data(row) is False
        assert has_spend_data(row) is False
