import asyncio
from collections.abc import AsyncGenerator

from fastapi import APIRouter, Depends, Header, HTTPException, Query

from auth_deps import get_current_user
from db import UserRecord
from services import ai_service, render_service, session_service
from utils.sse import sse, sse_response

router = APIRouter(prefix='/api', tags=['explain'])


@router.get('/explain/{session_id}/{page_number}')
async def explain_page(
    session_id: str,
    page_number: int,
    force: bool = Query(default=False),
    with_context: bool = Query(default=False),
    x_api_key: str | None = Header(default=None),
    current_user: UserRecord = Depends(get_current_user),
):
    user_id = str(current_user['id'])

    try:
        meta = session_service.get_session_meta(user_id, session_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail='会话不存在') from exc

    try:
        page = session_service.get_page(user_id, session_id, page_number)
    except IndexError as exc:
        raise HTTPException(status_code=404, detail='页码不存在') from exc

    if not force and page['status'] == 'done' and page.get('explanation'):
        async def replay_cached() -> AsyncGenerator[str, None]:
            yield sse({'type': 'chunk', 'content': page['explanation']})
            yield sse({'type': 'done', 'content': ''})

        return sse_response(replay_cached())

    if force:
        def reset_page(page_entry: dict) -> None:
            page_entry['status'] = 'pending'
            page_entry['explanation'] = ''
            page_entry['lastError'] = ''

        session_service.mutate_page(user_id, session_id, page_number, reset_page)

    try:
        await render_service.ensure_page_rendered(user_id, session_id, page_number)
        if with_context and page_number > 1:
            try:
                await render_service.ensure_page_rendered(user_id, session_id, page_number - 1)
            except (FileNotFoundError, IndexError):
                pass
        await render_service.schedule_prefetch(
            user_id=user_id,
            session_id=session_id,
            total_pages=meta['totalPages'],
            start_page=1,
        )
    except render_service.StorageQuotaExceeded as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail='会话资源不存在') from exc
    except IndexError as exc:
        raise HTTPException(status_code=404, detail='页码不存在') from exc

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

    action, cached_text = session_service.mutate_page(user_id, session_id, page_number, mark_streaming)

    if action == 'busy':
        async def busy_stream() -> AsyncGenerator[str, None]:
            yield sse({'type': 'error', 'content': '当前页正在生成中，请稍后重试'})

        return sse_response(busy_stream())

    if action == 'cached':
        async def replay_after_race() -> AsyncGenerator[str, None]:
            yield sse({'type': 'chunk', 'content': cached_text})
            yield sse({'type': 'done', 'content': ''})

        return sse_response(replay_after_race())

    image_path = session_service.get_page_image_path(user_id, session_id, page_number)

    prev_image_path = None
    if with_context and page_number > 1:
        try:
            prev_image_path = session_service.get_page_image_path(user_id, session_id, page_number - 1)
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

            session_service.mutate_page(user_id, session_id, page_number, mark_done)
            yield sse({'type': 'done', 'content': ''})
        except asyncio.CancelledError:
            def mark_pending(page_entry: dict) -> None:
                if page_entry.get('status') == 'streaming':
                    page_entry['status'] = 'pending'
                    page_entry['lastError'] = ''

            session_service.mutate_page(user_id, session_id, page_number, mark_pending)
            raise
        except Exception as exc:
            def mark_failed(page_entry: dict) -> None:
                page_entry['status'] = 'failed'
                page_entry['lastError'] = str(exc)

            session_service.mutate_page(user_id, session_id, page_number, mark_failed)
            yield sse({'type': 'error', 'content': str(exc)})

    return sse_response(generate_stream())
