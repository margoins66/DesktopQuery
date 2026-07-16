from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import PORT
from .database import init_db
from .routes import (
    analysis,
    chat,
    dashboard,
    documents,
    exports,
    folders,
    health,
    search,
    settings,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    try:
        from .monitoring.watcher import start_watchers

        start_watchers()
    except Exception:
        pass
    yield


app = FastAPI(title="Local Document RAG API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

api = FastAPI(title="RAG API")
for module in (
    health,
    documents,
    folders,
    search,
    chat,
    analysis,
    settings,
    dashboard,
    exports,
):
    api.include_router(module.router)

app.mount("/api", api)


@app.get("/")
def root():
    return {"service": "Local Document RAG API", "docs": "/api/docs", "port": PORT}
