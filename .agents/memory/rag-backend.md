---
name: RAG backend contract
description: Non-obvious invariants and intent for the local-first RAG backend (backend/, FastAPI).
---

# RAG backend (`backend/`, FastAPI)

## Strict grounding contract — do NOT weaken
The product requires answers grounded ONLY in indexed documents.
- If retrieval is empty or unsupported, return the EXACT fallback sentence (defined once in `rag/prompts.py`).
- Every grounded answer must carry citations: document name, page, heading, quoted text, confidence.
- Grounding is enforced by a similarity threshold (drop weak chunks before the LLM) plus a strict system prompt that instructs the model to emit the fallback verbatim. A harder entailment/citation-coverage guard was deliberately NOT added — it risks false fallbacks on valid answers.

**Why:** user requirement — never fabricate. All higher-level features (summaries, comparison, risk) must reuse the same retrieve→ground→cite path, never bypass it.

## Provider-swap seam + Tauri intent
- LLM / embeddings / vector-store all go through interfaces in `app/providers/`.
- **Why:** the app is hybrid — web on Replit now, later wrapped in Tauri with fully-local Ollama models. The Python backend is kept independent of the Node `api-server` scaffold so it can become a Tauri sidecar unchanged.
- **How to apply:** add new providers behind the provider base interfaces; never call vendor SDKs directly from routes or the RAG pipeline.

## Defaults & quirks
- Embeddings default = **local** (ChromaDB default MiniLM). It downloads an ONNX model on first use; this works on Replit (cached under `~/.cache/chroma`), so indexing/search work with NO API key.
- LLM default = OpenAI using the user's own `OPENAI_API_KEY` against the real OpenAI API (NOT the Replit AI-integration proxy). Use real OpenAI model names, not proxy model names.
- Inactive providers (Ollama when unreachable) report status `coming_soon` — never fake them.
- API keys resolve from settings→env and are never returned to clients (only `*_set` booleans).

## Concurrency rules (folder monitoring)
- Folder indexing is funneled through a single background queue worker, and `index_document` holds a process-wide lock. **Why:** watchdog fires create+modify in bursts; unbounded per-event threads caused duplicate rows, interleaved chunk delete/insert, and per-thread SQLite connection leaks. Keep indexing serialized.
- Deleting a document only unlinks the file when it is a managed upload inside the uploads dir — never delete user-owned files discovered via monitored folders.
