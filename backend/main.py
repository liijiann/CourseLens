from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers.chat import router as chat_router
from routers.explain import router as explain_router
from routers.file import router as file_router
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=['http://localhost:3000', 'http://127.0.0.1:3000'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

app.include_router(upload_router)
app.include_router(session_router)
app.include_router(file_router)
app.include_router(explain_router)
app.include_router(chat_router)


@app.get('/healthz')
def healthcheck() -> dict[str, str]:
    return {'status': 'ok'}
