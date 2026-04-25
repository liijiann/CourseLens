from fastapi import APIRouter, HTTPException

from models.schemas import SessionMeta, SessionResponse
from services import session_service

router = APIRouter(prefix='/api', tags=['session'])


@router.get('/sessions', response_model=list[SessionMeta])
def list_sessions() -> list[SessionMeta]:
    return session_service.list_sessions()


@router.get('/session/{session_id}', response_model=SessionResponse)
def get_session(session_id: str) -> SessionResponse:
    try:
        session_data = session_service.get_session(session_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail='Session 不存在') from exc

    return SessionResponse(**session_data)


@router.delete('/session/{session_id}', status_code=204)
def delete_session(session_id: str) -> None:
    try:
        session_service.delete_session(session_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail='Session 不存在') from exc
