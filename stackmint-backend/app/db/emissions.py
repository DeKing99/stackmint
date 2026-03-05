# db/emissions.py

from db.client import supabase
from typing import List, Dict


def insert_emissions(rows: List[Dict]):

    if not rows:
        return

    supabase.table("company_emissions").insert(rows).execute()


def get_emission_factor(activity_type: str, energy_type: str):

    response = (
        supabase.table("emissions_factors")
        .select("*")
        .eq("activity_type", activity_type)
        .eq("energy_type", energy_type)
        .limit(1)
        .execute()
    )

    return response.data[0] if response.data else None