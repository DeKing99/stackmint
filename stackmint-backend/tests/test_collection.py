import pytest

from app.services.collection.calculator import calculate_activity_completion
from app.services.collection.completeness import (
    build_completeness,
    expected_periods,
    period_for_activity,
)
from app.services.collection.rules import CollectionRule, CollectionUnit
from app.services.collection.schemas import calculate_overall_completion


def test_activity_completion_is_not_applicable_without_expected_units():
    assert calculate_activity_completion([]) is None


def test_activity_completion_requires_every_expected_unit_for_complete():
    units = [
        CollectionUnit("electricity", "location-1", "2026-01", True, None),
        CollectionUnit("electricity", "location-1", "2026-02", False, None),
    ]

    assert calculate_activity_completion(units) == 50


def test_overall_completion_is_not_applicable_without_expected_units():
    assert calculate_overall_completion([]) is None


def test_overall_completion_counts_expected_units_across_activities():
    activities = [
        {"expected_units": 2, "completed_units": 1},
        {"expected_units": 3, "completed_units": 2},
    ]

    assert calculate_overall_completion(activities) == 60


def test_calendar_year_period_generation_matches_collection_frequency():
    assert expected_periods(2026, "monthly") == [
        f"2026-{month:02d}" for month in range(1, 13)
    ]
    assert expected_periods(2026, "quarterly") == [
        "2026-Q1",
        "2026-Q2",
        "2026-Q3",
        "2026-Q4",
    ]
    assert expected_periods(2026, "annual") == ["2026"]


def test_historical_dates_without_provenance_are_not_trusted():
    assert period_for_activity(
        {
            "activity_date": "2026-03-01",
            "activity_date_provenance": "unknown",
        },
        2026,
        "monthly",
    ) is None


def test_explicit_reporting_period_is_used_for_its_selected_frequency():
    activity = {
        "reporting_period": "2026-05",
        "activity_date_provenance": "explicit_reporting_period",
    }

    assert period_for_activity(activity, 2026, "monthly") == "2026-05"
    assert period_for_activity(activity, 2026, "quarterly") == "2026-Q2"
    assert period_for_activity(activity, 2026, "annual") == "2026"


def test_completeness_counts_only_applicable_location_periods():
    rules = [
        CollectionRule("purchased_electricity", "Electricity", "monthly", True)
    ]
    result = build_completeness(
        year=2026,
        rules=rules,
        activities=[
            {
                "activity_type": "purchased_electricity",
                "company_location_id": "loc-1",
                "activity_date": "2026-03-11",
                "activity_date_provenance": "source_activity_date",
                "quantity": 120,
            },
            {
                "activity_type": "purchased_electricity",
                "company_location_id": "loc-1",
                "activity_date": "2026-02-11",
                "activity_date_provenance": "unknown",
                "quantity": 90,
            },
            {
                "activity_type": "purchased_electricity",
                "company_location_id": None,
                "activity_date": "2026-04-11",
                "activity_date_provenance": "source_activity_date",
                "quantity": 60,
            },
        ],
        locations=[
            {"id": "loc-1", "location_name": "Factory"},
            {"id": "loc-2", "location_name": "Office"},
        ],
        applicability=[
            {
                "activity_type": "purchased_electricity",
                "company_location_id": "loc-1",
                "is_applicable": True,
            },
            {
                "activity_type": "purchased_electricity",
                "company_location_id": "loc-2",
                "is_applicable": False,
            },
        ],
        activity_categories={"purchased_electricity": "purchased_electricity"},
    )

    assert result["status"] == "in_progress"
    assert result["expected_units"] == 12
    assert result["completed_units"] == 1
    assert result["activities"][0]["completion"] == pytest.approx(100 / 12)
    assert result["unattributed_records_excluded"] == 1


def test_missing_location_applicability_makes_calculation_unavailable():
    result = build_completeness(
        year=2026,
        rules=[
            CollectionRule("stationary_combustion", "Fuel", "quarterly", True)
        ],
        activities=[],
        locations=[{"id": "loc-1"}],
        applicability=[],
        activity_categories={"stationary_combustion": "stationary_combustion"},
    )

    assert result["status"] == "unavailable"
    assert result["completion"] is None
    assert result["activities"][0]["missing_applicability_count"] == 1


def test_explicitly_not_applicable_activity_has_no_expected_units():
    result = build_completeness(
        year=2026,
        rules=[
            CollectionRule("stationary_combustion", "Fuel", "annual", True)
        ],
        activities=[],
        locations=[{"id": "loc-1"}],
        applicability=[{
            "activity_type": "stationary_combustion",
            "company_location_id": "loc-1",
            "is_applicable": False,
        }],
        activity_categories={"stationary_combustion": "stationary_combustion"},
    )

    assert result["status"] == "not_applicable"
    assert result["completion"] is None
    assert result["expected_units"] == 0


def test_factor_variant_activity_maps_to_its_collection_category():
    result = build_completeness(
        year=2026,
        rules=[
            CollectionRule("stationary_combustion", "Fuel", "annual", True)
        ],
        activities=[{
            "activity_type": "stationary_combustion_gaseous_fuels",
            "company_location_id": "loc-1",
            "activity_date": "2026-02-01",
            "activity_date_provenance": "source_activity_date",
            "quantity": 10,
        }],
        locations=[{"id": "loc-1"}],
        applicability=[{
            "activity_type": "stationary_combustion",
            "company_location_id": "loc-1",
            "is_applicable": True,
        }],
        activity_categories={
            "stationary_combustion": "stationary_combustion",
            "stationary_combustion_gaseous_fuels": "stationary_combustion",
        },
    )

    assert result["status"] == "complete"
    assert result["completed_units"] == 1
