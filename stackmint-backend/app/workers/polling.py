import time
import asyncio
import logging
from app.db.uploads import (
    get_pending_upload,
    mark_as_processing
)
from app.parsing.pipeline import run_parsing_pipeline


logger = logging.getLogger(__name__)


def start_polling(interval_seconds=5):

    while True:
        try:
            upload = get_pending_upload()

            if not upload:
                time.sleep(interval_seconds)
                continue

            upload_id = upload["id"]
            logger.info(
                "[Polling] Starting upload id=%s file=%s storage_path=%s activity_type=%s",
                upload_id,
                upload.get("file_name"),
                upload.get("storage_path"),
                upload.get("activity_type"),
            )
            mark_as_processing(upload_id)
            result = run_parsing_pipeline(upload)
            logger.info("[Polling] Processed upload %s: %s", upload_id, result)

        except Exception as e:
            logger.exception("[Polling] Worker iteration failed: %s", str(e))

        time.sleep(interval_seconds)


async def polling_worker(interval_seconds: int = 5):
    while True:
        try:
            upload = await asyncio.to_thread(get_pending_upload)

            if not upload:
                await asyncio.sleep(interval_seconds)
                continue

            upload_id = upload["id"]
            logger.info(
                "[Polling] Starting upload id=%s file=%s storage_path=%s activity_type=%s",
                upload_id,
                upload.get("file_name"),
                upload.get("storage_path"),
                upload.get("activity_type"),
            )
            await asyncio.to_thread(mark_as_processing, upload_id)
            result = await asyncio.to_thread(run_parsing_pipeline, upload)
            logger.info("[Polling] Processed upload %s: %s", upload_id, result)
        except Exception as e:
            logger.exception("[Polling] Async worker iteration failed: %s", str(e))

        await asyncio.sleep(interval_seconds)