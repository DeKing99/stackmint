from fastapi import APIRouter, HTTPException
from supabase import create_client, Client
from app.services.analyzers import financial, environmental  # make sure your analysis modules are imported
from app.core.config import settings
router = APIRouter()

# Setup Supabase
  # assumes you're using a centralized supabase client setup
url = settings.SUPABASE_URL
key = settings.SUPABASE_SECRET_KEY
# Create Supabase client

supabase: Client = create_client(url, key)
# A mapping of category to its analyzer function
ANALYZERS = {
    "financial": financial.analyze_financial_data,
    "environmental": environmental.analyze_environmental_data,
    # Add more as you build them
}

@router.get("/metrics")
def get_metrics(category: str):
    if category not in ANALYZERS:
        raise HTTPException(status_code=400, detail=f"Unknown category: {category}")

    # Fetch all rows of that category
    rows = (
        supabase.table("processed_esg_files")
        .select("*")
        .eq("category", category)
        .execute()
        .data
    )

    # Combine all the records from the files
    all_data = []
    for row in rows:
        all_data.extend(row.get("data_records", []))

    # Run the analysis
    analyzer = ANALYZERS[category]
    result = analyzer(all_data)
#note that in the future pass this through ai again to fill in any missing fields and get some summaries
    return {
        "category": category,
        "file_count": len(rows),
        "record_count": len(all_data),
        "aggregated_analysis": result,
    }
