import time
import asyncio
import logging
import httpx
from app.db.uploads import (
    get_pending_upload,
)
from app.parsing.pipeline import run_parsing_pipeline


logger = logging.getLogger(__name__)
MAX_TRANSIENT_BACKOFF_SECONDS = 30.0


def _next_backoff_seconds(base_interval_seconds: float, transient_failures: int) -> float:
    backoff_multiplier = min(2 ** max(transient_failures - 1, 0), 16)
    return min(base_interval_seconds * backoff_multiplier, MAX_TRANSIENT_BACKOFF_SECONDS)


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
            result = run_parsing_pipeline(upload)
            logger.info("[Polling] Processed upload %s: %s", upload_id, result)

        except Exception as e:
            logger.exception("[Polling] Worker iteration failed: %s", str(e))

        time.sleep(interval_seconds)


async def polling_worker(interval_seconds: int = 5):
    """
    Backward-compatible single-worker entrypoint.
    """
    await start_worker_pool(concurrency=1, interval_seconds=interval_seconds)


async def _worker_loop(worker_id: int, interval_seconds: float) -> None:
    transient_failures = 0

    while True:
        delay_seconds = interval_seconds

        try:
            upload = await asyncio.to_thread(get_pending_upload)

            if not upload:
                transient_failures = 0
                await asyncio.sleep(delay_seconds)
                continue

            upload_id = upload["id"]
            logger.info(
                "[Polling/%s] Starting upload id=%s file=%s storage_path=%s activity_type=%s",
                worker_id,
                upload_id,
                upload.get("file_name"),
                upload.get("storage_path"),
                upload.get("activity_type"),
            )
            result = await asyncio.to_thread(run_parsing_pipeline, upload)
            logger.info("[Polling/%s] Processed upload %s: %s", worker_id, upload_id, result)
            transient_failures = 0
        except httpx.RemoteProtocolError as e:
            transient_failures += 1
            delay_seconds = _next_backoff_seconds(interval_seconds, transient_failures)
            logger.warning(
                "[Polling/%s] Transient transport disconnect while polling: %s. Retrying in %.1fs...",
                worker_id,
                str(e),
                delay_seconds,
            )
        except httpx.HTTPError as e:
            transient_failures += 1
            delay_seconds = _next_backoff_seconds(interval_seconds, transient_failures)
            logger.warning(
                "[Polling/%s] Transient HTTP error while polling: %s. Retrying in %.1fs...",
                worker_id,
                str(e),
                delay_seconds,
            )
        except Exception as e:
            logger.exception("[Polling/%s] Worker iteration failed: %s", worker_id, str(e))
            transient_failures = 0

        await asyncio.sleep(delay_seconds)


async def start_worker_pool(concurrency: int = 2, interval_seconds: float = 2.0):
    if concurrency < 1:
        raise ValueError("concurrency must be >= 1")

    logger.info(
        "[Polling] Starting worker pool with concurrency=%s interval_seconds=%s",
        concurrency,
        interval_seconds,
    )

    tasks = [
        asyncio.create_task(_worker_loop(worker_id=i + 1, interval_seconds=interval_seconds))
        for i in range(concurrency)
    ]
    await asyncio.gather(*tasks)