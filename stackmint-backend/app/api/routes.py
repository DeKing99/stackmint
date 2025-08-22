from fastapi import APIRouter
from pydantic import BaseModel
from supabase import create_client, Client
from app.core.config import settings
import pandas as pd
import io
from fastapi import HTTPException
from app.services.analyzers import governance
import numpy as np
from fastapi.responses import JSONResponse

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

url = settings.SUPABASE_URL
key = settings.SUPABASE_SECRET_KEY
# Create Supabase client

supabase: Client = create_client(url, key)

# Define FastAPI router
router = APIRouter()

@router.get("/sites/{site_id}/aggregate")
def get_site_aggregate(site_id: str):
    result = supabase.table("aggregated_esg_files").select("*").eq("site_id", site_id).execute()
    return result.data[0]["aggregated_json"]

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
            df = pd.read_csv(io.BytesIO(file_bytes))
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
        response = (supabase.table("processed_esg_files").upsert({
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
                compiled_data = aggregate_data(response_aggregated.data[0], analysis_result)
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
