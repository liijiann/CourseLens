from fastapi import APIRouter, Depends, HTTPException

from auth_deps import get_current_user
from db import UserRecord, get_user_storage, update_user_storage_used
from models.schemas import SessionMeta, SessionResponse
from services import pdf_service, session_service

router = APIRouter(prefix='/api', tags=['session'])


@router.get('/sessions', response_model=list[SessionMeta])
def list_sessions(current_user: UserRecord = Depends(get_current_user)) -> list[SessionMeta]:
    user_id = str(current_user['id'])
    return session_service.list_sessions(user_id)


@router.get('/session/{session_id}', response_model=SessionResponse)
def get_session(session_id: str, current_user: UserRecord = Depends(get_current_user)) -> SessionResponse:
    user_id = str(current_user['id'])
    try:
        session_data = session_service.get_session(user_id, session_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail='Session not found') from exc

    return SessionResponse(**session_data)


@router.delete('/session/{session_id}', status_code=204)
def delete_session(session_id: str, current_user: UserRecord = Depends(get_current_user)) -> None:
    user_id = str(current_user['id'])
    pages_dir = session_service.get_session_dir(user_id, session_id) / 'pages'
    reclaim_bytes = pdf_service.get_path_size_bytes(pages_dir)
    reclaim_mb = pdf_service.bytes_to_mb(reclaim_bytes)

    try:
        session_service.delete_session(user_id, session_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail='Session not found') from exc

    _, used_mb = get_user_storage(int(current_user['id']))
    update_user_storage_used(int(current_user['id']), round(max(0.0, used_mb - reclaim_mb), 2))
