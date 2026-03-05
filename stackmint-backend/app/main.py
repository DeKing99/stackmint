from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pytz import UTC
from app.api.routes import router
from app.api.metrics import router as metrics_router  # adjust path if needed
import asyncio
from workers.polling import polling_worker

from fastapi import FastAPI, Request, HTTPException, Body
from pydantic import BaseModel, EmailStr
from supabase import create_client

app = FastAPI()

origins = [
    "https://glowing-parakeet-7jqvjqg9xvpcpg5-3000.app.github.dev",  # your frontend
    "http://localhost:3000",  # optional, if testing locally
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,  # can also use ["*"] for testing (any origin)
    allow_credentials=True,
    allow_methods=["*"],  # GET, POST, etc.
    allow_headers=["*"],  # any headers
)
# main.py 

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(polling_worker())


@app.get("/")
def read_root():
    return {"message": "Hello from Stackmint backend"}

app.include_router(router)
app.include_router(metrics_router)
# ---------- endpoint: create a location (admin only) ----------

