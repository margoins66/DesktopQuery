from fastapi import APIRouter

from ..database import db_cursor
from ..providers import vectorstore

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("")
def dashboard():
    with db_cursor() as cur:
        cur.execute("SELECT COUNT(*) AS n FROM documents")
        total_docs = cur.fetchone()["n"]
        cur.execute("SELECT status, COUNT(*) AS n FROM documents GROUP BY status")
        by_status = {r["status"]: r["n"] for r in cur.fetchall()}
        cur.execute("SELECT COUNT(*) AS n FROM document_chunks")
        total_chunks = cur.fetchone()["n"]
        cur.execute("SELECT COUNT(*) AS n FROM conversations")
        total_conversations = cur.fetchone()["n"]
        cur.execute("SELECT COUNT(*) AS n FROM indexed_folders")
        total_folders = cur.fetchone()["n"]
        cur.execute(
            "SELECT document_type, COUNT(*) AS n FROM documents "
            "GROUP BY document_type ORDER BY n DESC"
        )
        by_type = [{"type": r["document_type"] or "unknown", "count": r["n"]} for r in cur.fetchall()]
        cur.execute(
            "SELECT id, file_name, title, status, created_at FROM documents "
            "ORDER BY created_at DESC LIMIT 8"
        )
        recent = [{k: r[k] for k in r.keys()} for r in cur.fetchall()]

    try:
        vector_count = vectorstore.count()
    except Exception:
        vector_count = 0

    return {
        "total_documents": total_docs,
        "indexed": by_status.get("indexed", 0),
        "pending": by_status.get("pending", 0) + by_status.get("indexing", 0),
        "failed": by_status.get("failed", 0),
        "total_chunks": total_chunks,
        "vector_count": vector_count,
        "total_conversations": total_conversations,
        "total_folders": total_folders,
        "by_type": by_type,
        "recent_documents": recent,
    }
