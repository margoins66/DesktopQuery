import logging
import queue
import threading
from pathlib import Path

from ..config import SUPPORTED_EXTENSIONS
from ..database import db_cursor

_log = logging.getLogger("rag.watcher")
_observer = None
_lock = threading.Lock()
_task_queue: "queue.Queue[tuple[str, str]]" = queue.Queue()
_worker_started = False


def _worker():
    from ..ingestion.indexer import index_document, register_document

    while True:
        path, folder = _task_queue.get()
        try:
            doc_id = register_document(path, Path(path).name, folder, source="folder")
            index_document(doc_id)
        except Exception as exc:
            _log.warning("Failed to index %s: %s", path, exc)
        finally:
            _task_queue.task_done()


def _ensure_worker():
    global _worker_started
    with _lock:
        if not _worker_started:
            threading.Thread(target=_worker, daemon=True).start()
            _worker_started = True


def _enqueue(path: str, folder: str):
    _ensure_worker()
    _task_queue.put((path, folder))


def scan_folder(folder: str) -> int:
    count = 0
    base = Path(folder)
    if not base.exists():
        return 0
    for p in base.rglob("*"):
        if p.is_file() and p.suffix.lower() in SUPPORTED_EXTENSIONS:
            _enqueue(str(p), folder)
            count += 1
    with db_cursor() as cur:
        cur.execute(
            "UPDATE indexed_folders SET last_scanned=datetime('now') WHERE path=?",
            (folder,),
        )
    return count


def _make_handler():
    from watchdog.events import FileSystemEventHandler

    class Handler(FileSystemEventHandler):
        def on_created(self, event):
            self._handle(event)

        def on_modified(self, event):
            self._handle(event)

        def _handle(self, event):
            if event.is_directory:
                return
            path = event.src_path
            if Path(path).suffix.lower() in SUPPORTED_EXTENSIONS:
                _enqueue(path, str(Path(path).parent))

    return Handler()


def start_watchers():
    global _observer
    _ensure_worker()
    with _lock:
        try:
            from watchdog.observers import Observer
        except Exception:
            return
        if _observer is not None:
            return
        _observer = Observer()
        handler = _make_handler()
        with db_cursor() as cur:
            cur.execute("SELECT path FROM indexed_folders WHERE enabled=1")
            folders = [r["path"] for r in cur.fetchall()]
        scheduled = False
        for folder in folders:
            if Path(folder).exists():
                _observer.schedule(handler, folder, recursive=True)
                scheduled = True
        if scheduled:
            _observer.start()


def watch_folder(folder: str):
    global _observer
    _ensure_worker()
    with _lock:
        if _observer is None:
            pass
        elif Path(folder).exists():
            try:
                _observer.schedule(_make_handler(), folder, recursive=True)
            except Exception as exc:
                _log.warning("Failed to watch %s: %s", folder, exc)
    if _observer is None:
        start_watchers()
