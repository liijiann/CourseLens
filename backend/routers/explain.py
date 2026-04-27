import asyncio
from collections.abc import AsyncGenerator

from fastapi import APIRouter, Header, HTTPException, Query

from services import ai_service, session_service
from utils.sse import sse, sse_response

router = APIRouter(prefix='/api', tags=['explain'])


@router.get('/explain/{session_id}/{page_number}')
async def explain_page(
    session_id: str,
    page_number: int,
    force: bool = Query(default=False),
    with_context: bool = Query(default=False),
    x_api_key: str | None = Header(default=None),
):
    try:
        meta = session_service.get_session_meta(session_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail='Session 不存在') from exc

    try:
        page = session_service.get_page(session_id, page_number)
    except IndexError as exc:
        raise HTTPException(status_code=404, detail='页码不存在') from exc

    # 非强制模式：有缓存直接返回
    if not force and page['status'] == 'done' and page.get('explanation'):
        async def replay_cached() -> AsyncGenerator[str, None]:
            yield sse({'type': 'chunk', 'content': page['explanation']})
            yield sse({'type': 'done', 'content': ''})
        return sse_response(replay_cached())

    # 强制模式：重置状态
    if force:
        def reset_page(page_entry: dict) -> None:
            page_entry['status'] = 'pending'
            page_entry['explanation'] = ''
            page_entry['lastError'] = ''
        session_service.mutate_page(session_id, page_number, reset_page)

    def mark_streaming(page_entry: dict) -> tuple[str, str]:
        if page_entry['status'] == 'streaming':
            if not page_entry.get('explanation'):
                page_entry['status'] = 'pending'
            else:
                return 'busy', ''
        if page_entry['status'] == 'done' and page_entry.get('explanation'):
            return 'cached', page_entry['explanation']
        page_entry['status'] = 'streaming'
        page_entry['lastError'] = ''
        return 'stream', ''

    action, cached_text = session_service.mutate_page(session_id, page_number, mark_streaming)

    if action == 'busy':
        async def busy_stream() -> AsyncGenerator[str, None]:
            yield sse({'type': 'error', 'content': '当前页正在生成中，请稍后重试'})
        return sse_response(busy_stream())

    if action == 'cached':
        async def replay_after_race() -> AsyncGenerator[str, None]:
            yield sse({'type': 'chunk', 'content': cached_text})
            yield sse({'type': 'done', 'content': ''})
        return sse_response(replay_after_race())

    image_path = session_service.get_page_image_path(session_id, page_number)

    # 取上一页图片作为上下文
    prev_image_path = None
    if with_context and page_number > 1:
        try:
            prev_image_path = session_service.get_page_image_path(session_id, page_number - 1)
        except (IndexError, KeyError, FileNotFoundError):
            pass

    async def generate_stream() -> AsyncGenerator[str, None]:
        chunks: list[str] = []
        try:
            model = meta['model']
            async for chunk in ai_service.stream_page_explanation(
                image_path=image_path,
                page_number=page_number,
                total_pages=meta['totalPages'],
                model=model,
                api_key_override=x_api_key or None,
                prev_image_path=prev_image_path,
            ):
                chunks.append(chunk)
                yield sse({'type': 'chunk', 'content': chunk})

            full_text = ''.join(chunks).strip()

            def mark_done(page_entry: dict) -> None:
                page_entry['status'] = 'done'
                page_entry['explanation'] = full_text
                page_entry['lastError'] = ''

            session_service.mutate_page(session_id, page_number, mark_done)
            yield sse({'type': 'done', 'content': ''})
        except asyncio.CancelledError:
            def mark_pending(page_entry: dict) -> None:
                if page_entry.get('status') == 'streaming':
                    page_entry['status'] = 'pending'
                    page_entry['lastError'] = ''
            session_service.mutate_page(session_id, page_number, mark_pending)
            raise
        except Exception as exc:
            def mark_failed(page_entry: dict) -> None:
                page_entry['status'] = 'failed'
                page_entry['lastError'] = str(exc)
            session_service.mutate_page(session_id, page_number, mark_failed)
            yield sse({'type': 'error', 'content': str(exc)})

    return sse_response(generate_stream())
