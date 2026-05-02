import asyncio
import shutil

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from auth_deps import get_current_user
from db import UserRecord
from models.schemas import UploadResponse
from services import ai_service, pdf_service, render_service, session_service

router = APIRouter(prefix='/api', tags=['upload'])


async def _extract_and_store_text(user_id: str, session_id: str, pdf_path_str: str) -> None:
    """后台任务：提取 PDF 每页文字并写入 state JSON。"""
    from pathlib import Path
    pdf_path = Path(pdf_path_str)
    try:
        text_by_page = await asyncio.to_thread(pdf_service.extract_pdf_text_by_page, pdf_path)
        for page_number, text in text_by_page.items():
            session_service.write_page_text(user_id, session_id, page_number, text)
    except Exception:
        pass  # 文字提取失败不影响主流程


@router.post('/upload', response_model=UploadResponse)
async def upload_pdf(
    file: UploadFile = File(...),
    model: str = Form('qwen3.6-flash'),
    current_user: UserRecord = Depends(get_current_user),
) -> UploadResponse:
    if not file.filename:
        raise HTTPException(status_code=400, detail='缺少文件名')
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail='仅支持 PDF 文件')
    if model not in ai_service.MODELS:
        raise HTTPException(status_code=400, detail=f'不支持的模型: {model}')

    user_id = str(current_user['id'])

    session_service.ensure_storage_dir()
    session_id = session_service.generate_session_id()
    try:
        session_dir = session_service.create_session_dirs(user_id, session_id)
    except FileExistsError:
        session_id = session_service.generate_session_id()
        session_dir = session_service.create_session_dirs(user_id, session_id)

    pdf_path = session_service.get_original_pdf_path(user_id, session_id)

    try:
        # Upload phase: only persist original PDF and read page count.
        await pdf_service.save_upload(file, pdf_path)

        total_pages = await asyncio.to_thread(pdf_service.get_pdf_page_count, pdf_path)
        if total_pages <= 0:
            raise HTTPException(status_code=400, detail='PDF 页面为空')

        session_service.initialize_session(
            user_id=user_id,
            session_id=session_id,
            filename=file.filename,
            total_pages=total_pages,
            model=model,
        )

        # Start low-priority sequential pre-render in background.
        await render_service.schedule_prefetch(
            user_id=user_id,
            session_id=session_id,
            total_pages=total_pages,
            start_page=1,
        )

        # Extract text from PDF in background (best-effort, non-blocking).
        asyncio.create_task(_extract_and_store_text(user_id, session_id, str(pdf_path)))
    except Exception as exc:
        shutil.rmtree(session_dir, ignore_errors=True)
        if isinstance(exc, HTTPException):
            raise
        raise HTTPException(status_code=500, detail=f'上传处理失败: {exc}') from exc

    return UploadResponse(
        sessionId=session_id,
        totalPages=total_pages,
        filename=file.filename,
    )
