import asyncio
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.metrics import router as metrics_router
from app.api.preflight import router as preflight_router
from app.api.routes import router
from app.workers.polling import polling_worker


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

# Keep Stackmint logs visible without flooding the terminal with transport noise.
for noisy_logger in ("httpx", "httpcore", "postgrest"):
    logging.getLogger(noisy_logger).setLevel(logging.WARNING)

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
app.include_router(preflight_router)
# ---------- endpoint: create a location (admin only) ----------

