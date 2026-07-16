---
name: Desktop (Tauri) packaging
description: How the RAG app is packaged as a desktop installer, and the non-obvious build-environment gotchas.
---

# Desktop packaging (Tauri + Python sidecar)

The web artifact (`artifacts/web`) is wrapped by a Tauri shell in
`artifacts/web/src-tauri`. The Python FastAPI backend ships as a PyInstaller
one-file binary ("sidecar") that the Rust shell launches on `127.0.0.1`. The
port is chosen at RUNTIME (bind to port 0, take the ephemeral port) to avoid
clashing with whatever else is on the user's machine — do NOT reintroduce a
fixed build-time port. The shell exposes it via the `get_backend_port` command;
the frontend reads it in `resolveApiBase()` (config.ts) and gates the app behind
a startup screen until health passes (`BackendGate`). The desktop build no
longer sets `VITE_API_BASE_URL` — the runtime port is the single source of
truth; the web/dev path still uses the `/__rag` proxy.

Build entry: `scripts/desktop/build-desktop.sh` (sidecar → frontend+shell).

## Non-obvious gotchas (the parts that cost time)

- **Long builds MUST run as a Replit workflow, not detached bash.** `nohup`/
  `setsid` background processes started from the bash tool get torn down when
  the bash call returns (and again on any package install that reboots
  workflows). A `configureWorkflow` command that runs the build then
  `sleep 100000` survives; poll it with `getWorkflowStatus`. This was the single
  biggest blocker. (Not OOM — container had ~11Gi free.)

- **Linux native libs come from nix-shell, not the ambient env.** Adding
  `webkitgtk_4_1`/`gtk3`/`libsoup_3` via the package manager registers them in
  `replit.nix` but does NOT put their `.pc` files on the running shell's
  `PKG_CONFIG_PATH`. Build inside `nix-shell scripts/desktop/shell.nix` so
  pkg-config/linking find webkit2gtk-4.1.

- **AppImage bundling fails in the sandbox** (`failed to run linuxdeploy` —
  needs FUSE). `.deb` builds fine. So the Linux build defaults to
  `--bundles deb`; AppImage/rpm are opt-in (`LINUX_BUNDLES=...`) on a real
  desktop. `tauri.conf.json` keeps `"targets": "all"` so mac/win still get
  their native installers.

- **PyInstaller emits `libstdc++.so.6 could not resolve` warnings** under
  NixOS — harmless: normal Linux desktops provide it system-wide at runtime.

- **OCR (tesseract) is a system dep and is NOT bundled** into the sidecar; it
  degrades gracefully if absent on the user's machine.

- **Verifying Rust changes without a full sidecar build:** `cargo check` fails
  early in tauri-build if the `externalBin` (`binaries/rag-backend-<triple>`)
  is missing — before your `main.rs` is even compiled. Drop a throwaway
  executable file at that path (it's gitignored) so the check proceeds and
  actually type-checks `main.rs`, then delete it. Run cargo inside
  `nix-shell scripts/desktop/shell.nix` as a workflow (deps are ~500 crates
  cold; warm cache is seconds).

- Generated artifacts are gitignored: `artifacts/web/src-tauri/{target,binaries,gen}`
  and `backend/{build,dist,*.spec}`. The sidecar binary (~178MB) and `.deb`
  (~171MB) must never be committed.

## Cross-platform installers (win/mac) — build ONLY on those OSes

- PyInstaller + Tauri do NOT cross-compile. Windows/macOS installers are built
  via the GitHub Actions matrix in `.github/workflows/desktop-release.yml`
  (tauri-action; runners: macos-latest arm64, macos-13 intel, windows-latest,
  ubuntu-22.04). Tag push `v*` → draft Release; manual dispatch → build only.
- **Sidecar name must carry `.exe` on Windows.** Tauri resolves externalBin
  `binaries/rag-backend` to `rag-backend-<triple>.exe`, so `build-sidecar.sh`
  appends `EXE_SUFFIX` when `uname -s` is MINGW*/MSYS*/CYGWIN*. Run it under Git
  Bash on Windows. macOS/Linux have no suffix.
- macOS: unsigned build opens with a Gatekeeper warning (right-click→Open or
  `xattr -dr com.apple.quarantine`). Signing/notarization is opt-in via
  `APPLE_*` secrets consumed by tauri-action. Full docs: `scripts/desktop/README.md`.
- **CI smoke test runs the sidecar directly, not the GUI.** GUI installers can't
  be driven headlessly on runners, so `scripts/desktop/smoke-test.py` launches
  the frozen sidecar (pinned to 127.0.0.1:8765), waits for `/api/health`, and
  does an LLM-free `POST /api/search` (keyword mode → empty DB is a pass; the
  chat/ask LLM path needs keys CI lacks). It runs before the Tauri build so a
  bad PyInstaller freeze fails fast.

- **Shell-level handoff coverage** (the sidecar smoke test does NOT cover it):
  the shell picks the port and prints `RAG_BACKEND_PORT=<port>` on stdout
  (main.rs) so `scripts/desktop/shell-smoke-test.py` can launch the built shell
  binary (xvfb on Linux), assert the port is ephemeral (not 8765), and hit
  health on it — proving externalBin spawn + PORT passthrough. It runs AFTER the
  Tauri build (needs the binary) and is Linux-only in CI (mac/win can't open a
  windowed GUI headlessly on runners). The webview `get_backend_port` →
  `resolveApiBase` URL contract is NOT driven through the GUI; it's locked by the
  `test:config` node:test unit test (`artifacts/web/tests/config/`), which mocks
  `window.__TAURI_INTERNALS__.invoke`.

## Self-update + code signing

- Two independent signing systems, don't conflate: (1) **updater trust** = a
  self-generated minisign keypair (free) — public key in
  `tauri.conf.json > plugins.updater.pubkey`, private key never committed; (2)
  **OS trust** (SmartScreen/Gatekeeper) = paid CA / Apple Developer certs,
  supplied at build time via env vars. Full guide: `docs/desktop-signing.md`.
  (The `APPLE_*` secrets are already consumed by the CI matrix above.)

- The updater private key is supplied to the build via
  `TAURI_SIGNING_PRIVATE_KEY` (+ `_PASSWORD`); `build-desktop.sh` also
  auto-loads a gitignored `src-tauri/.tauri-updater-key` for local builds. Lose
  the private key → installed apps can never self-update again.

- **Frontend-invoked Tauri plugins (updater, process) require a capabilities
  file.** There was none before; `src-tauri/capabilities/default.json` grants
  `updater:default` + `process:allow-restart`. The Rust-side shell sidecar spawn
  does NOT need a capability (it's called from Rust, not JS).

- Updater/process plugins are desktop-gated in both `Cargo.toml`
  (`[target.'cfg(not(android/ios))'.dependencies]`) and `main.rs` (`#[cfg(desktop)]`).
  `bundle.createUpdaterArtifacts: true` emits the signed `*.sig` update packages;
  `scripts/desktop/make-update-manifest.sh` builds the `latest.json` the app polls.
