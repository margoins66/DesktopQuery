from functools import lru_cache

from .base import EmbeddingProvider
from ..services.settings_service import resolve_secret


class LocalEmbeddingProvider(EmbeddingProvider):
    name = "local"

    def __init__(self):
        from chromadb.utils import embedding_functions

        self._ef = embedding_functions.DefaultEmbeddingFunction()

    def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        result = self._ef(texts)
        return [list(map(float, vec)) for vec in result]


class OpenAIEmbeddingProvider(EmbeddingProvider):
    name = "openai"

    def __init__(self, model: str):
        from openai import OpenAI

        api_key = resolve_secret("openai_api_key")
        if not api_key:
            raise RuntimeError("OpenAI API key is not configured.")
        self._client = OpenAI(api_key=api_key)
        self._model = model

    def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        resp = self._client.embeddings.create(model=self._model, input=texts)
        return [item.embedding for item in resp.data]


@lru_cache(maxsize=1)
def _local_singleton() -> LocalEmbeddingProvider:
    return LocalEmbeddingProvider()


def get_embedding_provider(settings: dict) -> EmbeddingProvider:
    provider = settings.get("embedding_provider", "local")
    if provider == "openai":
        return OpenAIEmbeddingProvider(
            settings.get("openai_embedding_model", "text-embedding-3-small")
        )
    return _local_singleton()


def active_embedding_signature(settings: dict) -> str:
    provider = settings.get("embedding_provider", "local")
    if provider == "openai":
        return f"openai:{settings.get('openai_embedding_model', 'text-embedding-3-small')}"
    return f"local:{settings.get('embedding_model', 'all-MiniLM-L6-v2')}"
