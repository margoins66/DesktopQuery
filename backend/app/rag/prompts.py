from ..config import FALLBACK_ANSWER

SYSTEM_RULES = f"""You are a contract and business-document analysis assistant.
Strict rules you must always follow:
1. Answer ONLY using the provided CONTEXT excerpts from indexed documents.
2. Never use outside knowledge, never guess, never fabricate facts, numbers, dates, or names.
3. If the answer is not fully supported by the context, respond with EXACTLY this sentence and nothing else: "{FALLBACK_ANSWER}"
4. Be precise and concise. Quote or paraphrase only what the context supports.
5. When you state a fact, it must be traceable to one of the provided excerpts.
"""


def build_context(chunks: list[dict]) -> str:
    parts = []
    for i, c in enumerate(chunks, 1):
        meta = c.get("metadata", {})
        name = meta.get("document_name", "document")
        page = meta.get("page_number") or ""
        heading = meta.get("heading") or ""
        loc = []
        if page:
            loc.append(f"page {page}")
        if heading:
            loc.append(f"section '{heading}'")
        loc_str = f" ({', '.join(loc)})" if loc else ""
        parts.append(f"[Excerpt {i}] from \"{name}\"{loc_str}:\n{c['content']}")
    return "\n\n".join(parts)


def build_qa_messages(question: str, chunks: list[dict], history: list[dict] | None = None) -> list[dict]:
    context = build_context(chunks)
    messages = [{"role": "system", "content": SYSTEM_RULES}]
    if history:
        for h in history[-6:]:
            messages.append({"role": h["role"], "content": h["content"]})
    user = (
        f"CONTEXT:\n{context}\n\n"
        f"QUESTION: {question}\n\n"
        "Answer using only the context above. If the context does not contain the "
        f"answer, reply exactly: \"{FALLBACK_ANSWER}\""
    )
    messages.append({"role": "user", "content": user})
    return messages
