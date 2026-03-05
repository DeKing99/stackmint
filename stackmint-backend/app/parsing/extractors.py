# parsing/extractors.py

import pandas as pd
from pathlib import Path

from typing import List, Dict, Any


    
    
def extract_rows(upload: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Convert uploaded file into list of dict rows.
    Assumes upload contains 'file_path'.
    """

    file_path = upload.get("file_path")
    if not file_path:
        raise ValueError("Upload missing file_path")

    path = Path(file_path)

    if not path.exists():
        raise FileNotFoundError(f"{file_path} not found")

    if path.suffix.lower() == ".csv":
        df = pd.read_csv(path)

    elif path.suffix.lower() in [".xlsx", ".xls"]:
        df = pd.read_excel(path)

    else:
        raise ValueError("Unsupported file type")

    return df.to_dict(orient="records") #type: ignore