#!/usr/bin/env bash
# Produce an installable desktop app:
#   1. Freeze the Python backend into a sidecar binary (PyInstaller).
#   2. Build the Vite frontend + Tauri shell into an OS installer.
#
# On Linux (e.g. the Replit container) native build libs are provided through
# nix-shell. On macOS/Windows, run the same cargo/tauri commands directly with
# the Tauri prerequisites installed (see https://tauri.app prerequisites).
#
# For Windows/macOS installers, prefer the GitHub Actions matrix in
# .github/workflows/desktop-release.yml. Full instructions (CI + manual builds,
# macOS signing/notarization) live in scripts/desktop/README.md.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TAURI_DIR="$ROOT/artifacts/web/src-tauri"

echo "==> [1/2] Building Python backend sidecar"
bash "$ROOT/scripts/desktop/build-sidecar.sh"

echo "==> [2/2] Building Tauri desktop bundle"
# Make sure the Rust toolchain is discoverable (Replit installs it under ~/.cargo).
export PATH="$HOME/.cargo/bin:$PATH"

cd "$ROOT/artifacts/web"

# --- Updater signing -------------------------------------------------------
# Tauri signs the update artifacts (and generates latest.json signatures) with a
# minisign private key. The matching PUBLIC key is committed in tauri.conf.json.
# Provide the private key one of two ways:
#   1. TAURI_SIGNING_PRIVATE_KEY (+ _PASSWORD) already exported in the env
#      (recommended for CI — store it as a secret).
#   2. A local key file at src-tauri/.tauri-updater-key (gitignored), which this
#      script picks up automatically for local/dev builds.
# See docs/desktop-signing.md for how to generate and manage these keys.
LOCAL_UPDATER_KEY="$TAURI_DIR/.tauri-updater-key"
if [ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ] && [ -f "$LOCAL_UPDATER_KEY" ]; then
  export TAURI_SIGNING_PRIVATE_KEY="$(cat "$LOCAL_UPDATER_KEY")"
  export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}"
  echo "==> Using local updater signing key ($LOCAL_UPDATER_KEY)"
fi
if [ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ]; then
  echo "WARN: No updater signing key found. Update artifacts will NOT be signed" >&2
  echo "      and installed apps will not be able to self-update. See" >&2
  echo "      docs/desktop-signing.md to configure signing." >&2
fi

if [ "$(uname -s)" = "Linux" ]; then
  # Default to .deb only: AppImage bundling needs FUSE/linuxdeploy which is not
  # available in sandboxed/CI environments. On a normal Linux desktop you can
  # build more formats, e.g. LINUX_BUNDLES="deb,appimage,rpm".
  BUNDLES="${LINUX_BUNDLES:-deb}"
  # Provide webkit2gtk/gtk3/libsoup via nix so pkg-config + linking succeed.
  exec nix-shell "$ROOT/scripts/desktop/shell.nix" --run \
    "pnpm exec tauri build --bundles $BUNDLES ${TAURI_BUILD_ARGS:-}"
else
  # macOS/Windows: let Tauri pick the platform's default installers (dmg/app,
  # msi/nsis) from tauri.conf.json "targets": "all".
  exec pnpm exec tauri build ${TAURI_BUILD_ARGS:-}
fi
