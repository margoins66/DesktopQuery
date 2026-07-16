import json

from ..config import FALLBACK_ANSWER, RISK_CATEGORIES
from ..database import db_cursor
from ..providers.llm import get_llm_provider
from ..services.settings_service import get_settings_raw
from .summaries import _document_chunks


def analyze_risk(document_id: int) -> dict:
    chunks = _document_chunks(document_id, limit=60)
    if not chunks:
        return {"findings": [], "summary": FALLBACK_ANSWER, "document_id": document_id}
    context = "\n\n".join(
        f"[Excerpt {i}] {c['content']}" for i, c in enumerate(chunks, 1)
    )
    categories = "\n".join(f"- {c}" for c in RISK_CATEGORIES)
    messages = [
        {
            "role": "system",
            "content": (
                "You are a contract risk reviewer. Analyze ONLY the provided excerpts. "
                "Do not invent issues. Only report a risk if it is supported by the "
                "excerpts (including the ABSENCE of expected clauses where that is "
                "evident from the provided content). "
                "Respond ONLY with JSON of the form: "
                "{\"findings\": [{\"category\": str, \"severity\": "
                "\"low\"|\"medium\"|\"high\", \"description\": str, \"evidence\": str}]}."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Risk categories to consider:\n{categories}\n\n"
                f"DOCUMENT EXCERPTS:\n{context}"
            ),
        },
    ]
    llm = get_llm_provider(get_settings_raw())
    findings = []
    try:
        raw = llm.complete(messages).strip()
        raw = raw[raw.find("{") : raw.rfind("}") + 1]
        parsed = json.loads(raw)
        findings = parsed.get("findings", [])
    except Exception:
        findings = []

    return {
        "document_id": document_id,
        "findings": findings,
        "count": len(findings),
    }
