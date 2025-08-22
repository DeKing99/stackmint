# environmental.py

import pandas as pd
import numpy as np
from app.schemas.environmental_schema import EnvironmentalInsights
from typing import List
from openai import OpenAI
from app.core.config import settings

openai_key = settings.OPENAI_KEY

client = OpenAI(api_key=openai_key)


ENV_CATEGORIES = {
    "energy": ["energy", "electricity", "fuel", "kwh"],
    "emissions": ["emission", "co2", "carbon", "ghg", "ch4", "n2o"],
    "waste": ["waste", "landfill", "recycled", "incinerated", "hazardous"],
    "water_usage": ["water", "h2o", "water use", "water consumption"]
}

def find_matching_columns(df: pd.DataFrame, keywords: List[str]) -> List[str]:
    matched = []
    for col in df.columns:
        lower_col = col.lower()
        for kw in keywords:
            if kw in lower_col:
                matched.append(col)
                break
    return matched

def analyze_environmental_data(records: List[dict]) -> EnvironmentalInsights:
    df = pd.DataFrame(records)
    df.replace([np.nan, np.inf, -np.inf], None, inplace=True)

    insights = EnvironmentalInsights()
    insights.file_count = 1
    insights.record_count = len(df)

    for category, keywords in ENV_CATEGORIES.items():
        matched_cols = find_matching_columns(df, keywords)
        cat_df = df[matched_cols].select_dtypes(include='number') if matched_cols else pd.DataFrame()

        if category == "energy":
            insights.partial_analysis.energy.matched_columns = matched_cols
            insights.partial_analysis.energy.total = cat_df.sum(numeric_only=True).to_dict()
            insights.partial_analysis.energy.average = cat_df.mean(numeric_only=True).to_dict()
            total_energy = sum(val for val in insights.partial_analysis.energy.total.values() if val)
            insights.partial_analysis.energy.total_energy_kwh = round(total_energy, 2) if total_energy else None

        elif category == "emissions":
            insights.partial_analysis.emissions.matched_columns = matched_cols
            insights.partial_analysis.emissions.total = cat_df.sum(numeric_only=True).to_dict()
            insights.partial_analysis.emissions.average = cat_df.mean(numeric_only=True).to_dict()
            total_emissions = sum(val for val in insights.partial_analysis.emissions.total.values() if val)
            insights.partial_analysis.emissions.total_emissions_kg = round(total_emissions, 2) if total_emissions else None
            # Scopes left blank for now; AI will infer later

        elif category == "water_usage":
            insights.partial_analysis.water_usage.matched_columns = matched_cols
            insights.partial_analysis.water_usage.total_liters = round(cat_df.sum(numeric_only=True).sum(), 2) if not cat_df.empty else None

        elif category == "waste":
            insights.partial_analysis.waste.matched_columns = matched_cols
            total_waste = cat_df.sum(numeric_only=True).sum() if not cat_df.empty else None
            insights.partial_analysis.waste.total_waste_kg = round(total_waste, 2) if total_waste else None

            hazardous_cols = [c for c in matched_cols if "hazardous" in c.lower()]
            recycled_cols = [c for c in matched_cols if "recycled" in c.lower()]

            if hazardous_cols:
                hazardous_sum = df[hazardous_cols].sum(numeric_only=True).sum()
                insights.partial_analysis.waste.hazardous_waste_kg = round(hazardous_sum, 2) if hazardous_sum else None

            if recycled_cols:
                recycled_sum = df[recycled_cols].sum(numeric_only=True).sum()
                insights.partial_analysis.waste.recycled_waste_kg = round(recycled_sum, 2) if recycled_sum else None

    # AI Placeholder
    system_prompt = """
You are a sustainability and ESG data analyst AI.

Your job is to fill in missing environmental KPIs in a structured Python dictionary 
called `insights`, based on the uploaded raw environmental dataset provided to you.

You MUST only modify or fill in fields that are either:
1. Completely missing or set to None/null.
2. Clearly wrong based on the data.

You MUST NOT change or overwrite fields that are already correctly filled in.

Return only a completed version of the `insights` dictionary.
Do not include any extra explanation — only valid JSON that matches the required schema.
    """
    # You can call your AI function here and pass
    user_prompt = f"""
The user has provided a partial insights dictionary and the full raw environmental dataset.

Here is the partially filled insights dictionary (in JSON format):
{insights.model_dump_json(indent=2)}


Here is the raw data as a list of records (from a Pandas DataFrame):
{df}  # Limit to first 100 rows for token safety

Your task: 
Complete the insights dictionary, filling only the missing or None fields using the dataset.

Ensure your output strictly matches the schema used in the input.
Return only the updated dictionary, in valid JSON format.
    """
    #note for future self tomorrow you need to make the call to open ai use responses and parse use text_format
    response = client.responses.parse(
        model="gpt-4o-mini",  # or your preferred model
        input=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        text_format=EnvironmentalInsights,
    )
    print(response)
    partial_insight = response.output_parsed
    insights = partial_insight if partial_insight else insights
    return insights
