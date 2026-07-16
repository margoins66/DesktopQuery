from ..config import FALLBACK_ANSWER, SUMMARY_STYLES
from ..database import db_cursor
from ..providers.llm import get_llm_provider
from ..services.settings_service import get_settings_raw
from .pipeline import chunks_to_citations

STYLE_INSTRUCTIONS = {
    "executive": "Write a concise executive summary (3-5 short paragraphs) for a decision maker.",
    "one_page": "Write a structured one-page summary with clear sections and short paragraphs.",
    "bullet": "Write a bullet-point summary of the key points, one fact per bullet.",
    "legal": "Write a legal summary focused on obligations, rights, terms, and clauses.",
    "technical": "Write a technical summary focused on specifications, scope, and deliverables.",
    "risk": "Write a risk-focused summary highlighting obligations, liabilities, and potential concerns.",
    "vendor": "Write a vendor-focused summary covering parties, payment terms, deliverables, and dates.",
}


def _document_chunks(document_id: int, limit: int = 40) -> list[dict]:
    with db_cursor() as cur:
        cur.execute(
            "SELECT c.content, c.page_number, c.heading, d.id as document_id, "
            "d.file_name as document_name FROM document_chunks c "
            "JOIN documents d ON d.id = c.document_id "
            "WHERE c.document_id=? ORDER BY c.chunk_index LIMIT ?",
            (document_id, limit),
        )
        rows = cur.fetchall()
    return [
        {
            "content": r["content"],
            "metadata": {
                "document_id": r["document_id"],
                "document_name": r["document_name"],
                "page_number": r["page_number"],
                "heading": r["heading"],
            },
            "score": 1.0,
        }
        for r in rows
    ]


def generate_summary(document_id: int, style: str) -> dict:
    if style not in SUMMARY_STYLES:
        style = "executive"
    chunks = _document_chunks(document_id)
    if not chunks:
        return {"summary": FALLBACK_ANSWER, "citations": [], "style": style}
    context = "\n\n".join(
        f"[Excerpt {i}] {c['content']}" for i, c in enumerate(chunks, 1)
    )
    instruction = STYLE_INSTRUCTIONS.get(style, STYLE_INSTRUCTIONS["executive"])
    messages = [
        {
            "role": "system",
            "content": (
                "You summarize documents using ONLY the provided excerpts. "
                "Never add information that is not present. If there is not enough "
                f"content, reply exactly: \"{FALLBACK_ANSWER}\""
            ),
        },
        {
            "role": "user",
            "content": f"{instruction}\n\nDOCUMENT EXCERPTS:\n{context}",
        },
    ]
    llm = get_llm_provider(get_settings_raw())
    summary = llm.complete(messages).strip()
    if not summary:
        summary = FALLBACK_ANSWER
    return {
        "summary": summary,
        "citations": chunks_to_citations(chunks[:8]),
        "style": style,
        "style_label": SUMMARY_STYLES[style],
    }
