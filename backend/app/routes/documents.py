import shutil
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, UploadFile

from ..config import SUPPORTED_EXTENSIONS, UPLOAD_DIR
from ..database import db_cursor
from ..ingestion.indexer import delete_document, index_document, register_document

router = APIRouter(prefix="/documents", tags=["documents"])


def _row_to_dict(row) -> dict:
    return {k: row[k] for k in row.keys()}


@router.get("")
def list_documents(status: str | None = None, q: str | None = None):
    sql = "SELECT * FROM documents"
    clauses, params = [], []
    if status:
        clauses.append("status = ?")
        params.append(status)
    if q:
        clauses.append("(file_name LIKE ? OR title LIKE ?)")
        params.extend([f"%{q}%", f"%{q}%"])
    if clauses:
        sql += " WHERE " + " AND ".join(clauses)
    sql += " ORDER BY created_at DESC"
    with db_cursor() as cur:
        cur.execute(sql, params)
        return [_row_to_dict(r) for r in cur.fetchall()]


@router.get("/{document_id}")
def get_document(document_id: int):
    with db_cursor() as cur:
        cur.execute("SELECT * FROM documents WHERE id=?", (document_id,))
        row = cur.fetchone()
    if not row:
        raise HTTPException(404, "Document not found")
    return _row_to_dict(row)


@router.get("/{document_id}/chunks")
def get_chunks(document_id: int):
    with db_cursor() as cur:
        cur.execute(
            "SELECT chunk_index, content, page_number, heading FROM document_chunks "
            "WHERE document_id=? ORDER BY chunk_index",
            (document_id,),
        )
        return [_row_to_dict(r) for r in cur.fetchall()]


@router.post("/upload")
async def upload_documents(
    background_tasks: BackgroundTasks, files: list[UploadFile] = File(...)
):
    results = []
    for upload in files:
        ext = Path(upload.filename).suffix.lower()
        if ext not in SUPPORTED_EXTENSIONS:
            results.append(
                {"file_name": upload.filename, "status": "skipped", "reason": "unsupported type"}
            )
            continue
        safe_name = Path(upload.filename).name
        dest = UPLOAD_DIR / safe_name
        counter = 1
        while dest.exists():
            dest = UPLOAD_DIR / f"{Path(safe_name).stem}_{counter}{ext}"
            counter += 1
        with open(dest, "wb") as out:
            shutil.copyfileobj(upload.file, out)
        doc_id = register_document(str(dest), dest.name, source="upload")
        background_tasks.add_task(index_document, doc_id)
        results.append(
            {"document_id": doc_id, "file_name": dest.name, "status": "indexing"}
        )
    return {"results": results}


@router.post("/{document_id}/reindex")
def reindex(document_id: int, background_tasks: BackgroundTasks):
    with db_cursor() as cur:
        cur.execute("SELECT id FROM documents WHERE id=?", (document_id,))
        if not cur.fetchone():
            raise HTTPException(404, "Document not found")
    background_tasks.add_task(index_document, document_id)
    return {"document_id": document_id, "status": "indexing"}


@router.delete("/{document_id}")
def remove_document(document_id: int):
    delete_document(document_id)
    return {"document_id": document_id, "status": "deleted"}
