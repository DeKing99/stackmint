from supabase import create_client
import pandas as pd
import os

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

df = pd.read_excel(
    "ghg-conversion-factors-2025-flat-format.xlsx",
    sheet_name="Factors by Category",
    skiprows=5
)

for _, row in df.iterrows():

    data = {
        "gov_factor_id": row.get("ID"),
        "unit": row.get("Unit"),
        "factor": row.get("GHG Conversion Factor 2025"),
        "co2": row.get("CO2"),
        "ch4": row.get("CH4"),
        "n2o": row.get("N2O"),
    }

    supabase.table("emission_factors").insert(data).execute()

print("Import complete")