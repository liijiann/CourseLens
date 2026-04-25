import asyncio
import shutil

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from models.schemas import UploadResponse
from services import ai_service, pdf_service, session_service

router = APIRouter(prefix='/api', tags=['upload'])


@router.post('/upload', response_model=UploadResponse)
async def upload_pdf(
    file: UploadFile = File(...),
    model: str = Form('qwen3.6-flash'),
) -> UploadResponse:
    if not file.filename:
        raise HTTPException(status_code=400, detail='缺少文件名')
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail='仅支持 PDF 文件')
    if model not in ai_service.MODELS:
        raise HTTPException(status_code=400, detail=f'不支持的模型: {model}')

    session_service.ensure_storage_dir()
    session_id = session_service.generate_session_id()
    try:
        session_dir = session_service.create_session_dirs(session_id)
    except FileExistsError:
        session_id = session_service.generate_session_id()
        session_dir = session_service.create_session_dirs(session_id)

    pdf_path = session_service.get_original_pdf_path(session_id)

    try:
        await pdf_service.save_upload(file, pdf_path)
        total_pages = await asyncio.to_thread(
            pdf_service.render_pdf_to_images,
            pdf_path,
            session_dir / 'pages',
            2048,
        )
        if total_pages <= 0:
            raise HTTPException(status_code=400, detail='PDF 页面为空')
        session_service.initialize_session(
            session_id=session_id,
            filename=file.filename,
            total_pages=total_pages,
            model=model,
        )
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
