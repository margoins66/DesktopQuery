import { fetch as expoFetch } from "expo/fetch";

/**
 * Typed client for the FastAPI RAG backend. Every call takes an explicit
 * `baseUrl` (from ConfigProvider) so the app never hardcodes a backend.
 *
 * Contracts mirror backend/app/routes/*.py exactly. We never fabricate data:
 * when the backend has no grounded answer it returns FALLBACK_ANSWER verbatim,
 * and we render that string as-is.
 */

export const FALLBACK_ANSWER =
  "I could not locate that information in the indexed documents.";

export interface HealthStatus {
  status: string;
  llm_provider: string;
  embedding_provider: string;
  local_only: boolean;
  vector_store: { ok: boolean; count: number };
}

export interface DocumentSummary {
  id: number;
  file_name: string;
  title: string | null;
  file_type: string | null;
  document_type: string | null;
  vendor: string | null;
  author: string | null;
  status: string;
  chunk_count: number | null;
  file_size: number | null;
  source: string | null;
  effective_date: string | null;
  expiration_date: string | null;
  error_message: string | null;
  created_at: string | null;
  updated_at: string | null;
  indexed_at: string | null;
}

export interface Chunk {
  chunk_index: number;
  content: string;
  page_number: number | null;
  heading: string | null;
}

export interface Citation {
  document_id: number;
  document_name: string;
  page_number: number | null;
  heading: string | null;
  quoted_text: string;
  confidence: number;
}

export interface SummaryStyle {
  key: string;
  label: string;
}

export interface SummaryResult {
  summary: string;
  citations: Citation[];
  style: string;
  style_label?: string;
}

function requireBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) {
    throw new Error(
      "No backend URL configured. Open Settings and enter your FastAPI backend URL.",
    );
  }
  return trimmed;
}

async function getJson<T>(baseUrl: string, path: string): Promise<T> {
  const root = requireBaseUrl(baseUrl);
  let res: Response;
  try {
    res = await fetch(`${root}${path}`, {
      headers: { Accept: "application/json" },
    });
  } catch {
    throw new Error(
      "Could not reach the backend. Check the URL in Settings and that the backend is running.",
    );
  }
  if (!res.ok) {
    throw new Error(`Backend error ${res.status} for ${path}`);
  }
  return (await res.json()) as T;
}

async function postJson<T>(
  baseUrl: string,
  path: string,
  body: unknown,
): Promise<T> {
  const root = requireBaseUrl(baseUrl);
  let res: Response;
  try {
    res = await fetch(`${root}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(
      "Could not reach the backend. Check the URL in Settings and that the backend is running.",
    );
  }
  if (!res.ok) {
    throw new Error(`Backend error ${res.status} for ${path}`);
  }
  return (await res.json()) as T;
}

export function fetchHealth(baseUrl: string): Promise<HealthStatus> {
  return getJson<HealthStatus>(baseUrl, "/health");
}

export function fetchDocuments(
  baseUrl: string,
  q?: string,
): Promise<DocumentSummary[]> {
  const query = q && q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
  return getJson<DocumentSummary[]>(baseUrl, `/documents${query}`);
}

export function fetchDocument(
  baseUrl: string,
  id: number,
): Promise<DocumentSummary> {
  return getJson<DocumentSummary>(baseUrl, `/documents/${id}`);
}

export function fetchChunks(baseUrl: string, id: number): Promise<Chunk[]> {
  return getJson<Chunk[]>(baseUrl, `/documents/${id}/chunks`);
}

export function fetchSummaryStyles(baseUrl: string): Promise<SummaryStyle[]> {
  return getJson<SummaryStyle[]>(baseUrl, "/summaries/styles");
}

export function createSummary(
  baseUrl: string,
  documentId: number,
  style: string,
): Promise<SummaryResult> {
  return postJson<SummaryResult>(baseUrl, "/summaries", {
    document_id: documentId,
    style,
  });
}

export interface AskHandlers {
  onMeta?: (conversationId: number) => void;
  onToken?: (token: string) => void;
  onCitations?: (citations: Citation[]) => void;
  onDone?: (answer: string) => void;
}

export interface AskParams {
  question: string;
  conversationId?: number | null;
  documentIds?: number[] | null;
}

/**
 * Streams a grounded answer from POST /chat/ask (Server-Sent Events).
 * Events: {type:"meta"}, {type:"token"}, {type:"citations"}, {type:"done"}.
 */
export async function streamAsk(
  baseUrl: string,
  params: AskParams,
  handlers: AskHandlers,
): Promise<void> {
  const root = requireBaseUrl(baseUrl);
  const body: Record<string, unknown> = { question: params.question };
  if (params.conversationId != null) {
    body.conversation_id = params.conversationId;
  }
  if (params.documentIds && params.documentIds.length > 0) {
    body.document_ids = params.documentIds;
  }

  let response: Awaited<ReturnType<typeof expoFetch>>;
  try {
    response = await expoFetch(`${root}/chat/ask`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(
      "Could not reach the backend. Check the URL in Settings and that the backend is running.",
    );
  }

  if (!response.ok) {
    throw new Error(`Backend error ${response.status} for /chat/ask`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Streaming is not supported by this backend response.");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (!data) continue;
      let event: { type?: string; [k: string]: unknown };
      try {
        event = JSON.parse(data);
      } catch {
        continue;
      }
      switch (event.type) {
        case "meta":
          handlers.onMeta?.(event.conversation_id as number);
          break;
        case "token":
          handlers.onToken?.(String(event.content ?? ""));
          break;
        case "citations":
          handlers.onCitations?.((event.citations as Citation[]) ?? []);
          break;
        case "done":
          handlers.onDone?.(String(event.answer ?? ""));
          break;
      }
    }
  }
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}
