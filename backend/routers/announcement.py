from fastapi import APIRouter
from pydantic import BaseModel

from db import get_active_announcement

router = APIRouter(tags=['announcement'])


class AnnouncementResponse(BaseModel):
    id: int | None = None
    content: str | None
    created_at: str | None = None


@router.get('/api/announcement', response_model=AnnouncementResponse)
def get_announcement() -> AnnouncementResponse:
    announcement = get_active_announcement()
    if announcement is None:
        return AnnouncementResponse(content=None)

    return AnnouncementResponse(
        id=int(announcement['id']),
        content=str(announcement['content']),
        created_at=str(announcement['created_at']),
    )
