# db/mappings.py

from db.client import supabase


def get_upload_mapping(upload_id: str):

    response = (
        supabase.table("company_upload_mappings")
        .select("*")
        .eq("upload_id", upload_id)
        .limit(1)
        .execute()
    )

    return response.data[0] if response.data else None