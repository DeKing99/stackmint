# db/mappings.py

from db.client import supabase
from postgrest.exceptions import APIError


def get_upload_mapping(upload: dict | str):
    if isinstance(upload, dict):
        organization_id = upload.get("organization_id")
        activity_type = upload.get("activity_type")
        upload_type = upload.get("file_type") or upload.get("upload_method")

        if organization_id and activity_type:
            try:
                query = (
                    supabase.table("company_upload_mappings")
                    .select("source_column_name, canonical_field_name, original_column, mapped_field")
                    .eq("organization_id", organization_id)
                    .eq("activity_type", activity_type)
                )

                if upload_type:
                    try:
                        query = query.eq("upload_type", upload_type)
                    except APIError:
                        pass

                response = query.execute()
                mappings: dict[str, str] = {}

                for entry in response.data or []:
                    if not isinstance(entry, dict):
                        continue

                    source = entry.get("source_column_name") or entry.get("original_column")
                    target = entry.get("canonical_field_name") or entry.get("mapped_field")

                    if isinstance(source, str) and isinstance(target, str):
                        mappings[source] = target

                if mappings:
                    return {"mappings": mappings}
            except APIError:
                pass

    upload_id = upload if isinstance(upload, str) else str(upload.get("id") or "")

    for key in ("upload_id", "raw_upload_id", "company_raw_upload_id"):
        try:
            response = (
                supabase.table("company_upload_mappings")
                .select("*")
                .eq(key, upload_id)
                .limit(1)
                .execute()
            )
            return response.data[0] if response.data else None
        except APIError:
            continue

    return None