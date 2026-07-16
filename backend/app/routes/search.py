from fastapi import APIRouter

from ..models import SearchRequest
from ..rag.pipeline import chunks_to_citations, keyword_search, retrieve

router = APIRouter(prefix="/search", tags=["search"])


@router.post("")
def search(req: SearchRequest):
    if req.mode == "keyword":
        rows = keyword_search(
            req.query,
            req.document_ids,
            req.top_k,
            req.document_type,
            req.vendor,
        )
        results = [
            {
                "document_id": r["document_id"],
                "document_name": r["document_name"],
                "page_number": r["page_number"],
                "heading": r["heading"],
                "quoted_text": (r["content"][:320] + "…")
                if len(r["content"]) > 320
                else r["content"],
                "confidence": None,
            }
            for r in rows
        ]
        return {"mode": "keyword", "results": results}

    chunks = retrieve(
        req.query,
        req.document_ids,
        req.top_k,
        req.document_type,
        req.vendor,
    )
    return {"mode": "semantic", "results": chunks_to_citations(chunks)}
