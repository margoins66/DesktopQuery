from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, HTTPException

from ..database import db_cursor
from ..models import FolderRequest
from ..monitoring.watcher import scan_folder, watch_folder

router = APIRouter(prefix="/folders", tags=["folders"])


@router.get("")
def list_folders():
    with db_cursor() as cur:
        cur.execute("SELECT * FROM indexed_folders ORDER BY created_at DESC")
        return [{k: r[k] for k in r.keys()} for r in cur.fetchall()]


@router.post("")
def add_folder(req: FolderRequest, background_tasks: BackgroundTasks):
    path = str(Path(req.path).expanduser())
    if not Path(path).exists() or not Path(path).is_dir():
        raise HTTPException(400, "Folder does not exist on the server")
    with db_cursor() as cur:
        cur.execute(
            "INSERT OR IGNORE INTO indexed_folders (path) VALUES (?)", (path,)
        )
    background_tasks.add_task(scan_folder, path)
    watch_folder(path)
    return {"path": path, "status": "scanning"}


@router.post("/{folder_id}/rescan")
def rescan(folder_id: int, background_tasks: BackgroundTasks):
    with db_cursor() as cur:
        cur.execute("SELECT path FROM indexed_folders WHERE id=?", (folder_id,))
        row = cur.fetchone()
    if not row:
        raise HTTPException(404, "Folder not found")
    background_tasks.add_task(scan_folder, row["path"])
    return {"folder_id": folder_id, "status": "scanning"}


@router.delete("/{folder_id}")
def remove_folder(folder_id: int):
    with db_cursor() as cur:
        cur.execute("DELETE FROM indexed_folders WHERE id=?", (folder_id,))
    return {"folder_id": folder_id, "status": "removed"}
