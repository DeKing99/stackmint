from __future__ import annotations

import hashlib
import hmac
import time
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException, Query, Request
from pydantic import BaseModel, Field

from app.core.config import settings
from app.db.client import supabase
from app.services.collection.completeness import (
    get_collection_completeness,
    get_location_applicability,
    save_location_applicability,
)

router = APIRouter(prefix="/collection", tags=["collection"])


class ApplicabilitySetting(BaseModel):
    activity_type: str = Field(min_length=1, max_length=100)
    company_location_id: UUID
    is_applicable: bool | None


class ApplicabilityUpdate(BaseModel):
    settings: list[ApplicabilitySetting] = Field(max_length=1000)


async def _verify_internal_request(
    request: Request,
    organization_id: UUID,
    year: int | None,
    timestamp: Annotated[str | None, Header(alias="X-Collection-Timestamp")],
    signature: Annotated[str | None, Header(alias="X-Collection-Signature")],
) -> None:
    if not timestamp or not signature:
        raise HTTPException(status_code=401, detail="Invalid internal request.")
    try:
        timestamp_value = int(timestamp)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Invalid internal request.") from exc
    if abs(int(time.time()) - timestamp_value) > 300:
        raise HTTPException(status_code=401, detail="Expired internal request.")

    body_hash = hashlib.sha256(await request.body()).hexdigest()
    message = "\n".join(
        [
            timestamp,
            request.method.upper(),
            request.url.path,
            str(organization_id),
            str(year) if year is not None else "",
            body_hash,
        ]
    )
    expected = hmac.new(
        settings.SUPABASE_SECRET_KEY.encode(),
        message.encode(),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise HTTPException(status_code=401, detail="Invalid internal request.")


@router.get("/completeness")
async def collection_completeness(
    request: Request,
    organization_id: UUID = Query(...),
    year: int = Query(..., ge=1900, le=2100),
    x_collection_timestamp: Annotated[
        str | None, Header(alias="X-Collection-Timestamp")
    ] = None,
    x_collection_signature: Annotated[
        str | None, Header(alias="X-Collection-Signature")
    ] = None,
):
    await _verify_internal_request(
        request,
        organization_id,
        year,
        x_collection_timestamp,
        x_collection_signature,
    )
    return get_collection_completeness(supabase, str(organization_id), year)


@router.get("/applicability")
async def read_location_applicability(
    request: Request,
    organization_id: UUID = Query(...),
    x_collection_timestamp: Annotated[
        str | None, Header(alias="X-Collection-Timestamp")
    ] = None,
    x_collection_signature: Annotated[
        str | None, Header(alias="X-Collection-Signature")
    ] = None,
):
    await _verify_internal_request(
        request,
        organization_id,
        None,
        x_collection_timestamp,
        x_collection_signature,
    )
    return get_location_applicability(supabase, str(organization_id))


@router.put("/applicability")
async def write_location_applicability(
    update: ApplicabilityUpdate,
    request: Request,
    organization_id: UUID = Query(...),
    x_collection_timestamp: Annotated[
        str | None, Header(alias="X-Collection-Timestamp")
    ] = None,
    x_collection_signature: Annotated[
        str | None, Header(alias="X-Collection-Signature")
    ] = None,
):
    await _verify_internal_request(
        request,
        organization_id,
        None,
        x_collection_timestamp,
        x_collection_signature,
    )
    save_location_applicability(
        supabase,
        str(organization_id),
        [item.model_dump(mode="json") for item in update.settings],
    )
    return {"saved": len(update.settings)}
