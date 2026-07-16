---
name: RAG web frontend wiring
description: Architecture constraints and data-integrity rules for the RAG web artifact.
---

# RAG web frontend

- The web artifact must consume the **Python FastAPI backend** directly (via the Vite dev proxy) and must **NOT** depend on the Node api-server artifact for data.
  **Why:** the product is local-first RAG; FastAPI owns all RAG endpoints, and routing through Node breaks the intended architecture and future Tauri portability.

- **No fabricated data.** Render exactly what the backend returns, including its exact "not found" fallback string. Never invent fields the backend does not provide.
  **How to apply:** if the spec asks for a field the backend lacks: (a) wire a real existing endpoint that provides it, (b) derive it honestly from returned data and label it as derived, or (c) show a clearly labeled "Coming Soon" placeholder — never synthesize plausible values.

- Comparisons is a composite view: the comparison endpoint returns only a topic×document value matrix, so risk notes/citations come from the separate per-document risk endpoint (its evidence quotes act as citations), and "differences" is derived by comparing matrix cells.

- When firing N parallel per-item requests tied to a user "run" action, guard state writes with an incrementing run id so a slower previous run can never overwrite a newer run's results.

- The desktop-installer Download page reads its GitHub repo from `VITE_GITHUB_REPO` (owner/repo) and fetches real assets from the GitHub Releases API; it never fabricates links. **Any new `import.meta.env.VITE_*` var must also be added to the esbuild `define` map in `tests/e2e/run.mjs`**, or the e2e bundle leaves a bare `import.meta.env` that is undefined at runtime and the whole suite crashes on import.

## Download page release source
- The /download page reads `VITE_GITHUB_REPO` (owner/repo, shared env; currently `margoins66/DesktopQuery`) and fetches the latest GitHub release unauthenticated from the visitor's browser.
- **Why:** the repo must be PUBLIC and the release PUBLISHED (the desktop-release workflow only creates drafts, which are invisible to the API) or the page shows "No published release" — that state is correct, not a bug.
