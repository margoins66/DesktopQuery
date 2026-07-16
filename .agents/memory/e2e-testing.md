---
name: RAG E2E testing
description: How the web artifact's end-to-end contract tests are built and run, and the constraints that shaped them.
---

# RAG web E2E tests

The suite lives in `artifacts/web/tests/e2e/` and is run via `pnpm --filter @workspace/web run test:e2e` (also registered as the `e2e` validation command).

- **vitest is blocked by the package firewall here** (the `vitest` tarball 403s with "No authorization header" while its deps download fine — an allowlist block, not flakiness). Do not keep retrying an install of it. The suite therefore uses Node's built-in `node:test` runner.
  **Why:** we still need to exercise the REAL frontend client (`src/lib/api.ts`, including the `askStream` SSE parser) so backend↔frontend contract drift fails loudly — that is the whole point (the original bug was the SSE token field `content` being read as `token`, producing silent empty answers).
  **How to apply:** `run.mjs` bundles `e2e.test.ts` with esbuild (resolved directly from the pnpm store, since esbuild ships under Vite and isn't a linked direct dep) using `packages:'external'` and `define` for `import.meta.env.VITE_API_BASE_URL`. That define is what lets the real `config.ts` load under plain Node (otherwise `import.meta.env` is undefined and throws).

- Tests hit the backend **through a real Vite dev server proxy** started in the `before()` hook via `createServer({configFile: vite.config.ts})` — same `/__rag`→backend rewrite the browser uses. The bundled `VITE_API_BASE_URL` points at that proxy port.

- The suite is **self-provisioning and self-cleaning**: it uploads two distinct fixture contracts (different payment terms / liability / termination) so comparison + search + summary have ≥2 indexed docs to assert against, polls until `status==='indexed'`, then deletes the fixtures and any conversations it created in `after()`. It also starts the FastAPI backend itself if `/api/health` is unreachable. So it does not depend on pre-existing DB state.

- The fallback-string assertion hardcodes the exact backend `FALLBACK_ANSWER` on purpose — if the backend changes the wording, the contract test should fail.
