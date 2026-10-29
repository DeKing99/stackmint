from __future__ import annotations

import re
from datetime import date, datetime
from typing import Any

from app.services.collection.rules import CollectionRule, CollectionUnit

TRUSTED_DATE_PROVENANCE = {
    "source_activity_date",
    "year_month",
    "explicit_reporting_period",
}


def expected_periods(year: int, frequency: str) -> list[str]:
    if frequency == "monthly":
        return [f"{year:04d}-{month:02d}" for month in range(1, 13)]
    if frequency == "quarterly":
        return [f"{year:04d}-Q{quarter}" for quarter in range(1, 5)]
    if frequency == "annual":
        return [str(year)]
    raise ValueError(f"Unsupported collection frequency: {frequency}")


def _period_from_explicit_reporting_period(
    value: object,
    year: int,
    frequency: str,
) -> str | None:
    if not isinstance(value, str):
        return None

    text = value.strip()
    year_match = re.fullmatch(r"(\d{4})", text)
    if year_match:
        return str(year) if frequency == "annual" and int(year_match[1]) == year else None

    quarter_match = re.fullmatch(r"(\d{4})-Q([1-4])", text, re.IGNORECASE)
    if quarter_match:
        parsed_year = int(quarter_match[1])
        quarter = int(quarter_match[2])
        if parsed_year != year:
            return None
        if frequency == "quarterly":
            return f"{year:04d}-Q{quarter}"
        return None

    month_match = re.fullmatch(r"(\d{4})-(\d{1,2})", text)
    if month_match:
        parsed_year = int(month_match[1])
        month = int(month_match[2])
        if parsed_year != year or not 1 <= month <= 12:
            return None
        if frequency == "monthly":
            return f"{year:04d}-{month:02d}"
        if frequency == "quarterly":
            return f"{year:04d}-Q{((month - 1) // 3) + 1}"
        return str(year) if frequency == "annual" else None

    try:
        parsed = date.fromisoformat(text[:10])
    except ValueError:
        return None

    if parsed.year != year:
        return None
    if frequency == "monthly":
        return parsed.strftime("%Y-%m")
    if frequency == "quarterly":
        return f"{year:04d}-Q{((parsed.month - 1) // 3) + 1}"
    if frequency == "annual":
        return str(year)
    return None


def _period_from_activity_date(
    value: object,
    year: int,
    frequency: str,
) -> str | None:
    if isinstance(value, datetime):
        parsed = value.date()
    elif isinstance(value, date):
        parsed = value
    elif isinstance(value, str):
        try:
            parsed = date.fromisoformat(value.strip()[:10])
        except ValueError:
            return None
    else:
        return None

    if parsed.year != year:
        return None
    if frequency == "monthly":
        return parsed.strftime("%Y-%m")
    if frequency == "quarterly":
        return f"{year:04d}-Q{((parsed.month - 1) // 3) + 1}"
    if frequency == "annual":
        return str(year)
    return None


def period_for_activity(
    activity: dict[str, Any],
    year: int,
    frequency: str,
) -> str | None:
    provenance = activity.get("activity_date_provenance")
    if provenance not in TRUSTED_DATE_PROVENANCE:
        return None

    if provenance == "explicit_reporting_period":
        return _period_from_explicit_reporting_period(
            activity.get("reporting_period"),
            year,
            frequency,
        )

    return _period_from_activity_date(activity.get("activity_date"), year, frequency)


def build_completeness(
    *,
    year: int,
    rules: list[CollectionRule],
    activities: list[dict[str, Any]],
    locations: list[dict[str, Any]],
    applicability: list[dict[str, Any]],
    activity_categories: dict[str, str],
) -> dict[str, Any]:
    location_ids = {
        str(location["id"])
        for location in locations
        if location.get("id") is not None
    }
    configured_applicability = {
        (str(row.get("activity_type")), str(row.get("company_location_id"))): row.get(
            "is_applicable"
        )
        for row in applicability
    }

    completed_periods: set[tuple[str, str, str]] = set()
    unattributed_records = 0
    invalid_location_records = 0

    rule_by_activity = {rule.activity_type: rule for rule in rules}
    for activity in activities:
        activity_type = str(activity.get("activity_type") or "")
        category = activity_categories.get(activity_type)
        rule = rule_by_activity.get(category or "")
        if not rule:
            continue
        if activity.get("quantity") is None and activity.get("spend_amount") is None:
            continue

        period = period_for_activity(activity, year, rule.frequency)
        if period is None:
            continue

        location_id = activity.get("company_location_id")
        if location_id is None:
            unattributed_records += 1
            continue
        location_id = str(location_id)
        if location_id not in location_ids:
            invalid_location_records += 1
            continue
        if configured_applicability.get((rule.activity_type, location_id)) is not True:
            continue

        completed_periods.add((rule.activity_type, location_id, period))

    activity_results: list[dict[str, Any]] = []
    total_expected = 0
    total_completed = 0
    any_unconfigured = False

    for rule in rules:
        if not rule.is_required:
            continue

        missing_configuration = (
            1 if not location_ids else
            sum(
                (rule.activity_type, location_id) not in configured_applicability
                for location_id in location_ids
            )
        )
        if missing_configuration:
            any_unconfigured = True
            activity_results.append({
                "activity_type": rule.activity_type,
                "display_name": rule.display_name,
                "frequency": rule.frequency,
                "status": "unavailable",
                "completion": None,
                "expected_units": 0,
                "completed_units": 0,
                "missing_applicability_count": missing_configuration,
            })
            continue

        applicable_locations = [
            location_id
            for location_id in location_ids
            if configured_applicability[(rule.activity_type, location_id)] is True
        ]
        periods = expected_periods(year, rule.frequency)
        expected_units = [
            CollectionUnit(
                rule.activity_type,
                location_id,
                period,
                (rule.activity_type, location_id, period) in completed_periods,
                None,
            )
            for location_id in applicable_locations
            for period in periods
        ]
        completed_units = sum(unit.completed for unit in expected_units)
        completion = (
            completed_units / len(expected_units) * 100
            if expected_units
            else None
        )
        status = (
            "not_applicable" if completion is None else
            "complete" if completion == 100 else
            "in_progress" if completion > 0 else
            "missing"
        )

        activity_results.append({
            "activity_type": rule.activity_type,
            "display_name": rule.display_name,
            "frequency": rule.frequency,
            "status": status,
            "completion": completion,
            "expected_units": len(expected_units),
            "completed_units": completed_units,
            "missing_applicability_count": 0,
        })
        total_expected += len(expected_units)
        total_completed += completed_units

    if any_unconfigured:
        overall_status = "unavailable"
        overall_completion = None
    elif total_expected == 0:
        overall_status = "not_applicable"
        overall_completion = None
    else:
        overall_completion = total_completed / total_expected * 100
        overall_status = "complete" if overall_completion == 100 else (
            "in_progress" if overall_completion > 0 else "missing"
        )

    return {
        "year": year,
        "status": overall_status,
        "completion": overall_completion,
        "expected_units": total_expected,
        "completed_units": total_completed,
        "activities": activity_results,
        "unattributed_records_excluded": unattributed_records,
        "invalid_location_records_excluded": invalid_location_records,
    }


def get_location_applicability(
    supabase: Any,
    organization_id: str,
) -> dict[str, Any]:
    locations_response = (
        supabase.table("company_locations")
        .select("id, location_name")
        .eq("organization_id", organization_id)
        .order("location_name")
        .execute()
    )
    applicability_response = (
        supabase.table("location_activity_applicability")
        .select("activity_type, company_location_id, is_applicable")
        .eq("organization_id", organization_id)
        .execute()
    )
    return {
        "locations": locations_response.data or [],
        "applicability": applicability_response.data or [],
    }


def save_location_applicability(
    supabase: Any,
    organization_id: str,
    settings: list[dict[str, Any]],
) -> None:
    locations_response = (
        supabase.table("company_locations")
        .select("id")
        .eq("organization_id", organization_id)
        .execute()
    )
    location_ids = {
        str(row.get("id"))
        for row in (locations_response.data or [])
    }

    rules_response = (
        supabase.table("collection_activity_rules")
        .select("activity_type, collection_category")
        .execute()
    )
    canonical_types = {
        row["activity_type"]
        for row in (rules_response.data or [])
        if row.get("activity_type")
        and row.get("activity_type") == row.get("collection_category")
    }

    for item in settings:
        activity_type = item["activity_type"]
        location_id = str(item["company_location_id"])
        if activity_type not in canonical_types:
            raise ValueError(f"Unsupported collection activity: {activity_type}")
        if location_id not in location_ids:
            raise ValueError("Location does not belong to this organization")

    upserts = [
        {
            "organization_id": organization_id,
            "company_location_id": str(item["company_location_id"]),
            "activity_type": item["activity_type"],
            "is_applicable": item["is_applicable"],
        }
        for item in settings
        if item["is_applicable"] is not None
    ]
    if upserts:
        supabase.table("location_activity_applicability").upsert(
            upserts,
            on_conflict="organization_id,company_location_id,activity_type",
        ).execute()

    for item in settings:
        if item["is_applicable"] is None:
            (
                supabase.table("location_activity_applicability")
                .delete()
                .eq("organization_id", organization_id)
                .eq("company_location_id", str(item["company_location_id"]))
                .eq("activity_type", item["activity_type"])
                .execute()
            )


def get_collection_completeness(
    supabase: Any,
    organization_id: str,
    year: int,
) -> dict[str, Any]:
    rules_response = (
        supabase.table("collection_activity_rules")
        .select(
            "activity_type, display_name, default_required, default_frequency, collection_category"
        )
        .execute()
    )
    all_rules = rules_response.data or []
    activity_categories = {
        str(row["activity_type"]): str(row["collection_category"])
        for row in all_rules
        if row.get("activity_type") and row.get("collection_category")
    }
    rules_by_type = {
        str(row["activity_type"]): row
        for row in all_rules
        if row.get("activity_type") == row.get("collection_category")
    }

    overrides_response = (
        supabase.table("organisation_activity_settings")
        .select("activity_type, is_required, frequency")
        .eq("organization_id", organization_id)
        .execute()
    )
    overrides = {
        str(row["activity_type"]): row
        for row in (overrides_response.data or [])
        if row.get("activity_type")
    }

    rules: list[CollectionRule] = []
    for activity_type, row in rules_by_type.items():
        override = overrides.get(activity_type, {})
        required = override.get("is_required")
        if required is None:
            required = row.get("default_required", False)
        frequency = override.get("frequency") or row.get("default_frequency")
        if frequency not in {"monthly", "quarterly", "annual"}:
            raise ValueError(f"Unsupported frequency for {activity_type}: {frequency}")
        rules.append(CollectionRule(
            activity_type=activity_type,
            display_name=str(row.get("display_name") or activity_type),
            frequency=frequency,
            is_required=bool(required),
        ))

    config = get_location_applicability(supabase, organization_id)
    activities: list[dict[str, Any]] = []
    required_categories = {
        rule.activity_type for rule in rules if rule.is_required
    }
    source_activity_types = [
        activity_type
        for activity_type, category in activity_categories.items()
        if category in required_categories
    ]
    untrusted_date_records = 0
    if source_activity_types:
        untrusted_response = (
            supabase.table("company_activities")
            .select("id", count="exact", head=True)
            .eq("organization_id", organization_id)
            .in_("activity_type", source_activity_types)
            .eq("activity_date_provenance", "unknown")
            .execute()
        )
        if untrusted_response.count is None:
            raise RuntimeError("Could not count records with unverified date provenance")
        untrusted_date_records = untrusted_response.count

        offset = 0
        page_size = 1000
        while True:
            response = (
                supabase.table("company_activities")
                .select(
                    "id, activity_type, company_location_id, activity_date, "
                    "activity_date_provenance, reporting_period, quantity, spend_amount"
                )
                .eq("organization_id", organization_id)
                .in_("activity_type", source_activity_types)
                .in_("activity_date_provenance", sorted(TRUSTED_DATE_PROVENANCE))
                .order("id")
                .range(offset, offset + page_size - 1)
                .execute()
            )
            page = response.data or []
            activities.extend(page)
            if len(page) < page_size:
                break
            offset += page_size

    result = build_completeness(
        year=year,
        rules=rules,
        activities=activities,
        locations=config["locations"],
        applicability=config["applicability"],
        activity_categories=activity_categories,
    )
    result["organization_id"] = organization_id
    result["unverified_date_records_excluded"] = untrusted_date_records
    return result
