# db/emissions.py

from db.client import supabase
from typing import List, Dict
from postgrest.exceptions import APIError


def insert_emissions(rows: List[Dict]):

    if not rows:
        return

    canonical_rows = [
        {
            "activity_id": row.get("activity_id"),
            "emission_factor_id": row.get("emission_factor_id"),
            "co2e": row.get("co2e"),
            "calculated_at": row.get("calculated_at"),
        }
        for row in rows
    ]

    try:
        supabase.table("company_emissions").insert(canonical_rows).execute()
        return
    except APIError:
        pass

    envelope_payload = [{"data": row} for row in canonical_rows]

    for candidate in envelope_payload:
        try:
            supabase.table("company_emissions").insert(candidate).execute()
            return
        except APIError:
            continue

    supabase.table("company_emissions").insert(envelope_payload).execute()


def get_emission_factor(
    activity_type: str,
    unit: str,
    region: str | None = None,
    year: int | None = None,
):

    query = (
        supabase.table("emission_factors")
        .select("*")
        .eq("activity_type", activity_type)
        .eq("unit", unit)
    )

    if region:
        query = query.eq("region", region)

    if year is not None:
        query = query.eq("year", year)

    response = query.limit(1).execute()

    return response.data[0] if response.data else None