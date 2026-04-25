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
    message: str = Field(min_length=1, max_length=2000)


class ChatTurn(BaseModel):
    role: ChatRole
    content: str


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
