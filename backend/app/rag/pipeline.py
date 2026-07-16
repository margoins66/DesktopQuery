from ..config import FALLBACK_ANSWER
from ..database import db_cursor
from ..providers import vectorstore
from ..providers.embeddings import get_embedding_provider
from ..providers.llm import get_llm_provider
from ..services.settings_service import get_settings_raw
from .prompts import build_qa_messages

MIN_SCORE = 0.15


def retrieve(
    query: str,
    document_ids: list[int] | None = None,
    top_k: int | None = None,
    document_type: str | None = None,
    vendor: str | None = None,
) -> list[dict]:
    settings = get_settings_raw()
    if top_k is None:
        top_k = int(settings.get("retrieval_top_k", "6"))
    embedder = get_embedding_provider(settings)
    query_vec = embedder.embed_query(query)
    where = None
    if document_ids:
        if len(document_ids) == 1:
            where = {"document_id": document_ids[0]}
        else:
            where = {"document_id": {"$in": document_ids}}
    has_filters = bool(document_type or vendor)
    fetch_k = top_k * 4 if has_filters else top_k
    results = vectorstore.query(query_vec, fetch_k, where)
    results = [r for r in results if r["score"] >= MIN_SCORE]
    if has_filters:
        meta = _doc_meta({r["metadata"].get("document_id") for r in results})

        def keep(r: dict) -> bool:
            m = meta.get(r["metadata"].get("document_id"), {})
            if document_type and m.get("document_type") != document_type:
                return False
            if vendor and (m.get("vendor") or "") != vendor:
                return False
            return True

        results = [r for r in results if keep(r)]
    return results[:top_k]


def _doc_meta(document_ids: set) -> dict:
    ids = [d for d in document_ids if d is not None]
    if not ids:
        return {}
    placeholders = ",".join("?" for _ in ids)
    with db_cursor() as cur:
        cur.execute(
            f"SELECT id, document_type, vendor FROM documents WHERE id IN ({placeholders})",
            ids,
        )
        return {r["id"]: dict(r) for r in cur.fetchall()}


def chunks_to_citations(chunks: list[dict]) -> list[dict]:
    citations = []
    for c in chunks:
        meta = c.get("metadata", {})
        snippet = c["content"].strip()
        if len(snippet) > 320:
            snippet = snippet[:320].rsplit(" ", 1)[0] + "…"
        citations.append(
            {
                "document_id": meta.get("document_id"),
                "document_name": meta.get("document_name", "document"),
                "page_number": meta.get("page_number") or None,
                "heading": meta.get("heading") or None,
                "quoted_text": snippet,
                "confidence": round(c["score"], 3),
            }
        )
    return citations


def keyword_search(
    query: str,
    document_ids: list[int] | None = None,
    limit: int = 20,
    document_type: str | None = None,
    vendor: str | None = None,
) -> list[dict]:
    sql = (
        "SELECT c.content, c.page_number, c.heading, d.id as document_id, "
        "d.file_name as document_name FROM document_chunks c "
        "JOIN documents d ON d.id = c.document_id WHERE c.content LIKE ?"
    )
    params: list = [f"%{query}%"]
    if document_ids:
        placeholders = ",".join("?" for _ in document_ids)
        sql += f" AND d.id IN ({placeholders})"
        params.extend(document_ids)
    if document_type:
        sql += " AND d.document_type = ?"
        params.append(document_type)
    if vendor:
        sql += " AND d.vendor = ?"
        params.append(vendor)
    sql += " LIMIT ?"
    params.append(limit)
    with db_cursor() as cur:
        cur.execute(sql, params)
        rows = cur.fetchall()
    return [dict(r) for r in rows]


def get_history(conversation_id: int) -> list[dict]:
    with db_cursor() as cur:
        cur.execute(
            "SELECT role, content FROM messages WHERE conversation_id=? ORDER BY id",
            (conversation_id,),
        )
        return [dict(r) for r in cur.fetchall()]


def answer_question(question: str, document_ids=None, top_k=None, conversation_id=None):
    chunks = retrieve(question, document_ids, top_k)
    if not chunks:
        return FALLBACK_ANSWER, []
    history = get_history(conversation_id) if conversation_id else None
    messages = build_qa_messages(question, chunks, history)
    llm = get_llm_provider(get_settings_raw())
    answer = llm.complete(messages).strip()
    if answer == FALLBACK_ANSWER or not answer:
        return FALLBACK_ANSWER, []
    return answer, chunks_to_citations(chunks)


def stream_answer(question: str, document_ids=None, top_k=None, conversation_id=None):
    chunks = retrieve(question, document_ids, top_k)
    if not chunks:
        def empty():
            yield {"type": "token", "content": FALLBACK_ANSWER}
            yield {"type": "citations", "citations": []}
            yield {"type": "done", "answer": FALLBACK_ANSWER}
        return empty()
    history = get_history(conversation_id) if conversation_id else None
    messages = build_qa_messages(question, chunks, history)
    llm = get_llm_provider(get_settings_raw())
    citations = chunks_to_citations(chunks)

    def generator():
        collected = []
        for token in llm.stream(messages):
            collected.append(token)
            yield {"type": "token", "content": token}
        full = "".join(collected).strip()
        if full == FALLBACK_ANSWER or not full:
            yield {"type": "citations", "citations": []}
            yield {"type": "done", "answer": FALLBACK_ANSWER}
        else:
            yield {"type": "citations", "citations": citations}
            yield {"type": "done", "answer": full}

    return generator()
