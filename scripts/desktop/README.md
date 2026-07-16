# Building the desktop app installers

"Local Document RAG" ships as a desktop app: a [Tauri](https://tauri.app) shell
that launches the FastAPI backend, which is frozen into a standalone binary
("sidecar") with PyInstaller.

**Neither PyInstaller nor Tauri cross-compile.** Each OS's installer must be
built on that OS:

| OS      | Installers produced        | Sidecar binary suffix |
| ------- | -------------------------- | --------------------- |
| macOS   | `.dmg`, `.app`             | (none)                |
| Windows | `.msi`, `.exe` (NSIS)      | `.exe`                |
| Linux   | `.deb`, `.AppImage`        | (none)                |

There are two supported paths: **CI (recommended)** and **manual**.

---

## Option A — GitHub Actions (recommended)

`.github/workflows/desktop-release.yml` runs a matrix across macOS (Intel +
Apple Silicon), Windows and Linux. Each job:

1. installs Node/pnpm, Python + PyInstaller, and the Rust toolchain,
2. runs `scripts/desktop/build-sidecar.sh` to freeze the backend for that OS,
3. runs [`tauri-action`](https://github.com/tauri-apps/tauri-action), which
   builds the frontend + Rust shell and bundles the native installers.

Between step 2 and step 3 each job runs a **sidecar smoke test**
(`scripts/desktop/smoke-test.py`) that launches the freshly frozen backend
sidecar and asserts it actually starts and answers requests. After step 3, the
Linux job additionally runs a **shell smoke test**
(`scripts/desktop/shell-smoke-test.py`) that launches the *built Tauri app
itself* and confirms the shell boots the backend on a runtime-selected port —
see [Per-OS smoke test](#per-os-smoke-test) below.

### How to trigger it

- **Release build:** push a tag, e.g.

  ```bash
  git tag v1.0.0
  git push origin v1.0.0
  ```

  The installers for every OS are attached to a **draft GitHub Release** named
  after the tag. Review it and publish when ready.

- **Test build (no release):** use the "Run workflow" button on the Actions tab
  (`workflow_dispatch`). It builds the installers as job logs/artifacts without
  creating a Release.

> This requires the repository to be hosted on GitHub. If it is not, use the
> manual steps below.

---

## Option B — Manual build on each OS

Prerequisites on every machine:

- Node 24 + `pnpm` (`npm i -g pnpm`)
- Python 3.11 with `pip install pyinstaller` and
  `pip install -r backend/requirements.txt`
- The Rust toolchain and Tauri's system prerequisites for that OS —
  see <https://tauri.app/start/prerequisites/>.

Then, from the repo root:

```bash
pnpm install --frozen-lockfile
scripts/desktop/build-desktop.sh
```

`build-desktop.sh` calls `build-sidecar.sh` and then `tauri build`. Output
installers land in `artifacts/web/src-tauri/target/release/bundle/`.

### macOS

```bash
scripts/desktop/build-desktop.sh
# -> target/release/bundle/dmg/*.dmg and .../macos/*.app
```

For a build that runs on both Intel and Apple Silicon, build once on each
architecture, or add `--target aarch64-apple-darwin` / `x86_64-apple-darwin`
via `TAURI_BUILD_ARGS`.

### Windows

Run from **Git Bash** (so the scripts' `bash`/`uname` work):

```bash
scripts/desktop/build-desktop.sh
# -> target/release/bundle/msi/*.msi and .../nsis/*.exe
```

`build-sidecar.sh` automatically names the sidecar with the `.exe` suffix that
Tauri expects on Windows.

### Linux

The Replit sandbox can build `.deb` but **not** `.AppImage` (AppImage needs
FUSE/`linuxdeploy`, unavailable in the sandbox). On a normal Linux desktop:

```bash
LINUX_BUNDLES="deb,appimage" scripts/desktop/build-desktop.sh
```

---

## Per-OS smoke test

A desktop installer is worthless if the app opens to a dead backend. The most
likely way that happens is a silent **packaging** regression: PyInstaller drops
a hidden import, the sidecar gets the wrong name, or the freeze breaks on one OS
only. To catch this before a release ships, every CI job runs
`scripts/desktop/smoke-test.py` right after `build-sidecar.sh` (and before the
long Tauri build, so a bad freeze fails fast).

The script:

1. locates the sidecar for the job's target triple
   (`artifacts/web/src-tauri/binaries/rag-backend-<triple>[.exe]`),
2. launches it exactly as the Tauri shell does at runtime — a child process
   bound to `127.0.0.1:8765`, with `RAG_DATA_DIR` pointed at a throwaway temp
   directory,
3. waits for `GET /api/health` to return `status: "ok"`,
4. issues a real, **LLM-free** query — `POST /api/search` in keyword mode — and
   checks the response shape. This proves the app can answer a request, not just
   that a port opened.

Any failure (sidecar missing, process exits early, health never comes up, bad
response) exits non-zero and fails that OS's job. It uses only the Python
standard library, so it needs no extra dependencies beyond the Python already
set up on the runner.

### Shell smoke test — the real runtime path

The sidecar smoke test above deliberately launches the frozen backend *itself*
on a fixed port. What it does **not** exercise is the real path users hit: the
Tauri Rust shell picking a runtime ephemeral port, spawning the sidecar via the
`externalBin` resolution, passing that port through, and exposing it to the
frontend via the `get_backend_port` command. A regression there — a wrong
sidecar path, a port that never gets passed through — would pass the sidecar
smoke test and still ship a dead app.

`scripts/desktop/shell-smoke-test.py` closes that gap. It runs **after** the
Tauri build (the shell binary must exist first) and:

1. launches the built Tauri shell binary (`target/release/local-document-rag`,
   or `RAG_APP_BIN` if set), wrapping it in `xvfb-run` on Linux because the shell
   opens a real webview window that needs a display,
2. reads the shell's stdout for the `RAG_BACKEND_PORT=<port>` line it prints (see
   `src-tauri/src/main.rs`) — the runtime-selected port, the same value
   `get_backend_port` serves to the webview,
3. asserts that port is **not** the fixed `8765` fallback, proving the shell
   really chose an ephemeral port at runtime,
4. polls `GET /api/health` on that runtime port until it answers `ok` (proving
   the shell spawned the sidecar and passed the port through), then issues the
   same LLM-free `POST /api/search` keyword query.

Run it locally after a build with:

```bash
scripts/desktop/build-desktop.sh
python scripts/desktop/shell-smoke-test.py
```

The JS half of this wiring — `resolveApiBase()` turning the `get_backend_port`
result into `http://127.0.0.1:<port>/api`, and falling back to the `/__rag`
proxy on the web — is locked by a fast unit test:

```bash
pnpm --filter @workspace/web run test:config
```

### Limitations / findings

- **The webview itself is not scripted.** The shell smoke test proves the
  Rust-side handoff (spawn + runtime port + reachability), but it does not drive
  the GUI webview or assert on rendered UI. Browser webviews can't be driven
  reliably headlessly across macOS/Windows runners, so the JavaScript
  `get_backend_port` → `resolveApiBase` URL contract is covered by the
  `test:config` unit test instead of a headless GUI click-through.
- **The shell smoke test is Linux-only in CI.** Only the Linux runner can open
  the GUI headlessly via `xvfb-run`; macOS/Windows GitHub-hosted runners have no
  reliable headless display for a windowed app. The sidecar smoke test still runs
  on every OS, so per-OS packaging regressions are still caught everywhere; the
  shell → sidecar → runtime-port handoff is verified on Linux (it is the same
  cross-platform Rust code in `main.rs`).
- **The query is LLM-free by design.** `POST /api/chat/ask` needs an LLM
  provider/API key that CI has no reason to hold, so both smoke tests use keyword
  search (pure SQLite, no model) against a fresh empty database — an empty
  result set is a success.
- **Fixed port 8765 (sidecar smoke test only).** The sidecar smoke test pins
  `PORT=8765` purely so it knows where to poll; it does not verify runtime
  port-selection. The shell smoke test is what verifies the ephemeral runtime
  port — it explicitly asserts the port is *not* 8765.

## macOS signing & notarization

Unsigned `.app`/`.dmg` bundles still install, but macOS Gatekeeper shows a
"cannot be opened because the developer cannot be verified" warning on first
launch. Users can bypass it by **right-click → Open** (then "Open" in the
dialog), or with `xattr -dr com.apple.quarantine "/Applications/Local Document RAG.app"`.

To ship a build that opens with **no warning**, sign and notarize it with an
Apple Developer account ($99/yr). `tauri-action` (and `tauri build`) pick up
signing automatically from these environment variables / GitHub secrets:

| Secret                        | What it is                                              |
| ----------------------------- | ------------------------------------------------------ |
| `APPLE_CERTIFICATE`           | base64 of your "Developer ID Application" `.p12`        |
| `APPLE_CERTIFICATE_PASSWORD`  | password for that `.p12`                                |
| `APPLE_SIGNING_IDENTITY`      | e.g. `Developer ID Application: Your Name (TEAMID)`     |
| `APPLE_ID`                    | your Apple ID email (for notarization)                  |
| `APPLE_PASSWORD`              | an app-specific password for that Apple ID              |
| `APPLE_TEAM_ID`               | your 10-character Apple Developer Team ID               |

Set these under **Settings → Secrets and variables → Actions** in GitHub (or
export them locally). When present, the mac jobs produce a signed + notarized
build; when absent, they fall back to an unsigned build automatically.

See Tauri's guide for details:
<https://tauri.app/distribute/sign/macos/>.

### Windows signing (optional)

Windows installers are unsigned by default (SmartScreen may warn on first run).
To sign, provide a code-signing certificate and configure
`bundle > windows > certificateThumbprint` (or the `TAURI_SIGNING_*` env vars)
per <https://tauri.app/distribute/sign/windows/>.
