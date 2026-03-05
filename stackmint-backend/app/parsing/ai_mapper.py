# parsing/ai_mapper.py

import requests
from typing import List, Dict


def ai_map_columns(raw_rows: List[Dict], activity_type: str) -> List[Dict]:
    """
    Ask AI to map arbitrary columns to strict schema.
    """

    response = requests.post(
        "https://your-runpod-endpoint/v1/map",
        json={
            "activity_type": activity_type,
            "rows_sample": raw_rows[:20]  # send only sample
        },
        timeout=60
    )

    if response.status_code != 200:
        raise Exception("AI mapping failed")

    mapped = response.json()

    if "rows" not in mapped:
        raise Exception("Invalid AI mapping response")

    return mapped["rows"]