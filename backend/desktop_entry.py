"""Entrypoint used when the FastAPI backend is frozen into a standalone
binary (PyInstaller) and shipped as a Tauri sidecar in the desktop app.

Unlike ``run.py`` (which targets the Replit dev workflow and uses uvicorn's
reloader via an import string), this entry imports the ASGI app object
directly and runs a single, non-reloading uvicorn server. It binds to
127.0.0.1 by default so the bundled backend is only reachable from the
desktop app itself.

Configuration via environment variables (set by the Tauri Rust shell):
- ``PORT``         port to listen on (default 8765)
- ``RAG_HOST``     interface to bind (default 127.0.0.1)
- ``RAG_DATA_DIR`` writable directory for SQLite/Chroma/uploads
"""

import multiprocessing
import os


def main() -> None:
    import uvicorn

    from app.main import app

    host = os.environ.get("RAG_HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8765"))

    uvicorn.run(app, host=host, port=port, log_level="info")


if __name__ == "__main__":
    # Required so PyInstaller one-file builds don't re-launch the whole app
    # when any dependency spawns a child process.
    multiprocessing.freeze_support()
    main()
