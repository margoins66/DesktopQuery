#!/usr/bin/env bash
# Assemble the `latest.json` update manifest that the Tauri updater polls.
#
# Run this AFTER `build-desktop.sh` has produced the updater artifacts
# (createUpdaterArtifacts=true emits, per platform, an update package plus a
# `.sig` file next to the installer). This script scans the Tauri bundle output
# for those `.sig` files, reads the signature, and writes a manifest to stdout.
#
# Usage:
#   bash scripts/desktop/make-update-manifest.sh > latest.json
#
# Environment:
#   RELEASE_BASE_URL   Base URL where the update packages will be hosted. The
#                      package filename is appended to form each platform URL.
#                      Defaults to a GitHub Releases "latest download" pattern.
#   RELEASE_NOTES      Optional human-readable notes shown in the update banner.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TAURI_DIR="$ROOT/artifacts/web/src-tauri"
BUNDLE_DIR="$TAURI_DIR/target/release/bundle"

VERSION="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' \
  "$TAURI_DIR/tauri.conf.json" | head -1)"
RELEASE_BASE_URL="${RELEASE_BASE_URL:-https://github.com/replit/local-document-rag/releases/latest/download}"
RELEASE_NOTES="${RELEASE_NOTES:-See the release page for details.}"
PUB_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

if [ ! -d "$BUNDLE_DIR" ]; then
  echo "No bundle dir at $BUNDLE_DIR — run build-desktop.sh first." >&2
  exit 1
fi

# Map each update artifact's .sig file to the platform key Tauri expects.
platform_for() {
  case "$1" in
    *.app.tar.gz) echo "darwin-x86_64" ;;      # adjust to darwin-aarch64 on Apple Silicon
    *.msi.zip)    echo "windows-x86_64" ;;
    *.nsis.zip)   echo "windows-x86_64" ;;
    *.AppImage.tar.gz) echo "linux-x86_64" ;;
    *) echo "" ;;
  esac
}

entries=""
while IFS= read -r sig; do
  [ -z "$sig" ] && continue
  artifact="${sig%.sig}"
  fname="$(basename "$artifact")"
  key="$(platform_for "$fname")"
  [ -z "$key" ] && continue
  signature="$(cat "$sig")"
  url="$RELEASE_BASE_URL/$fname"
  entry="\"$key\": { \"signature\": \"$signature\", \"url\": \"$url\" }"
  entries="${entries:+$entries, }$entry"
done < <(find "$BUNDLE_DIR" -name '*.sig' 2>/dev/null)

if [ -z "$entries" ]; then
  echo "No signed update artifacts (*.sig) found under $BUNDLE_DIR." >&2
  echo "Ensure bundle.createUpdaterArtifacts is true and a signing key is set." >&2
  exit 1
fi

cat <<EOF
{
  "version": "$VERSION",
  "notes": "$RELEASE_NOTES",
  "pub_date": "$PUB_DATE",
  "platforms": { $entries }
}
EOF
