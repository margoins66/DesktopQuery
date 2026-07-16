from typing import Optional

from pydantic import BaseModel


class Citation(BaseModel):
    document_id: int
    document_name: str
    page_number: Optional[int] = None
    heading: Optional[str] = None
    quoted_text: str
    confidence: float


class AskRequest(BaseModel):
    question: str
    conversation_id: Optional[int] = None
    document_ids: Optional[list[int]] = None
    top_k: Optional[int] = None


class SearchRequest(BaseModel):
    query: str
    mode: str = "semantic"
    document_ids: Optional[list[int]] = None
    document_type: Optional[str] = None
    vendor: Optional[str] = None
    top_k: int = 10


class SummaryRequest(BaseModel):
    document_id: int
    style: str = "executive"


class ComparisonRequest(BaseModel):
    document_ids: list[int]
    topics: Optional[list[str]] = None


class RiskRequest(BaseModel):
    document_id: int


class FolderRequest(BaseModel):
    path: str


class SettingsUpdate(BaseModel):
    llm_provider: Optional[str] = None
    llm_model: Optional[str] = None
    ollama_base_url: Optional[str] = None
    openai_api_key: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    anthropic_model: Optional[str] = None
    embedding_provider: Optional[str] = None
    openai_embedding_model: Optional[str] = None
    chunk_size: Optional[str] = None
    chunk_overlap: Optional[str] = None
    theme: Optional[str] = None
    local_only: Optional[str] = None
    retrieval_top_k: Optional[str] = None


class ConversationCreate(BaseModel):
    title: Optional[str] = None


class ExportAnswerRequest(BaseModel):
    question: str
    answer: str
    citations: list[Citation] = []
