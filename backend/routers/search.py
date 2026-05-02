import asyncio

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from auth_deps import get_current_user
from db import UserRecord
from services import pdf_service, session_service

router = APIRouter(prefix='/api', tags=['search'])


class SearchResultItem(BaseModel):
    pageNumber: int
    snippet: str


class SearchResponse(BaseModel):
    query: str
    results: list[SearchResultItem]


async def _ensure_text_extracted(user_id: str, session_id: str) -> None:
    """若该 session 尚未提取过文字（旧数据），则立即提取并写入。"""
    meta = session_service.get_session_meta(user_id, session_id)
    total_pages = int(meta['totalPages'])

    # 检查第一页有没有 text 字段，没有则说明整个 session 都未提取
    page = session_service.get_page(user_id, session_id, 1)
    if 'text' in page:
        return  # 已提取过，跳过

    pdf_path = session_service.get_original_pdf_path(user_id, session_id)
    if not pdf_path.exists():
        return

    text_by_page = await asyncio.to_thread(pdf_service.extract_pdf_text_by_page, pdf_path)
    for page_number in range(1, total_pages + 1):
        text = text_by_page.get(page_number, '')
        session_service.write_page_text(user_id, session_id, page_number, text)


@router.get('/session/{session_id}/search', response_model=SearchResponse)
async def search_session(
    session_id: str,
    q: str = Query(..., min_length=1, max_length=200),
    current_user: UserRecord = Depends(get_current_user),
) -> SearchResponse:
    user_id = str(current_user['id'])

    try:
        await _ensure_text_extracted(user_id, session_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail='会话不存在')

    results = session_service.search_session_text(user_id, session_id, q)
    return SearchResponse(
        query=q,
        results=[SearchResultItem(**r) for r in results],
    )
