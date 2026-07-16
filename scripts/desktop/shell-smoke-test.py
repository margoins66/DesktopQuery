#!/usr/bin/env python3
"""Shell-level smoke test for the desktop app.

This is the companion to ``smoke-test.py`` and closes the gap that one leaves.

``smoke-test.py`` launches the frozen PyInstaller *sidecar directly* on a fixed
port (127.0.0.1:8765). That proves the freeze itself is not broken, but it does
NOT exercise the real runtime path a user hits:

  Tauri Rust shell  ->  pick_free_port() (runtime ephemeral port)
                    ->  spawn the sidecar via the `externalBin` resolution
                    ->  pass the chosen PORT through to the sidecar
                    ->  expose it to the webview via `get_backend_port`
                    ->  frontend gates on health (BackendGate/resolveApiBase)

A regression in *that* handoff — a wrong externalBin path, the port not being
passed through, an ephemeral port that never gets used — would sail past the
sidecar-only smoke test and ship a desktop app that opens to a dead backend.

What this script does instead:
  1. Runs the actual built Tauri shell binary (the Rust app), NOT the sidecar.
     On Linux (CI / a headless machine) it wraps it in ``xvfb-run`` because the
     shell creates a real webview window that needs a display.
  2. Reads the shell's stdout for the ``RAG_BACKEND_PORT=<port>`` line the shell
     prints (see src-tauri/src/main.rs). That is the runtime-selected ephemeral
     port and is exactly the value ``get_backend_port`` serves to the frontend.
  3. Asserts the port is NOT the fixed 8765 fallback — proving the shell really
     chose an ephemeral port at runtime rather than a build-time constant.
  4. Polls ``GET /api/health`` on that runtime port until it answers ``ok`` —
     proving the shell spawned the sidecar (correct externalBin path) and passed
     the port through so the backend is reachable exactly where the frontend
     would look.
  5. Issues the same LLM-free ``POST /api/search`` (keyword mode) as the sidecar
     smoke test, so it also proves the app answers a request, not just opens a
     port.
  6. Tears the shell down (which kills the sidecar via the shell's exit handler).

Headless-GUI limitation: the webview itself (and therefore the JavaScript call
to ``get_backend_port`` inside ``resolveApiBase()``) is not scripted here — GUI
webviews cannot be driven reliably headlessly across macOS/Windows CI runners.
That JS URL contract is locked separately by the ``test:config`` unit test. This
script covers the Rust-side half (spawn + runtime port + reachability) that the
unit test cannot. See scripts/desktop/README.md "Per-OS smoke test".

Uses only the Python standard library.
"""

import json
import os
import platform
import shutil
import signal
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

HOST = "127.0.0.1"
# The last-resort fixed fallback the Rust shell only uses if the OS refuses an
# ephemeral port (see FALLBACK_PORT in src-tauri/src/main.rs), and the port the
# sidecar-only smoke test pins. The whole point of this test is to prove the
# shell picks something OTHER than this at runtime.
FALLBACK_PORT = 8765
STARTUP_TIMEOUT_S = 180  # cold PyInstaller one-file unpack + shell boot is slow
PORT_DISCOVERY_TIMEOUT_S = 90
POLL_INTERVAL_S = 1.0

ROOT = Path(__file__).resolve().parents[2]
TAURI_DIR = ROOT / "artifacts" / "web" / "src-tauri"
BIN_DIR = TAURI_DIR / "binaries"
RELEASE_DIR = TAURI_DIR / "target" / "release"


def rustc_triple() -> str:
    triple = os.environ.get("TAURI_TARGET_TRIPLE")
    if triple:
        return triple
    try:
        out = subprocess.check_output(["rustc", "-Vv"], text=True)
    except (OSError, subprocess.CalledProcessError):
        return ""
    for line in out.splitlines():
        if line.startswith("host: "):
            return line[len("host: ") :].strip()
    return ""


def find_app_binary() -> Path:
    """Return the built Tauri shell binary to run."""
    override = os.environ.get("RAG_APP_BIN")
    if override:
        p = Path(override)
        if not p.exists():
            sys.exit(f"RAG_APP_BIN does not exist: {p}")
        return p

    exe_suffix = ".exe" if platform.system() == "Windows" else ""
    candidate = RELEASE_DIR / f"local-document-rag{exe_suffix}"
    if candidate.exists():
        return candidate

    sys.exit(
        f"Built Tauri shell binary not found: {candidate}\n"
        f"Run scripts/desktop/build-desktop.sh (or `tauri build`) first, or set "
        f"RAG_APP_BIN to the installed app binary."
    )


def ensure_sidecar_next_to(app_bin: Path) -> None:
    """Place the sidecar next to the shell binary so `sidecar()` resolves it.

    A packaged install ships the sidecar alongside the main binary. When running
    the raw ``target/release`` binary we replicate that by copying the built
    sidecar next to it under both the plain and triple-suffixed names Tauri may
    look for. If a copy is already present (e.g. an installed app) this is a
    no-op.
    """
    exe_suffix = ".exe" if platform.system() == "Windows" else ""
    triple = rustc_triple()
    src = BIN_DIR / f"rag-backend-{triple}{exe_suffix}" if triple else None

    wanted = [app_bin.parent / f"rag-backend{exe_suffix}"]
    if triple:
        wanted.append(app_bin.parent / f"rag-backend-{triple}{exe_suffix}")

    if any(w.exists() for w in wanted):
        return  # already alongside the binary (packaged install or prior copy)

    if not src or not src.exists():
        sys.exit(
            f"Sidecar not found next to {app_bin} and none in {BIN_DIR}.\n"
            f"Run scripts/desktop/build-sidecar.sh first."
        )
    for dst in wanted:
        shutil.copy2(src, dst)
        os.chmod(dst, 0o755)
        print(f"==> Placed sidecar next to shell binary: {dst}")


def launch_shell(app_bin: Path) -> subprocess.Popen:
    """Launch the shell, wrapping in xvfb-run on Linux (needs a display)."""
    cmd = [str(app_bin)]
    if platform.system() == "Linux" and not os.environ.get("DISPLAY"):
        if shutil.which("xvfb-run") is None:
            sys.exit(
                "xvfb-run is required to run the GUI shell headlessly on Linux "
                "but was not found. Install it (apt-get install -y xvfb) or run "
                "on a machine with a display."
            )
        cmd = ["xvfb-run", "-a", str(app_bin)]

    print(f"==> Launching desktop shell: {' '.join(cmd)}")
    return subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        start_new_session=True,  # own process group so we can kill xvfb + app
    )


def stream_output(proc: subprocess.Popen, sink: list, port_box: dict) -> None:
    """Drain the shell's combined output, echoing it and capturing the port."""
    assert proc.stdout is not None
    for line in proc.stdout:
        sink.append(line)
        sys.stdout.write(f"[shell] {line}")
        sys.stdout.flush()
        if "port" not in port_box:
            marker = "RAG_BACKEND_PORT="
            idx = line.find(marker)
            if idx != -1:
                digits = ""
                for ch in line[idx + len(marker) :]:
                    if ch.isdigit():
                        digits += ch
                    else:
                        break
                if digits:
                    port_box["port"] = int(digits)


def http_get_json(base: str, path: str, timeout: float = 10.0) -> dict:
    with urllib.request.urlopen(base + path, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def http_post_json(base: str, path: str, payload: dict, timeout: float = 30.0) -> dict:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        base + path,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def terminate(proc: subprocess.Popen) -> None:
    if proc.poll() is not None:
        return
    try:
        os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
    except (ProcessLookupError, PermissionError):
        proc.terminate()
    try:
        proc.wait(timeout=20)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
        except (ProcessLookupError, PermissionError):
            proc.kill()
        proc.wait(timeout=20)


def main() -> None:
    app_bin = find_app_binary()
    print(f"==> Smoke-testing desktop SHELL (not the sidecar): {app_bin}")
    ensure_sidecar_next_to(app_bin)

    proc = launch_shell(app_bin)
    output: list = []
    port_box: dict = {}
    reader = threading.Thread(
        target=stream_output, args=(proc, output, port_box), daemon=True
    )
    reader.start()

    try:
        # 1. Wait for the shell to announce the runtime-selected port.
        deadline = time.time() + PORT_DISCOVERY_TIMEOUT_S
        while "port" not in port_box and time.time() < deadline:
            if proc.poll() is not None:
                sys.exit(
                    f"Shell exited early with code {proc.returncode} before it "
                    f"announced a backend port. Output:\n{''.join(output)}"
                )
            time.sleep(POLL_INTERVAL_S)
        if "port" not in port_box:
            sys.exit(
                "Shell never printed RAG_BACKEND_PORT=<port>. Did main.rs change? "
                f"Output:\n{''.join(output)}"
            )

        port = port_box["port"]
        base = f"http://{HOST}:{port}"
        print(f"==> Shell selected runtime backend port: {port}")

        # 2. Prove it is a runtime ephemeral port, not the fixed fallback the
        #    sidecar-only smoke test pins.
        if port == FALLBACK_PORT:
            sys.exit(
                f"Shell reported the fixed fallback port {FALLBACK_PORT}; expected "
                f"a runtime-selected ephemeral port. The runtime port-selection "
                f"path did not run."
            )

        # 3. Health must come up on THAT runtime port (proves spawn + passthrough).
        health = None
        deadline = time.time() + STARTUP_TIMEOUT_S
        last_err = None
        while time.time() < deadline:
            if proc.poll() is not None:
                sys.exit(
                    f"Shell exited (code {proc.returncode}) before the backend "
                    f"became healthy. Last error: {last_err}\n"
                    f"Output:\n{''.join(output)}"
                )
            try:
                body = http_get_json(base, "/api/health", timeout=5.0)
                if body.get("status") == "ok":
                    health = body
                    break
                last_err = f"unexpected health body: {body}"
            except (urllib.error.URLError, ConnectionError, OSError) as exc:
                last_err = repr(exc)
            time.sleep(POLL_INTERVAL_S)
        if health is None:
            sys.exit(
                f"Backend never became healthy on the shell's runtime port {port} "
                f"within {STARTUP_TIMEOUT_S}s. Last error: {last_err}\n"
                f"Output:\n{''.join(output)}"
            )
        print(f"==> /api/health OK on runtime port {port}: {json.dumps(health)}")

        # 4. A real, LLM-free request against the shell-launched backend.
        result = http_post_json(
            base,
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
        terminate(proc)

    print(
        "==> Shell smoke test passed: the Tauri shell spawned the backend on a "
        "runtime-selected port and answered requests there."
    )


if __name__ == "__main__":
    main()
