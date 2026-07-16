from fastapi import APIRouter

from ..models import SettingsUpdate
from ..providers.llm import OllamaLLMProvider
from ..services.settings_service import (
    get_settings_public,
    get_settings_raw,
    update_settings,
)

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("")
def read_settings():
    return get_settings_public()


@router.put("")
def write_settings(update: SettingsUpdate):
    return update_settings(update.model_dump(exclude_none=True))


@router.get("/providers")
def providers_status():
    settings = get_settings_raw()
    ollama = OllamaLLMProvider(
        settings.get("llm_model", "llama3"),
        settings.get("ollama_base_url", "http://localhost:11434"),
    )
    return {
        "llm": [
            {"id": "openai", "label": "OpenAI", "status": "active", "type": "cloud"},
            {"id": "anthropic", "label": "Anthropic Claude", "status": "active", "type": "cloud"},
            {
                "id": "ollama",
                "label": "Ollama (Local)",
                "status": "available" if ollama.available() else "coming_soon",
                "type": "local",
            },
        ],
        "embeddings": [
            {"id": "local", "label": "Local (MiniLM)", "status": "active", "type": "local"},
            {"id": "openai", "label": "OpenAI Embeddings", "status": "active", "type": "cloud"},
        ],
    }
