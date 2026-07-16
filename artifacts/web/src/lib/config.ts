// Base URL for the Python FastAPI RAG backend.
//
// On the web (dev/preview), requests to "/__rag/*" are proxied by Vite to the
// backend with the "/__rag" prefix stripped, so "/__rag/api/health" hits
// "/api/health". Override with VITE_API_BASE_URL if the backend is served
// elsewhere.
//
// In the desktop (Tauri) shell the backend is a bundled sidecar launched on a
// runtime-chosen loopback port (to avoid clashing with whatever else is using
// a fixed port on the user's machine). The Rust shell exposes that port via the
// `get_backend_port` command; `resolveApiBase()` reads it and points requests
// at "http://127.0.0.1:<port>/api". Because the port is only known at runtime,
// the base URL must be resolved asynchronously before the first request.

const DEFAULT_API_BASE: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ??
  "/__rag/api";

interface TauriInternals {
  invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: TauriInternals;
  }
}

let apiBase = DEFAULT_API_BASE;
let resolvePromise: Promise<string> | null = null;

/** True when running inside the Tauri desktop shell (vs. a plain browser). */
export function isDesktop(): boolean {
  return typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;
}

/** The currently resolved backend base URL. Call `resolveApiBase()` first. */
export function getApiBase(): string {
  return apiBase;
}

/**
 * Resolve the backend base URL, memoized so it only runs once. On the desktop
 * this queries the Rust shell for the runtime port; on the web it keeps the
 * build-time/default base. Safe to call repeatedly.
 */
export function resolveApiBase(): Promise<string> {
  if (!resolvePromise) {
    resolvePromise = (async () => {
      if (isDesktop()) {
        try {
          const port = await window.__TAURI_INTERNALS__!.invoke<number>(
            "get_backend_port",
          );
          apiBase = `http://127.0.0.1:${port}/api`;
        } catch {
          // Fall back to the default base if the command isn't available.
        }
      }
      return apiBase;
    })();
  }
  return resolvePromise;
}

// GitHub repository ("owner/repo") that publishes the desktop app installers as
// GitHub Releases. Configure it with VITE_GITHUB_REPO so the download page can
// link to the latest release assets. When unset, the download page shows setup
// guidance instead of fabricating links.
export const GITHUB_REPO: string =
  (import.meta.env.VITE_GITHUB_REPO as string | undefined)?.trim().replace(/^\/+|\/+$/g, "") ??
  "";

/** URL of the repository's Releases page, or "" when the repo is not configured. */
export function getReleasesPageUrl(): string {
  return GITHUB_REPO ? `https://github.com/${GITHUB_REPO}/releases` : "";
}

/** GitHub REST API URL for the latest published release, or "" when unconfigured. */
export function getLatestReleaseApiUrl(): string {
  return GITHUB_REPO
    ? `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`
    : "";
}
