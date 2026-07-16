# Desktop app: self-update & code signing

The desktop build of Local Document RAG (the Tauri shell in
`artifacts/web/src-tauri`) can update itself and — once you have the right
certificates — pass Windows SmartScreen and macOS Gatekeeper without scary
"unknown developer" warnings.

There are **two independent signing systems** here; don't confuse them:

| Purpose | Key/cert | Where the public part lives | Where the private part lives |
| --- | --- | --- | --- |
| **Updater trust** (verifies an update package really came from you) | minisign keypair, self-generated, free | `plugins.updater.pubkey` in `tauri.conf.json` | `TAURI_SIGNING_PRIVATE_KEY` secret / `.tauri-updater-key` file |
| **OS trust** (SmartScreen / Gatekeeper) | code-signing cert from a CA (Windows) and an Apple Developer cert (macOS), both paid | embedded in the installer | `APPLE_CERTIFICATE` / Windows cert, provided at build time |

---

## 1. Updater (already wired)

The updater plugin (`tauri-plugin-updater` + `tauri-plugin-process`) is enabled:

- `tauri.conf.json` → `plugins.updater` holds the **public** key and the
  `endpoints` list the app polls for a new version.
- `bundle.createUpdaterArtifacts: true` makes `tauri build` emit the
  `*.tar.gz`/`*.zip` update packages **and** their `.sig` signatures.
- The frontend checks on launch (`src/hooks/useAppUpdate.ts`) and shows a banner
  (`src/components/UpdateBanner.tsx`) offering "Install & restart".

### The updater signing key

The keypair was generated with `tauri signer generate`. The **public** key is
committed in `tauri.conf.json`; the **private** key must never be committed.

- For local/dev builds, the private key can live at
  `artifacts/web/src-tauri/.tauri-updater-key` (gitignored). `build-desktop.sh`
  picks it up automatically.
- For CI/release builds, store the private key contents in a secret named
  `TAURI_SIGNING_PRIVATE_KEY` (and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` if the
  key has a password). `build-desktop.sh` uses the env var when present.

To rotate/generate a fresh key:

```bash
cd artifacts/web
pnpm exec tauri signer generate -w src-tauri/.tauri-updater-key
# copy the printed public key into tauri.conf.json → plugins.updater.pubkey
```

> ⚠️ If you lose the private key, existing installs can never be updated again
> (they only trust packages signed by the matching key). Back it up.

### Publishing an update

1. Bump `version` in `tauri.conf.json` (and `Cargo.toml`).
2. `bash scripts/desktop/build-desktop.sh` — produces the installers plus, for
   each updater artifact, a `.sig` file.
3. Generate the manifest the app polls for:
   `bash scripts/desktop/make-update-manifest.sh > latest.json`
4. Upload the installers, their `.sig` files, and `latest.json` to the release
   host referenced by `plugins.updater.endpoints` (default: the project's
   GitHub Releases "latest" download URL). Adjust the endpoint to your own host.

The app compares its running `version` to `latest.json`'s `version`; if newer,
it downloads the platform package, verifies the signature against the embedded
public key, installs, and relaunches.

---

## 2. Windows code signing (SmartScreen)

Unsigned `.exe`/`.msi` installers trigger a SmartScreen "Windows protected your
PC" warning. To sign:

1. Obtain an OV or (better, no SmartScreen reputation wait) EV code-signing
   certificate from a CA (DigiCert, Sectigo, …).
2. Configure Tauri to sign during build. Either:
   - Add to `tauri.conf.json` → `bundle.windows`:
     ```json
     "certificateThumbprint": "YOUR_CERT_SHA1_THUMBPRINT",
     "digestAlgorithm": "sha256",
     "timestampUrl": "http://timestamp.digicert.com"
     ```
     (the cert must be importable into the machine store on the build box), **or**
   - Provide a custom `signCommand` in `bundle.windows` that calls your HSM /
     cloud-signing tool (Azure Trusted Signing, DigiCert KeyLocker, etc.).
3. Build on Windows: `bash scripts/desktop/build-desktop.sh` (or the raw
   `pnpm exec tauri build`). PyInstaller does not cross-compile, so the sidecar
   must be built on Windows too.

**Status:** not enabled here because no certificate is available in this
environment. The config keys above are the only change needed once a cert
exists — no code changes required.

---

## 3. macOS signing + notarization (Gatekeeper)

Unsigned/un-notarized `.app`/`.dmg` bundles are blocked by Gatekeeper. To pass:

1. Enroll in the Apple Developer Program and create a **Developer ID
   Application** certificate.
2. Export env vars before building (Tauri reads these automatically):
   ```bash
   export APPLE_CERTIFICATE="<base64 of the .p12>"
   export APPLE_CERTIFICATE_PASSWORD="<p12 password>"
   export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"
   # Notarization (either API key OR Apple-ID app-specific password):
   export APPLE_ID="you@example.com"
   export APPLE_PASSWORD="<app-specific-password>"
   export APPLE_TEAM_ID="TEAMID"
   ```
3. Build on macOS: `bash scripts/desktop/build-desktop.sh`. Tauri signs the app
   with the Developer ID cert and submits it to Apple for notarization, then
   staples the ticket.

`bundle.macOS.minimumSystemVersion` is set to `10.15`. Add
`entitlements`/`signingIdentity` under `bundle.macOS` only if you need to
override the env-var-driven defaults.

**Status:** not enabled here because no Apple Developer certificate is available
in this environment. No code changes are required once certs exist — only the
env vars above.
