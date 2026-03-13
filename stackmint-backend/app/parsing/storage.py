import os
import tempfile
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

from db.client import supabase


def resolve_upload_file_path(upload: Dict[str, Any]) -> Tuple[str, Optional[str]]:
    """
    Resolve a local file path for parsing.

    Returns:
    - local path to parse
    - temp file path to clean up later (or None)
    """

    file_path_raw = upload.get("file_path")
    if isinstance(file_path_raw, str) and file_path_raw.strip():
        file_path = file_path_raw.strip()
        if Path(file_path).exists():
            return file_path, None

    storage_path_raw = upload.get("storage_path")
    if isinstance(storage_path_raw, str) and storage_path_raw.strip():
        storage_path = storage_path_raw.strip()
        bucket = upload.get("storage_bucket") or os.getenv("SUPABASE_UPLOAD_BUCKET", "esg-data-2")

        data = supabase.storage.from_(str(bucket)).download(storage_path)
        suffix = Path(storage_path).suffix

        fd, tmp_path = tempfile.mkstemp(prefix="stackmint_upload_", suffix=suffix)
        with os.fdopen(fd, "wb") as tmp_file:
            tmp_file.write(data)

        return tmp_path, tmp_path

    raise FileNotFoundError("Upload is missing a usable local file_path or storage_path")