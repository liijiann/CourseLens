import json
from collections.abc import AsyncGenerator
from typing import Any

from fastapi.responses import StreamingResponse

SSE_HEADERS = {'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'}


def sse(payload: dict[str, Any]) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def sse_response(generator: AsyncGenerator[str, None]) -> StreamingResponse:
    return StreamingResponse(
        generator,
        media_type='text/event-stream',
        headers=SSE_HEADERS,
    )
