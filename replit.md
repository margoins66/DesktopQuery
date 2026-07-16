# Local Document RAG

A local-first Retrieval-Augmented Generation app for contracts and business documents. Index documents, then ask questions, summarize, compare, and run risk analysis — with answers grounded strictly in the indexed documents (never fabricated) and full citations.

## Run & Operate

### RAG backend (Python / FastAPI) — the real product backend
- Workflow **"RAG Backend"** runs `cd backend && PORT=8000 python run.py` (port 8000).
- Health check: `GET /api/health`. Interactive API docs: `/api/docs`.
- Python 3.11. Install deps: `pip install -r backend/requirements.txt` (system dep: `tesseract` for OCR).
- Runtime data (SQLite, ChromaDB, uploads) lives in `backend/data/` (gitignored). Override with `RAG_DATA_DIR`.
- Required for cloud LLM: `OPENAI_API_KEY` secret (or `ANTHROPIC_API_KEY`). Embeddings default to a **local** model (no key needed).

### Scaffold Node api-server (unused by RAG)
- `pnpm --filter @workspace/api-server run dev` — the original monorepo scaffold (port 8080). The RAG app does NOT depend on it.

### Desktop app (Tauri) — installable build
- The web frontend can be packaged as a native desktop app (Windows/macOS/Linux) that bundles the Python backend as a sidecar, so end users need no dev server.
- One-shot build: `bash scripts/desktop/build-desktop.sh` (run on the OS you are targeting — PyInstaller and Tauri do not cross-compile).
  1. `scripts/desktop/build-sidecar.sh` freezes `backend/` into a single binary via PyInstaller → `artifacts/web/src-tauri/binaries/rag-backend-<target-triple>`.
  2. Tauri builds the Vite frontend (with `VITE_API_BASE_URL=http://127.0.0.1:8765/api`) and the Rust shell into an OS installer under `artifacts/web/src-tauri/target/release/bundle/`.
- The Rust shell (`artifacts/web/src-tauri/src/main.rs`) spawns the sidecar on `127.0.0.1:8765`, points it at the per-user app-data dir via `RAG_DATA_DIR`, and kills it on exit.
- On Linux, native build libs (webkit2gtk-4.1, gtk3, libsoup3, librsvg) are provided through `scripts/desktop/shell.nix`; the build script enters that nix-shell automatically. On macOS/Windows install the standard Tauri prerequisites instead.
- Note: OCR (tesseract) is a system dependency and is NOT bundled — OCR-on-scanned-PDF degrades gracefully if tesseract isn't installed on the user's machine.

## Stack

- **Backend**: Python 3.11, FastAPI, SQLite, ChromaDB (vector store).
- **LLM providers** (swappable via Settings): OpenAI (default `gpt-4o-mini`), Anthropic Claude, Ollama (local; shown "Coming Soon" until reachable).
- **Embeddings** (swappable): local MiniLM via ChromaDB default (default), OpenAI embeddings.
- **Parsing**: PyMuPDF (PDF + OCR fallback via pytesseract), python-docx, openpyxl, python-pptx, BeautifulSoup, striprtf, CSV/TXT/MD.
- **Exports**: Word (python-docx), Excel (openpyxl), PDF (reportlab).
- Frontend (React + TS + Tailwind) is a separate downstream task.

## Where things live

- `backend/app/main.py` — FastAPI app; all routers mounted under `/api`.
- `backend/app/providers/` — swappable LLM / embedding / vector-store interfaces (`base.py` + implementations). This is the seam for later swapping to local Ollama models.
- `backend/app/ingestion/` — `parsers.py` (per-format), `chunking.py`, `indexer.py` (parse → chunk → embed → store).
- `backend/app/rag/` — `prompts.py` (system rules + fallback), `pipeline.py` (retrieve + answer + citations), `summaries.py`, `comparisons.py`, `risk.py`.
- `backend/app/routes/` — one module per surface (documents, folders, search, chat, analysis, settings, dashboard, exports, health).
- `backend/app/database.py` — SQLite schema (documents, document_chunks, conversations, messages, indexed_folders, settings, tags, document_tags).
- `backend/app/monitoring/watcher.py` — watchdog-based folder monitoring (maps onto local OS folders for the future Tauri build).

## Architecture decisions

- **Hybrid path**: built as a web app on Replit now, structured so it can later be wrapped in Tauri and swapped to fully-local Ollama models. Everything routes through provider interfaces to make that swap mechanical.
- **Python backend is deliberately independent** of the Node `api-server` scaffold so it can be lifted into a Tauri sidecar unchanged.
- **Strict RAG contract** (do not weaken): answers come only from retrieved chunks; if unsupported, return the EXACT sentence `I could not locate that information in the indexed documents.`; every grounded answer carries citations (document name, page, heading, quoted text, confidence). Low-similarity retrievals are dropped before the LLM call, and the LLM is instructed to emit the fallback verbatim.
- **Embeddings local by default** so indexing/search work with no API key; LLM defaults to cloud OpenAI.
- **Security**: `local_only` setting + cloud-AI flag surfaced via settings; API keys resolved from secrets/env and never returned to clients (only a `*_set` boolean).

## User preferences

- No fake/placeholder results. Inactive features must be labeled "Coming Soon" rather than faked.

## Pointers

- See the `pnpm-workspace` skill for workspace structure and the eventual frontend package layout.
