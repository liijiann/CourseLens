from collections.abc import AsyncGenerator

from fastapi import APIRouter, Depends, Header, HTTPException

from auth_deps import get_current_user
from db import UserRecord
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

    explanation = page.get('explanation', '').strip()
    if not explanation:
        raise HTTPException(status_code=400, detail='请先完成本页解读再追问')

    history = page.get('chat', [])
    images = body.images[:3] if body.images else []
    message = body.message.strip()
    if not message and not images:
        raise HTTPException(status_code=400, detail='请输入问题或上传图片')
    chat_model = (body.model or meta['model']).strip()
    if chat_model not in ai_service.MODELS:
        raise HTTPException(status_code=400, detail=f'不支持的模型: {chat_model}')

    async def chat_stream() -> AsyncGenerator[str, None]:
        chunks: list[str] = []
        try:
            async for chunk in ai_service.stream_chat_answer(
                page_number=page_number,
                explanation=explanation,
                history=history,
                user_message=message,
                user_images=images,
                model=chat_model,
                api_key_override=x_api_key or None,
            ):
                chunks.append(chunk)
                yield sse({'type': 'chunk', 'content': chunk})

            answer = ''.join(chunks).strip()

            def persist_chat(page_entry: dict) -> None:
                page_entry['chat'].append({'role': 'user', 'content': message, 'images': images})
                page_entry['chat'].append({'role': 'assistant', 'content': answer})

            session_service.mutate_page(user_id, session_id, page_number, persist_chat)
            yield sse({'type': 'done', 'content': ''})
        except Exception as exc:
            yield sse({'type': 'error', 'content': str(exc)})

    return sse_response(chat_stream())


@router.delete('/chat/{session_id}/{page_number}/history', status_code=204)
def clear_chat_history(
    session_id: str,
    page_number: int,
    current_user: UserRecord = Depends(get_current_user),
) -> None:
    user_id = str(current_user['id'])

    try:
        session_service.get_page(user_id, session_id, page_number)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail='会话不存在') from exc
    except IndexError as exc:
        raise HTTPException(status_code=404, detail='页码不存在') from exc

    def clear_history(page_entry: dict) -> None:
        page_entry['chat'] = []

    session_service.mutate_page(user_id, session_id, page_number, clear_history)
