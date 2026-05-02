from contextlib import asynccontextmanager
import os
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from db import init_db
from routers.admin import router as admin_router
from routers.announcement import router as announcement_router
from routers.auth import router as auth_router
from routers.chat import router as chat_router
from routers.explain import router as explain_router
from routers.file import router as file_router
from routers.recharge import router as recharge_router
from routers.search import router as search_router
from routers.session import router as session_router
from routers.upload import router as upload_router
from services import ai_service

load_dotenv(Path(__file__).resolve().parent / '.env')


@asynccontextmanager
async def lifespan(app: FastAPI):
    timeout = httpx.Timeout(60.0, read=600.0)
    client = httpx.AsyncClient(timeout=timeout)
    app.state.http_client = client
    ai_service.set_http_client(client)
    try:
        yield
    finally:
        ai_service.set_http_client(None)
        await client.aclose()


app = FastAPI(title='CourseLens', lifespan=lifespan)

allowed_origins_env = os.getenv('ALLOWED_ORIGINS', 'http://localhost:3000')
allowed_origins = [item.strip() for item in allowed_origins_env.split(',') if item.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

init_db()

app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(announcement_router)
app.include_router(upload_router)
app.include_router(session_router)
app.include_router(search_router)
app.include_router(file_router)
app.include_router(recharge_router)
app.include_router(explain_router)
app.include_router(chat_router)


@app.get('/healthz')
def healthcheck() -> dict[str, str]:
    return {'status': 'ok'}
