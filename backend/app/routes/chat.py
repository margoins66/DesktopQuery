import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from ..database import db_cursor
from ..models import AskRequest, ConversationCreate
from ..rag.pipeline import stream_answer

router = APIRouter(prefix="/chat", tags=["chat"])


@router.get("/conversations")
def list_conversations():
    with db_cursor() as cur:
        cur.execute("SELECT * FROM conversations ORDER BY updated_at DESC")
        return [{k: r[k] for k in r.keys()} for r in cur.fetchall()]


@router.post("/conversations")
def create_conversation(req: ConversationCreate):
    with db_cursor() as cur:
        cur.execute(
            "INSERT INTO conversations (title) VALUES (?)",
            (req.title or "New conversation",),
        )
        conv_id = cur.lastrowid
        cur.execute("SELECT * FROM conversations WHERE id=?", (conv_id,))
        row = cur.fetchone()
    return {k: row[k] for k in row.keys()}


@router.get("/conversations/{conversation_id}/messages")
def get_messages(conversation_id: int):
    with db_cursor() as cur:
        cur.execute(
            "SELECT * FROM messages WHERE conversation_id=? ORDER BY id",
            (conversation_id,),
        )
        rows = cur.fetchall()
    messages = []
    for r in rows:
        m = {k: r[k] for k in r.keys()}
        m["citations"] = json.loads(m["citations"]) if m["citations"] else []
        messages.append(m)
    return messages


@router.patch("/conversations/{conversation_id}/bookmark")
def toggle_bookmark(conversation_id: int):
    with db_cursor() as cur:
        cur.execute(
            "UPDATE conversations SET bookmarked = 1 - bookmarked WHERE id=?",
            (conversation_id,),
        )
        cur.execute("SELECT bookmarked FROM conversations WHERE id=?", (conversation_id,))
        row = cur.fetchone()
    if not row:
        raise HTTPException(404, "Conversation not found")
    return {"conversation_id": conversation_id, "bookmarked": row["bookmarked"]}


@router.delete("/conversations/{conversation_id}")
def delete_conversation(conversation_id: int):
    with db_cursor() as cur:
        cur.execute("DELETE FROM conversations WHERE id=?", (conversation_id,))
    return {"conversation_id": conversation_id, "status": "deleted"}


@router.post("/ask")
def ask(req: AskRequest):
    conversation_id = req.conversation_id
    with db_cursor() as cur:
        if conversation_id is None:
            cur.execute(
                "INSERT INTO conversations (title) VALUES (?)",
                (req.question[:60],),
            )
            conversation_id = cur.lastrowid
        cur.execute(
            "INSERT INTO messages (conversation_id, role, content) VALUES (?, 'user', ?)",
            (conversation_id, req.question),
        )

    def event_stream():
        yield _sse({"type": "meta", "conversation_id": conversation_id})
        final_answer = ""
        final_citations = []
        for event in stream_answer(
            req.question, req.document_ids, req.top_k, conversation_id
        ):
            if event["type"] == "done":
                final_answer = event["answer"]
            if event["type"] == "citations":
                final_citations = event["citations"]
            yield _sse(event)
        with db_cursor() as cur:
            cur.execute(
                "INSERT INTO messages (conversation_id, role, content, citations) "
                "VALUES (?, 'assistant', ?, ?)",
                (conversation_id, final_answer, json.dumps(final_citations)),
            )
            cur.execute(
                "UPDATE conversations SET updated_at=datetime('now') WHERE id=?",
                (conversation_id,),
            )

    return StreamingResponse(event_stream(), media_type="text/event-stream")


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"
