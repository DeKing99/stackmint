from app.db.activities import _to_activity_insert_row
from app.parsing.emissions import calculate_emissions_for_row


def test_activity_payload_includes_enterprise_dimensions_and_reporting_period():
    payload = _to_activity_insert_row(
        {
            "organization_id": "11111111-1111-1111-1111-111111111111",
            "upload_id": "upload-001",
            "date": "2025-03-15",
            "activity_type": "purchased_electricity",
            "consumption": 1200,
            "unit": "kwh",
            "company_location_id": "loc-1",
            "department_id": "dept-1",
            "supplier_id": "sup-1",
            "invoice_reference": "INV-2025-003",
            "verification_status": "verified",
            "data_quality_score": "0.97",
            "calculation_method": "activity_based",
            "metadata": {"source": "invoice"},
        }
    )

    assert payload["company_department_id"] == "dept-1"
    assert payload["company_supplier_id"] == "sup-1"
    assert payload["reporting_period_start"] == "2025-03-01"
    assert payload["reporting_period_end"] == "2025-03-31"
    assert payload["metadata"] == {"source": "invoice"}


def test_emissions_payload_includes_dimension_and_reporting_fields(monkeypatch):
    monkeypatch.setattr(
        "app.parsing.emissions._fetch_emission_factor",
        lambda **kwargs: ({"id": "factor-1", "factor_value": 0.4}, ["attempt"]),
    )

    payload = calculate_emissions_for_row(
        supabase=object(),  # not used by patched factor resolver
        row={
            "date": "2025-04-09",
            "activity_type": "purchased_electricity",
            "consumption": 100,
            "unit": "kwh",
            "department_id": "dept-1",
            "supplier_id": "sup-1",
            "calculation_confidence": "0.91",
            "metadata": {"lineage": "etl"},
        },
        activity_id="act-1",
        inserted_activity={
            "organization_id": "org-1",
            "company_location_id": "loc-1",
        },
    )

    assert payload["reporting_period_start"] == "2025-04-01"
    assert payload["reporting_period_end"] == "2025-04-30"
    assert payload["organization_id"] == "org-1"
    assert payload["company_location_id"] == "loc-1"
    assert payload["company_department_id"] == "dept-1"
    assert payload["company_supplier_id"] == "sup-1"
    assert payload["calculation_confidence"] == 0.91
