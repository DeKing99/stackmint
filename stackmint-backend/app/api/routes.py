from fastapi import APIRouter, Query
import httpx
from pydantic import BaseModel
from supabase import create_client, Client
from app.core.config import settings
import pandas as pd
import io
from fastapi import HTTPException
from app.services.analyzers import governance
import numpy as np
from fastapi.responses import JSONResponse
from charset_normalizer import from_bytes # pyright: ignore[reportMissingImports]


class Site(BaseModel):
    id: str
    site_name: str
    site_slug: str
    site_location: str
# Define request body schema
class AnalyzeRequest(BaseModel):
    row_id: int
    file_url: str
    category: Site | None = None  # Optional, can be used to specify the type of analysis

class InviteRequest(BaseModel):
    email: str
    role: str  # e.g., "admin", "user"
    locations: list[str]  # List of location IDs the user should have access to
    organization_id: str

url = settings.SUPABASE_URL
key = settings.SUPABASE_SECRET_KEY
# Create Supabase client

supabase: Client = create_client(url, key)
# Define FastAPI router
router = APIRouter()

#CLERK_API_URL = f"https://api.clerk.com/v1/organizations/{organization_id}/invitations"
CLERK_SECRET_KEY = settings.CLERK_SECRET_KEY  # <- use env variable in production


VALID_ROLES = {"org:member", "org:admin", "org:guest"}  # extend if you added custom ones

@router.post("/invite")
async def get_invite_credentials(request: InviteRequest):
    try:
        role = request.role if request.role in VALID_ROLES else "org:member"

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"https://api.clerk.com/v1/organizations/{request.organization_id}/invitations",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {CLERK_SECRET_KEY}"
                },
                json={
                    "email_address": request.email,
                    "role": role,
                    "public_metadata": {
                        "locations": request.locations  # store selectedSites here
                    },
                    "organization_id": request.organization_id,
                    "notify": True
                }
            )

        if response.status_code >= 400:
            raise HTTPException(status_code=response.status_code, detail=response.json())

        return response.json()

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing invitation: {str(e)}")


@router.get("/invitations")
async def list_invitations(organization_id: str = Query(...)):
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"https://api.clerk.com/v1/organizations/{organization_id}/invitations",
                headers={"Authorization": f"Bearer {CLERK_SECRET_KEY}"},
                params={
                    "status": "pending",
                    "order_by": "-created_at",
                    "limit": "50",  # adjust as needed
                },
            )

        if response.status_code >= 400:
            raise HTTPException(status_code=response.status_code, detail=response.json())

        res_json = response.json()
        invitations = res_json.get("data", [])

        # Clerk returns a list of invites

        # resolve site names from Supabase
        enriched = []
        for inv in invitations:
            org_id = inv.get("organization_id")
            loc_ids = inv.get("public_metadata", {}).get("locations", [])

            sites = []
            site_res = None
            if loc_ids and org_id:
                if isinstance(loc_ids, list) and len(loc_ids) > 0:
                    site_res = (
                        supabase.table("construction_sites")
                        .select("id, site_name")
                        .eq("organization_id", org_id)
                        .in_("id", loc_ids)
                        .execute()
                    )
            sites = site_res.data if site_res and hasattr(site_res, "data") else []


            enriched.append({
                "id": inv.get("id"),
                "email_address": inv.get("email_address"),
                "status": inv.get("status"),
                "created_at": inv.get("created_at"),
                "sites": sites,  # resolved site objects
            })
        print(enriched)
        return enriched

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching invitations: {str(e)}")


# -------------------------
# 2. Revoke Invitation
# -------------------------
@router.post("/invitations/{invitation_id}/revoke")
async def revoke_invitation(invitation_id: str, organization_id: str = Query(...)):
    try:
        # Debug print to confirm IDs
        print("Revoking Clerk invite:", invitation_id, organization_id)

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"https://api.clerk.com/v1/organizations/{organization_id}/invitations/{invitation_id}/revoke",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {CLERK_SECRET_KEY}"
                },
                json={"requesting_user_id": None}
            )

        # Debug Clerk’s raw response
        print("Clerk revoke response:", response.status_code, response.text)

        if response.status_code >= 400:
            raise HTTPException(status_code=response.status_code, detail=response.json())

        return response.json()

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error revoking invitation: {str(e)}")




@router.get("/sites/{site_id}/aggregate")
def get_site_aggregate(site_id: str):
    result = supabase.table("aggregated_esg_files").select("*").eq("site_id", site_id).execute()
    return result.data[0]["aggregated_json"] if result.data else {}


@router.post("/analyze")
async def analyze(request: AnalyzeRequest):
    file_url = request.file_url
    file_extension = file_url.lower().split('.')[-1]

    try:
        # 1. Download file from Supabase
        file_response = supabase.storage.from_("esg-data-2").download(file_url)

        file_bytes = file_response
    
        # 2. Route to the correct pandas reader based on file type
        if file_extension == "csv":
            detection = from_bytes(file_bytes).best()
            df = pd.read_csv(io.BytesIO(file_bytes), encoding=detection.encoding, on_bad_lines='skip')
            # df = pd.read_csv(io.BytesIO(file_bytes))
        elif file_extension in ["xlsx", "xls"]:
            df = pd.read_excel(io.BytesIO(file_bytes))
        elif file_extension == "json":
            df = pd.read_json(io.BytesIO(file_bytes))
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported file type: .{file_extension}")


        sanitized_data = df.replace([np.nan, np.inf, -np.inf], None).to_dict(orient="records")
        data_records  = sanitized_data
        # 3. Basic output / processing 
        
        summary = {
            "rows": df.shape[0],
            "columns": df.shape[1],
            "column_names": df.columns.tolist(),
        }

        print("Data summary:", summary)
        # 4. Optional: save processed summary to DB
        response = (supabase.table("processed_esg_files").insert({
            "original_file_id": request.row_id,
            "summary": summary,
            "category": request.category.site_name if request.category else None,
            "data_records": data_records
        }).execute())
        
        #analysis_result = {}
        
        def aggregate_data(existing_data, new_data):
            # Update existing data with new data
            merged = existing_data.copy()

            for key, value in new_data.items():
                if value is None:
                    continue  # skip missing fields

                if isinstance(value, (int, float)):
                    if merged.get(key) is None:
                        merged[key] = value
                    else:
                # if both exist, add them
                        merged[key] += value

                elif isinstance(value, dict):
                    merged[key] = aggregate_data(merged.get(key, {}), value)

                else:
                    # string or categorical values → prefer existing unless it's None
                    if merged.get(key) is None:
                        merged[key] = value

            return merged
        

        # Initialize demo_analysis_result with a default value
        demo_analysis_result = None

        if request.category:
            analysis_result = governance.analyze_environmental_data(data_records)
            print("This is to check i actually get some analyised data back", analysis_result)
            # Save updated analysis back to Supabase
            demo_analysis_result = analysis_result.model_dump()  # Convert Pydantic model to JSON string
            # i think here i need to change the analysis_result into a json before i upload it to the table 
            supabase.table("processed_esg_files").update({
                "analysis": demo_analysis_result
                }).eq("original_file_id", request.row_id).execute()
            response_aggregated = supabase.table("aggregated_esg_files").select("*").eq("site_id", request.category.id).execute()
            if response_aggregated.data:
                compiled_data = aggregate_data(response_aggregated.data[0], demo_analysis_result)
                supabase.table("aggregated_esg_files").update({
                    "aggregated_json": compiled_data
                }).eq("site_id", request.category.id).execute()
            else:
                supabase.table("aggregated_esg_files").insert({
                    "site_id": request.category.id,
                    "aggregated_json": demo_analysis_result
                }).execute()
       
            
        return {
            "status": "success",
            "summary": summary,
            "analysis": demo_analysis_result
        }
        

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")