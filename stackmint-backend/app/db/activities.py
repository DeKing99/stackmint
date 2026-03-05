# db/activities.py

from db.client import supabase
from typing import List, Dict


def insert_activities(rows: List[Dict]):

    if not rows:
        return

    supabase.table("company_activities").insert(rows).execute()