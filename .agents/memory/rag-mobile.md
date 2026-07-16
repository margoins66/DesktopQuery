---
name: RAG mobile (Expo) artifact
description: How the Expo mobile artifact reaches the FastAPI backend and mirrors the web design.
---

# RAG mobile artifact

Expo artifact (slug `mobile`, previewPath `/mobile/`) for the local-first RAG app. Reuses the Python FastAPI backend directly — it does NOT use the Node api-server or `@workspace/api-client-react`. It has its own typed fetch client that talks to `<baseUrl>/documents`, `/chat/ask` (SSE via `expo/fetch`), `/summaries`, `/health`.

## Backend base URL is user-configurable (the core seam)
**Rule:** the mobile app never hardcodes a backend. Base URL lives in a ConfigProvider, persisted in AsyncStorage, editable + testable on the Settings screen.
**Why:** the FastAPI backend is local-first — in production it runs wherever the user hosts it (tunnel / desktop / hosted), not at a fixed URL. This matches the local-first contract.
**How to apply:** default resolves to `EXPO_PUBLIC_RAG_BASE_URL`, else `https://${EXPO_PUBLIC_DOMAIN}/__rag/api`. That default only works in the Replit preview **when the web dev server is running**, because it reuses the web artifact's Vite `/__rag` → backend:8000 proxy (same seam the web app uses). In a bare task env only `RAG Backend` runs, so start `artifacts/web: web` to make the default resolve for E2E checks.

## Design parity with web
Palette + radius converted from the web artifact's HSL tokens into `constants/colors.ts` (light+dark). Fonts mirror web: Plus Jakarta Sans (body) + DM Serif Display (titles) via `@expo-google-fonts/*`.
**Gotcha:** adding a `dark` key to `constants/colors.ts` breaks the scaffold's `useColors` cast (`colors as Record<...>`) because `radius: number` violates the index signature — access `colors.dark`/`colors.light` directly instead of casting.

## Grounding
Answers/summaries render the backend's exact FALLBACK string ("I could not locate that information in the indexed documents.") verbatim; never fabricate. Citations show document name, page/heading, exact quoted_text, and confidence.
