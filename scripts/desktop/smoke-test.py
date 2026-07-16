#!/usr/bin/env python3
"""Post-build smoke test for the desktop backend sidecar.

The desktop app (Tauri shell) is useless if the frozen Python backend it
launches does not actually start. A silent packaging regression — a missing
PyInstaller hidden import, a wrong sidecar name, a broken freeze — would ship a
desktop installer that opens to a dead app. This script catches that in CI,
per OS, before a release goes out.

What it does:
  1. Locates the PyInstaller sidecar binary
     (artifacts/web/src-tauri/binaries/rag-backend-<triple>[.exe]).
  2. Launches it exactly the way the Tauri shell does at runtime — as a child
     process, binding to 127.0.0.1 on a fixed port, with a throwaway data dir.
  3. Waits for the backend to answer GET /api/health with status "ok".
  4. Issues a real (LLM-free) query — POST /api/search in keyword mode — and
     asserts a well-formed response. This proves the app can answer a request,
     not merely open a port.
  5. Shuts the process down and exits non-zero on any failure so the CI job
     fails.

Why launch the sidecar directly instead of the GUI installer: the built
.app/.msi/.deb is a windowed GUI application that cannot be reliably driven
headlessly on GitHub-hosted runners (no display, install/mount steps differ per
OS). The sidecar binary IS the thing that can silently break during packaging,
so testing it directly gives the coverage that matters with none of the GUI
flakiness. See scripts/desktop/README.md.

Uses only the Python standard library (Python 3.11 is already set up on every
CI runner) so it needs no extra dependencies.
"""

import json
import os
import platform
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

HOST = "127.0.0.1"
PORT = 8765
BASE_URL = f"http://{HOST}:{PORT}"
STARTUP_TIMEOUT_S = 120  # cold PyInstaller one-file unpack can be slow
POLL_INTERVAL_S = 1.0

ROOT = Path(__file__).resolve().parents[2]
BIN_DIR = ROOT / "artifacts" / "web" / "src-tauri" / "binaries"


def find_sidecar() -> Path:
    """Return the path to the sidecar binary built for this OS."""
    exe_suffix = ".exe" if platform.system() == "Windows" else ""
    triple = os.environ.get("TAURI_TARGET_TRIPLE")
    if triple:
        candidate = BIN_DIR / f"rag-backend-{triple}{exe_suffix}"
        if candidate.exists():
            return candidate
        sys.exit(
            f"Sidecar not found for triple '{triple}': {candidate}\n"
            f"Did scripts/desktop/build-sidecar.sh run first?"
        )

    matches = sorted(BIN_DIR.glob(f"rag-backend-*{exe_suffix}"))
    matches = [m for m in matches if m.suffix == exe_suffix or exe_suffix == ""]
    if not matches:
        sys.exit(
            f"No sidecar binary found in {BIN_DIR}.\n"
            f"Run scripts/desktop/build-sidecar.sh first."
        )
    return matches[0]


def http_get_json(path: str, timeout: float = 10.0) -> dict:
    with urllib.request.urlopen(BASE_URL + path, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def http_post_json(path: str, payload: dict, timeout: float = 30.0) -> dict:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        BASE_URL + path,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def wait_for_health(proc: subprocess.Popen) -> dict:
    """Poll /api/health until it answers ok, or the process dies / we time out."""
    deadline = time.time() + STARTUP_TIMEOUT_S
    last_err = None
    while time.time() < deadline:
        if proc.poll() is not None:
            sys.exit(
                f"Sidecar exited early with code {proc.returncode} before the "
                f"backend became reachable. Last error: {last_err}"
            )
        try:
            body = http_get_json("/api/health", timeout=5.0)
            if body.get("status") == "ok":
                return body
            last_err = f"unexpected health body: {body}"
        except (urllib.error.URLError, ConnectionError, OSError) as exc:
            last_err = repr(exc)
        time.sleep(POLL_INTERVAL_S)
    sys.exit(
        f"Backend did not become healthy within {STARTUP_TIMEOUT_S}s. "
        f"Last error: {last_err}"
    )


def main() -> None:
    sidecar = find_sidecar()
    print(f"==> Smoke-testing sidecar: {sidecar}")

    with tempfile.TemporaryDirectory(prefix="rag-smoke-") as data_dir:
        env = {
            **os.environ,
            "PORT": str(PORT),
            "RAG_HOST": HOST,
            "RAG_DATA_DIR": data_dir,
        }
        proc = subprocess.Popen([str(sidecar)], env=env)
        try:
            health = wait_for_health(proc)
            print(f"==> /api/health OK: {json.dumps(health)}")

            # A real, LLM-free request: keyword search returns a well-formed
            # (empty) result set against the fresh DB. This proves the app
            # answers a query, not just that a port is open.
            result = http_post_json(
                "/api/search",
                {"query": "smoke test", "mode": "keyword", "top_k": 3},
            )
            if result.get("mode") != "keyword" or "results" not in result:
                sys.exit(f"Unexpected /api/search response: {result}")
            print(
                f"==> /api/search OK: mode={result['mode']} "
                f"results={len(result['results'])}"
            )
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=15)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=15)

    print("==> Smoke test passed: backend launched and answered requests.")


if __name__ == "__main__":
    main()
