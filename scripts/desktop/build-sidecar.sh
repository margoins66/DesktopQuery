#!/usr/bin/env bash
# Freeze the Python FastAPI backend (backend/) into a single standalone
# executable with PyInstaller and place it where Tauri expects its sidecar
# binary: artifacts/web/src-tauri/binaries/rag-backend-<target-triple>.
#
# End users of the desktop app do not have Python installed, so the backend
# ships as this self-contained binary that the Tauri shell launches.
#
# Run on the OS you are targeting (PyInstaller does not cross-compile).
set -euo pipefail

# Rust (for the target triple) and PyInstaller live in per-user dirs that may
# not be on a minimal PATH.
export PATH="$HOME/.cargo/bin:$HOME/workspace/.pythonlibs/bin:/home/runner/workspace/.pythonlibs/bin:$PATH"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND="$ROOT/backend"
BIN_DIR="$ROOT/artifacts/web/src-tauri/binaries"

# Tauri names sidecars "<name>-<rustc host target triple>".
TRIPLE="${TAURI_TARGET_TRIPLE:-$(rustc -Vv | sed -n 's/^host: //p')}"
if [ -z "$TRIPLE" ]; then
  echo "Could not determine Rust target triple (is rustc on PATH?)." >&2
  exit 1
fi

# Windows executables (and therefore the Tauri sidecar name) carry a .exe
# suffix; PyInstaller also emits dist/rag-backend.exe there. Detect the host
# OS from uname (Git Bash / MSYS report MINGW*/MSYS*/CYGWIN*).
EXE_SUFFIX=""
case "$(uname -s)" in
  MINGW* | MSYS* | CYGWIN* | Windows_NT) EXE_SUFFIX=".exe" ;;
esac

echo "==> Building backend sidecar for target: $TRIPLE"

cd "$BACKEND"
rm -rf build dist

pyinstaller --noconfirm --clean --onefile --name rag-backend \
  --collect-all chromadb \
  --collect-all onnxruntime \
  --collect-all tokenizers \
  --collect-all pymupdf \
  --collect-all fitz \
  --collect-all pandas \
  --collect-all openpyxl \
  --collect-all docx \
  --collect-all pptx \
  --collect-all reportlab \
  --collect-all bs4 \
  --collect-all lxml \
  --collect-all striprtf \
  --collect-all markdown \
  --collect-all PIL \
  --collect-all pytesseract \
  --collect-all anthropic \
  --collect-all openai \
  --collect-all watchdog \
  --collect-all uvicorn \
  --collect-all fastapi \
  --collect-all pydantic \
  --collect-submodules app \
  desktop_entry.py

mkdir -p "$BIN_DIR"
cp "dist/rag-backend$EXE_SUFFIX" "$BIN_DIR/rag-backend-$TRIPLE$EXE_SUFFIX"
chmod +x "$BIN_DIR/rag-backend-$TRIPLE$EXE_SUFFIX"

echo "==> Sidecar ready: $BIN_DIR/rag-backend-$TRIPLE$EXE_SUFFIX"
