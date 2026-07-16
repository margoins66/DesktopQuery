import json

from ..config import COMPARISON_TOPICS, FALLBACK_ANSWER
from ..database import db_cursor
from ..providers.llm import get_llm_provider
from ..services.settings_service import get_settings_raw
from .pipeline import retrieve


def _doc_names(document_ids: list[int]) -> dict[int, str]:
    names = {}
    with db_cursor() as cur:
        for did in document_ids:
            cur.execute("SELECT file_name FROM documents WHERE id=?", (did,))
            row = cur.fetchone()
            if row:
                names[did] = row["file_name"]
    return names


def compare_documents(document_ids: list[int], topics: list[str] | None = None) -> dict:
    topics = topics or COMPARISON_TOPICS
    names = _doc_names(document_ids)
    llm = get_llm_provider(get_settings_raw())
    rows = []

    for topic in topics:
        per_doc_context = {}
        for did in document_ids:
            chunks = retrieve(topic, [did], top_k=4)
            per_doc_context[did] = "\n".join(c["content"] for c in chunks)

        context_block = "\n\n".join(
            f"DOCUMENT \"{names.get(did, str(did))}\" (id {did}):\n"
            f"{per_doc_context[did] or '[no relevant content found]'}"
            for did in document_ids
        )
        messages = [
            {
                "role": "system",
                "content": (
                    "You compare contracts using ONLY the provided excerpts. "
                    "For each document, extract what it says about the topic. "
                    "If a document has no relevant content, use exactly "
                    f"\"{FALLBACK_ANSWER}\" for that cell. "
                    "Respond ONLY with JSON: {\"cells\": {\"<doc_id>\": \"<finding>\"}}."
                ),
            },
            {
                "role": "user",
                "content": f"TOPIC: {topic}\n\n{context_block}",
            },
        ]
        cells = {}
        try:
            raw = llm.complete(messages).strip()
            raw = raw[raw.find("{") : raw.rfind("}") + 1]
            parsed = json.loads(raw)
            cells = parsed.get("cells", {})
        except Exception:
            cells = {str(did): FALLBACK_ANSWER for did in document_ids}

        rows.append(
            {
                "topic": topic,
                "values": {
                    str(did): cells.get(str(did), FALLBACK_ANSWER)
                    for did in document_ids
                },
            }
        )

    return {
        "documents": [{"id": did, "name": names.get(did, str(did))} for did in document_ids],
        "topics": topics,
        "rows": rows,
    }
