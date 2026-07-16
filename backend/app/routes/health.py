from fastapi import APIRouter

from ..providers import vectorstore
from ..services.settings_service import get_settings_raw

router = APIRouter(tags=["health"])


@router.get("/health")
def health():
    settings = get_settings_raw()
    try:
        vector_count = vectorstore.count()
        vector_ok = True
    except Exception:
        vector_count = 0
        vector_ok = False
    return {
        "status": "ok",
        "llm_provider": settings.get("llm_provider"),
        "embedding_provider": settings.get("embedding_provider"),
        "local_only": settings.get("local_only") == "true",
        "vector_store": {"ok": vector_ok, "count": vector_count},
    }
