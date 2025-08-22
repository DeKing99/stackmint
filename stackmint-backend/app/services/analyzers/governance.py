# services/analyzers/governance.py

import pandas as pd
import numpy as np
from typing import List
from openai import OpenAI
from app.core.config import settings
from app.schemas.secr_schema import SecrSchema  # Your Pydantic model
#from fastapi.responses import JSONResponse

openai_key = settings.OPENAI_KEY
client = OpenAI(api_key=openai_key)


def analyze_environmental_data(records: List[dict]) -> SecrSchema:
    # Convert input to DataFrame & sanitize
    df = pd.DataFrame(records)
    df.replace([np.nan, np.inf, -np.inf], None, inplace=True)
    summary = {
            "rows": df.shape[0],
            "columns": df.shape[1],
            "column_names": df.columns.tolist(),
        }

    # Instantiate empty insights schema
    insights = SecrSchema()

    # System prompt — rules for extraction
    system_prompt = f"""
You are a carbon accounting & SECR (Streamlined Energy and Carbon Reporting) data extraction AI.

Your task: parse raw company reports, spreadsheets, or tables and populate a structured SECR dataset.

Your output MUST strictly conform to this JSON schema:
{SecrSchema.model_json_schema()}

Rules for extraction:
- Extract values from the provided raw text/tables and map them to the correct fields in the schema.
- Perform safe numeric operations only when explicitly supported:
  • Use sums for flow metrics (energy_kwh, fuel_litres, emissions, waste_tonnes, water_m3).
  • Use averages when explicitly stated, or for stock values like "average employees".
  • Compute intensity ratios if both numerator & denominator exist (e.g., emissions per employee).
- Normalize all units to schema’s base units:
  (kWh, tCO2e, litres, km, tonnes, m3, GBP).
- Only convert units if the conversion factor is explicitly present in the data. Do not assume external factors.
- Never invent emission factors or unverifiable data.
- If multiple conflicting values exist:
  1. Prefer explicit tables.
  2. Then final verified totals in the report.
  3. Then values that match the reporting period.
- Only fill null fields. Do not overwrite prefilled values unless there is stronger evidence.
- If unsure or data is missing, leave the field as null.

You must return a **single valid JSON object** that exactly matches the schema.
"""


    # User prompt — give current state and raw data
    user_prompt = f"""
You are given the current SECR dataset, raw extracted text/tables, and column summaries.

Current dataset (JSON, may contain nulls):
{insights.model_dump_json(indent=2)}

Raw extracted info and tables (sampled):
{df.head(100)}

Available column names:
{summary}

Task: Fill in missing fields in the SECR dataset using the provided raw data. 
Return only a valid JSON object matching the schema.
"""



    # Call GPT with structured parsing
    response = client.responses.parse(
        model="gpt-4o-mini",
        input=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        text_format=SecrSchema,  # parse directly to your Pydantic model
    )

    # Extract parsed object from GPT output
    partial_insight = response.output_parsed 
    if partial_insight is not None:
        return partial_insight
    else:
        return insights

