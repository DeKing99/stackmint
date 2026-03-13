import time
import asyncio
from db.uploads import (
    get_pending_upload,
    mark_as_processing
)
from parsing.pipeline import run_parsing_pipeline


def start_polling(interval_seconds=5):

    while True:

        upload = get_pending_upload()

        if not upload:
            time.sleep(interval_seconds)
            continue

        upload_id = upload["id"]

        try:
            mark_as_processing(upload_id)
            result = run_parsing_pipeline(upload)
            print("Processed:", result)

        except Exception as e:
            print("Failed:", e)

        time.sleep(interval_seconds)


async def polling_worker(interval_seconds: int = 5):
    while True:
        upload = await asyncio.to_thread(get_pending_upload)

        if not upload:
            await asyncio.sleep(interval_seconds)
            continue

        upload_id = upload["id"]

        try:
            await asyncio.to_thread(mark_as_processing, upload_id)
            result = await asyncio.to_thread(run_parsing_pipeline, upload)
            print("Processed:", result)
        except Exception as e:
            print("Failed:", e)

        await asyncio.sleep(interval_seconds)