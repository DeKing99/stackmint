# parsing/pdf.py

import requests
from typing import List, Dict


def extract_pdf_with_ai(file_path: str, activity_type: str) -> List[Dict]:
    """
    Send PDF to AI model and receive structured JSON rows.
    """

    # STEP 1: Read file
    with open(file_path, "rb") as f:
        file_bytes = f.read()

    # STEP 2: Call your RunPod / LLM endpoint
    # Replace this with your real inference endpoint

    response = requests.post(
        "https://your-runpod-endpoint/v1/extract",
        files={"file": file_bytes},
        data={
            "activity_type": activity_type,
            "schema_hint": activity_type  # optionally pass schema name
        },
        timeout=120
    )

    if response.status_code != 200:
        raise Exception("AI PDF extraction failed")

    data = response.json()

    if "rows" not in data:
        raise Exception("AI response missing rows")

    return data["rows"]