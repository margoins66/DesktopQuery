from typing import Iterator

from .base import LLMProvider
from ..services.settings_service import resolve_secret


class OpenAILLMProvider(LLMProvider):
    name = "openai"

    def __init__(self, model: str):
        from openai import OpenAI

        api_key = resolve_secret("openai_api_key")
        if not api_key:
            raise RuntimeError("OpenAI API key is not configured.")
        self._client = OpenAI(api_key=api_key)
        self._model = model

    def complete(self, messages: list[dict], temperature: float = 0.0) -> str:
        resp = self._client.chat.completions.create(
            model=self._model, messages=messages, temperature=temperature
        )
        return resp.choices[0].message.content or ""

    def stream(self, messages: list[dict], temperature: float = 0.0) -> Iterator[str]:
        stream = self._client.chat.completions.create(
            model=self._model,
            messages=messages,
            temperature=temperature,
            stream=True,
        )
        for chunk in stream:
            delta = chunk.choices[0].delta
            if delta and delta.content:
                yield delta.content


class AnthropicLLMProvider(LLMProvider):
    name = "anthropic"

    def __init__(self, model: str):
        from anthropic import Anthropic

        api_key = resolve_secret("anthropic_api_key")
        if not api_key:
            raise RuntimeError("Anthropic API key is not configured.")
        self._client = Anthropic(api_key=api_key)
        self._model = model

    @staticmethod
    def _split(messages: list[dict]):
        system = "\n".join(m["content"] for m in messages if m["role"] == "system")
        convo = [m for m in messages if m["role"] != "system"]
        return system, convo

    def complete(self, messages: list[dict], temperature: float = 0.0) -> str:
        system, convo = self._split(messages)
        resp = self._client.messages.create(
            model=self._model,
            system=system,
            messages=convo,
            temperature=temperature,
            max_tokens=2048,
        )
        return "".join(block.text for block in resp.content if block.type == "text")

    def stream(self, messages: list[dict], temperature: float = 0.0) -> Iterator[str]:
        system, convo = self._split(messages)
        with self._client.messages.stream(
            model=self._model,
            system=system,
            messages=convo,
            temperature=temperature,
            max_tokens=2048,
        ) as stream:
            for text in stream.text_stream:
                yield text


class OllamaLLMProvider(LLMProvider):
    name = "ollama"

    def __init__(self, model: str, base_url: str):
        self._model = model
        self._base_url = base_url.rstrip("/")

    def available(self) -> bool:
        import httpx

        try:
            httpx.get(f"{self._base_url}/api/tags", timeout=2.0)
            return True
        except Exception:
            return False

    def complete(self, messages: list[dict], temperature: float = 0.0) -> str:
        import httpx

        resp = httpx.post(
            f"{self._base_url}/api/chat",
            json={
                "model": self._model,
                "messages": messages,
                "stream": False,
                "options": {"temperature": temperature},
            },
            timeout=120.0,
        )
        resp.raise_for_status()
        return resp.json().get("message", {}).get("content", "")

    def stream(self, messages: list[dict], temperature: float = 0.0) -> Iterator[str]:
        import json

        import httpx

        with httpx.stream(
            "POST",
            f"{self._base_url}/api/chat",
            json={
                "model": self._model,
                "messages": messages,
                "stream": True,
                "options": {"temperature": temperature},
            },
            timeout=120.0,
        ) as resp:
            resp.raise_for_status()
            for line in resp.iter_lines():
                if not line:
                    continue
                data = json.loads(line)
                content = data.get("message", {}).get("content", "")
                if content:
                    yield content


def get_llm_provider(settings: dict) -> LLMProvider:
    provider = settings.get("llm_provider", "openai")
    if provider == "anthropic":
        return AnthropicLLMProvider(
            settings.get("anthropic_model", "claude-3-5-sonnet-20241022")
        )
    if provider == "ollama":
        return OllamaLLMProvider(
            settings.get("llm_model", "llama3"),
            settings.get("ollama_base_url", "http://localhost:11434"),
        )
    return OpenAILLMProvider(settings.get("llm_model", "gpt-4o-mini"))
