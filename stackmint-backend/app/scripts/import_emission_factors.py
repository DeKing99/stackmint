from supabase import create_client
from typing import Any
import pandas as pd
import math
import os

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables must be set")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

df = pd.read_excel(
    os.path.join(SCRIPT_DIR, "ghg-conversion-factors-2025-flat-format.xlsx"),
    sheet_name="Factors by Category",
    skiprows=5
)

subset = df[
    [
        "ID",
        "Level 1",
        "Level 2",
        "Level 3",
        "UOM",
        "GHG Conversion Factor 2025",
    ]
].rename(columns={
    "ID": "gov_factor_id",
    "Level 1": "category",
    "Level 2": "subcategory",
    "Level 3": "detail",
    "UOM": "unit",
    "GHG Conversion Factor 2025": "factor_value",
})
subset["co2"] = df["CO2"] if "CO2" in df.columns else None
subset["ch4"] = df["CH4"] if "CH4" in df.columns else None
subset["n2o"] = df["N2O"] if "N2O" in df.columns else None
subset["region"] = "UK"
subset["year"] = 2025
raw = subset.to_dict(orient="records")
records: list[dict[str, Any]] = [
    ##{str(k): (None if isinstance(v, float) and math.isnan(v) else v) for k, v in row.items()}
    {str(k): (None if pd.isna(v) else v) for k, v in row.items()}
    for row in raw
]

# this was originally 500 now its 200 just for safety
chunk_size = 200
for i in range(0, len(records), chunk_size):
    supabase.table("emission_factors").insert(records[i:i + chunk_size]).execute()

print(f"Import complete — {len(records)} rows inserted")