from typing import Literal

from pydantic import BaseModel, Field

PageStatus = Literal['pending', 'streaming', 'done', 'failed']
ChatRole = Literal['user', 'assistant']


class UploadResponse(BaseModel):
    sessionId: str
    totalPages: int
    filename: str


class SessionMeta(BaseModel):
    sessionId: str
    filename: str
    totalPages: int
    createdAt: str
    model: str


class ChatRequest(BaseModel):
    message: str = Field(default='', max_length=2000)
    images: list[str] = Field(default_factory=list, max_length=3)
    model: str | None = None


class ChatTurn(BaseModel):
    role: ChatRole
    content: str
    images: list[str] = Field(default_factory=list, max_length=3)


class SessionPage(BaseModel):
    pageNumber: int
    status: PageStatus
    explanation: str = ''
    chat: list[ChatTurn] = Field(default_factory=list)
    lastError: str = ''


class SessionResponse(BaseModel):
    sessionId: str
    filename: str
    totalPages: int
    createdAt: str
    model: str
    pages: list[SessionPage]
