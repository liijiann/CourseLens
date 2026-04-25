from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from services import session_service

router = APIRouter(prefix='/api', tags=['file'])


@router.get('/file/{session_id}/original')
def get_original_pdf(session_id: str) -> FileResponse:
    pdf_path = session_service.get_original_pdf_path(session_id)
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail='PDF 不存在')
    return FileResponse(path=pdf_path, media_type='application/pdf', filename='original.pdf')
