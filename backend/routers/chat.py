from collections.abc import AsyncGenerator

from fastapi import APIRouter, Header, HTTPException

from models.schemas import ChatRequest
from services import ai_service, session_service
from utils.sse import sse, sse_response

router = APIRouter(prefix='/api', tags=['chat'])


@router.post('/chat/{session_id}/{page_number}')
async def chat_page(
    session_id: str,
    page_number: int,
    body: ChatRequest,
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

    explanation = page.get('explanation', '').strip()
    if not explanation:
        raise HTTPException(status_code=400, detail='请先完成本页解读再追问')

    history = page.get('chat', [])

    async def chat_stream() -> AsyncGenerator[str, None]:
        chunks: list[str] = []
        try:
            async for chunk in ai_service.stream_chat_answer(
                page_number=page_number,
                explanation=explanation,
                history=history,
                user_message=body.message,
                model=meta['model'],
                api_key_override=x_api_key or None,
            ):
                chunks.append(chunk)
                yield sse({'type': 'chunk', 'content': chunk})

            answer = ''.join(chunks).strip()

            def persist_chat(page_entry: dict) -> None:
                page_entry['chat'].append({'role': 'user', 'content': body.message})
                page_entry['chat'].append({'role': 'assistant', 'content': answer})

            session_service.mutate_page(session_id, page_number, persist_chat)
            yield sse({'type': 'done', 'content': ''})
        except Exception as exc:
            yield sse({'type': 'error', 'content': str(exc)})

    return sse_response(chat_stream())
