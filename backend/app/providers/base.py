from abc import ABC, abstractmethod
from typing import Iterator


class EmbeddingProvider(ABC):
    name: str = "base"

    @abstractmethod
    def embed(self, texts: list[str]) -> list[list[float]]:
        ...

    def embed_query(self, text: str) -> list[float]:
        return self.embed([text])[0]


class LLMProvider(ABC):
    name: str = "base"

    @abstractmethod
    def complete(self, messages: list[dict], temperature: float = 0.0) -> str:
        ...

    @abstractmethod
    def stream(self, messages: list[dict], temperature: float = 0.0) -> Iterator[str]:
        ...

    def available(self) -> bool:
        return True
