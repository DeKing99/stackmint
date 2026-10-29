from app.services.collection.calculator import calculate_activity_completion
from app.services.collection.rules import CollectionUnit
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
