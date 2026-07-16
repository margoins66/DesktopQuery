from functools import lru_cache

from ..config import CHROMA_DIR

_COLLECTION = "documents"


@lru_cache(maxsize=1)
def _client():
    import chromadb
    from chromadb.config import Settings

    return chromadb.PersistentClient(
        path=str(CHROMA_DIR),
        settings=Settings(anonymized_telemetry=False, allow_reset=False),
    )


def _collection():
    return _client().get_or_create_collection(
        name=_COLLECTION, metadata={"hnsw:space": "cosine"}
    )


def add_chunks(
    ids: list[str],
    embeddings: list[list[float]],
    documents: list[str],
    metadatas: list[dict],
) -> None:
    if not ids:
        return
    _collection().add(
        ids=ids, embeddings=embeddings, documents=documents, metadatas=metadatas
    )


def delete_document(document_id: int) -> None:
    _collection().delete(where={"document_id": document_id})


def query(
    embedding: list[float], top_k: int, where: dict | None = None
) -> list[dict]:
    result = _collection().query(
        query_embeddings=[embedding],
        n_results=top_k,
        where=where or None,
        include=["documents", "metadatas", "distances"],
    )
    out = []
    if not result.get("ids") or not result["ids"][0]:
        return out
    for i, chunk_uid in enumerate(result["ids"][0]):
        distance = result["distances"][0][i]
        out.append(
            {
                "chunk_uid": chunk_uid,
                "content": result["documents"][0][i],
                "metadata": result["metadatas"][0][i],
                "distance": distance,
                "score": max(0.0, 1.0 - distance),
            }
        )
    return out


def count() -> int:
    return _collection().count()
