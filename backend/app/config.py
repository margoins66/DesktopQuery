import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("RAG_DATA_DIR", BASE_DIR / "data"))
UPLOAD_DIR = DATA_DIR / "uploads"
CHROMA_DIR = DATA_DIR / "chroma"
DB_PATH = DATA_DIR / "rag.sqlite3"

for _d in (DATA_DIR, UPLOAD_DIR, CHROMA_DIR):
    _d.mkdir(parents=True, exist_ok=True)

PORT = int(os.environ.get("PORT", "8000"))

SUPPORTED_EXTENSIONS = {
    ".pdf",
    ".docx",
    ".xlsx",
    ".txt",
    ".md",
    ".rtf",
    ".pptx",
    ".html",
    ".htm",
    ".csv",
}

DEFAULT_SETTINGS = {
    "llm_provider": "openai",
    "llm_model": "gpt-4o-mini",
    "ollama_base_url": "http://localhost:11434",
    "openai_api_key": "",
    "anthropic_api_key": "",
    "anthropic_model": "claude-3-5-sonnet-20241022",
    "embedding_provider": "local",
    "embedding_model": "all-MiniLM-L6-v2",
    "openai_embedding_model": "text-embedding-3-small",
    "chunk_size": "1000",
    "chunk_overlap": "150",
    "theme": "light",
    "local_only": "true",
    "retrieval_top_k": "6",
}

FALLBACK_ANSWER = "I could not locate that information in the indexed documents."

COMPARISON_TOPICS = [
    "Payment terms",
    "Deliverables",
    "Due dates",
    "Insurance requirements",
    "Termination clauses",
    "Intellectual property",
    "Confidentiality",
    "Liability",
    "Indemnification",
    "Warranty",
    "Service Level Agreements",
    "Renewal clauses",
    "Governing law",
    "Pricing",
    "Scope",
]

SUMMARY_STYLES = {
    "executive": "Executive Summary",
    "one_page": "One Page Summary",
    "bullet": "Bullet Summary",
    "legal": "Legal Summary",
    "technical": "Technical Summary",
    "risk": "Risk Summary",
    "vendor": "Vendor Summary",
}

RISK_CATEGORIES = [
    "Missing signatures",
    "Missing dates",
    "Conflicting language",
    "Missing insurance requirements",
    "Unlimited liability",
    "Unusual indemnification",
    "Automatic renewals",
    "One-sided clauses",
    "Missing payment terms",
    "Other potential contract risks",
]
