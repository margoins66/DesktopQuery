import hashlib
import threading
import uuid
from pathlib import Path

from ..config import UPLOAD_DIR
from ..database import db_cursor
from ..providers import vectorstore
from ..providers.embeddings import active_embedding_signature, get_embedding_provider
from ..services.settings_service import get_settings_raw
from .chunking import chunk_blocks
from .parsers import file_stats, parse_file

_index_lock = threading.Lock()


def _hash_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(65536), b""):
            h.update(block)
    return h.hexdigest()


def register_document(
    stored_path: str,
    file_name: str,
    folder_path: str | None = None,
    source: str = "upload",
) -> int:
    stats = file_stats(stored_path)
    content_hash = _hash_file(stored_path)
    ext = Path(file_name).suffix.lower().lstrip(".")
    with db_cursor() as cur:
        cur.execute(
            """INSERT OR IGNORE INTO documents
            (file_name, title, file_type, folder_path, stored_path, source,
             document_type, file_size, file_created, file_modified, status, content_hash)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)""",
            (
                file_name,
                Path(file_name).stem,
                ext,
                folder_path,
                stored_path,
                source,
                ext,
                stats["file_size"],
                stats["file_created"],
                stats["file_modified"],
                content_hash,
            ),
        )
        cur.execute("SELECT id FROM documents WHERE stored_path = ?", (stored_path,))
        return cur.fetchone()["id"]


def index_document(document_id: int) -> dict:
    with _index_lock:
        return _index_document_locked(document_id)


def _index_document_locked(document_id: int) -> dict:
    settings = get_settings_raw()
    with db_cursor() as cur:
        cur.execute("SELECT * FROM documents WHERE id = ?", (document_id,))
        doc = cur.fetchone()
    if not doc:
        raise ValueError("Document not found")

    try:
        with db_cursor() as cur:
            cur.execute(
                "UPDATE documents SET status='indexing', error_message=NULL WHERE id=?",
                (document_id,),
            )

        parsed = parse_file(doc["stored_path"])
        chunk_size = int(settings.get("chunk_size", "1000"))
        overlap = int(settings.get("chunk_overlap", "150"))
        chunks = chunk_blocks(parsed.blocks, chunk_size, overlap)

        if not chunks:
            with db_cursor() as cur:
                cur.execute(
                    "UPDATE documents SET status='failed', "
                    "error_message='No extractable text found' WHERE id=?",
                    (document_id,),
                )
            return {"document_id": document_id, "status": "failed", "chunks": 0}

        vectorstore.delete_document(document_id)
        with db_cursor() as cur:
            cur.execute(
                "DELETE FROM document_chunks WHERE document_id=?", (document_id,)
            )

        embedder = get_embedding_provider(settings)
        texts = [c["content"] for c in chunks]
        embeddings = embedder.embed(texts)

        ids, metadatas = [], []
        with db_cursor() as cur:
            for i, chunk in enumerate(chunks):
                chunk_uid = uuid.uuid4().hex
                cur.execute(
                    """INSERT INTO document_chunks
                    (document_id, chunk_index, chunk_uid, content, page_number,
                     heading, token_count)
                    VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (
                        document_id,
                        i,
                        chunk_uid,
                        chunk["content"],
                        chunk["page_number"],
                        chunk["heading"],
                        chunk["token_count"],
                    ),
                )
                ids.append(chunk_uid)
                metadatas.append(
                    {
                        "document_id": document_id,
                        "document_name": doc["file_name"],
                        "document_type": doc["document_type"] or "",
                        "vendor": doc["vendor"] or "",
                        "chunk_index": i,
                        "page_number": chunk["page_number"] or 0,
                        "heading": chunk["heading"] or "",
                    }
                )

        vectorstore.add_chunks(ids, embeddings, texts, metadatas)

        title = parsed.title or doc["title"]
        with db_cursor() as cur:
            cur.execute(
                """UPDATE documents SET status='indexed', chunk_count=?,
                indexed_at=datetime('now'), title=?, author=?,
                updated_at=datetime('now') WHERE id=?""",
                (len(chunks), title, parsed.author, document_id),
            )
        return {
            "document_id": document_id,
            "status": "indexed",
            "chunks": len(chunks),
            "embedding": active_embedding_signature(settings),
        }
    except Exception as exc:
        with db_cursor() as cur:
            cur.execute(
                "UPDATE documents SET status='failed', error_message=? WHERE id=?",
                (str(exc)[:500], document_id),
            )
        raise


def delete_document(document_id: int) -> None:
    with db_cursor() as cur:
        cur.execute(
            "SELECT stored_path, source FROM documents WHERE id=?", (document_id,)
        )
        row = cur.fetchone()
    vectorstore.delete_document(document_id)
    with db_cursor() as cur:
        cur.execute("DELETE FROM documents WHERE id=?", (document_id,))
    if row and row["stored_path"] and row["source"] == "upload":
        try:
            p = Path(row["stored_path"]).resolve()
            if p.is_file() and p.is_relative_to(UPLOAD_DIR.resolve()):
                p.unlink(missing_ok=True)
        except Exception:
            pass
