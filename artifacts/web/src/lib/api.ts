import { getApiBase } from "./config";
import type {
  AskEvent,
  AskRequest,
  ChunkRow,
  ComparisonRequest,
  ComparisonResult,
  ComparisonTopics,
  Conversation,
  Dashboard,
  DocumentRow,
  ExportAnswerRequest,
  Folder,
  Health,
  Message,
  Providers,
  RiskCategories,
  RiskRequest,
  RiskResult,
  SearchRequest,
  SearchResponse,
  SettingsPublic,
  SettingsUpdate,
  SimpleStatus,
  SummaryRequest,
  SummaryResult,
  SummaryStyle,
  UploadResponse,
} from "./types";

export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(status: number, message: string, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${getApiBase()}${path}`, {
      headers: {
        Accept: "application/json",
        ...(init?.body && !(init.body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}),
        ...(init?.headers ?? {}),
      },
      ...init,
    });
  } catch (e) {
    throw new ApiError(
      0,
      "Could not reach the RAG backend. Make sure it is running.",
      e,
    );
  }
  if (!res.ok) {
    let data: unknown;
    let message = `${res.status} ${res.statusText}`;
    try {
      data = await res.json();
      const detail = (data as { detail?: unknown })?.detail;
      if (typeof detail === "string") message = detail;
    } catch {
      /* non-json error body */
    }
    throw new ApiError(res.status, message, data);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function requestBlob(path: string, init?: RequestInit): Promise<Blob> {
  const res = await fetch(`${getApiBase()}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (!res.ok) {
    throw new ApiError(res.status, `${res.status} ${res.statusText}`);
  }
  return res.blob();
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const api = {
  // Health & dashboard
  getHealth: () => request<Health>("/health"),
  getDashboard: () => request<Dashboard>("/dashboard"),

  // Documents
  listDocuments: (params?: { status?: string; q?: string }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.q) qs.set("q", params.q);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return request<DocumentRow[]>(`/documents${suffix}`);
  },
  getDocument: (id: number) => request<DocumentRow>(`/documents/${id}`),
  getDocumentChunks: (id: number) =>
    request<ChunkRow[]>(`/documents/${id}/chunks`),
  uploadDocuments: (files: File[]) => {
    const form = new FormData();
    for (const f of files) form.append("files", f);
    return request<UploadResponse>("/documents/upload", {
      method: "POST",
      body: form,
    });
  },
  reindexDocument: (id: number) =>
    request<SimpleStatus>(`/documents/${id}/reindex`, { method: "POST" }),
  deleteDocument: (id: number) =>
    request<SimpleStatus>(`/documents/${id}`, { method: "DELETE" }),

  // Folders
  listFolders: () => request<Folder[]>("/folders"),
  addFolder: (path: string) =>
    request<SimpleStatus>("/folders", {
      method: "POST",
      body: JSON.stringify({ path }),
    }),
  rescanFolder: (id: number) =>
    request<SimpleStatus>(`/folders/${id}/rescan`, { method: "POST" }),
  deleteFolder: (id: number) =>
    request<SimpleStatus>(`/folders/${id}`, { method: "DELETE" }),

  // Search
  search: (req: SearchRequest) =>
    request<SearchResponse>("/search", {
      method: "POST",
      body: JSON.stringify(req),
    }),

  // Chat
  listConversations: () => request<Conversation[]>("/chat/conversations"),
  createConversation: (title?: string) =>
    request<Conversation>("/chat/conversations", {
      method: "POST",
      body: JSON.stringify({ title: title ?? null }),
    }),
  getMessages: (conversationId: number) =>
    request<Message[]>(`/chat/conversations/${conversationId}/messages`),
  bookmarkConversation: (conversationId: number) =>
    request<SimpleStatus>(
      `/chat/conversations/${conversationId}/bookmark`,
      { method: "PATCH" },
    ),
  deleteConversation: (conversationId: number) =>
    request<SimpleStatus>(`/chat/conversations/${conversationId}`, {
      method: "DELETE",
    }),

  // Summaries
  getSummaryStyles: () => request<SummaryStyle[]>("/summaries/styles"),
  generateSummary: (req: SummaryRequest) =>
    request<SummaryResult>("/summaries", {
      method: "POST",
      body: JSON.stringify(req),
    }),

  // Comparisons
  getComparisonTopics: () => request<ComparisonTopics>("/comparisons/topics"),
  runComparison: (req: ComparisonRequest) =>
    request<ComparisonResult>("/comparisons", {
      method: "POST",
      body: JSON.stringify(req),
    }),

  // Risk
  getRiskCategories: () => request<RiskCategories>("/risk/categories"),
  runRisk: (req: RiskRequest) =>
    request<RiskResult>("/risk", {
      method: "POST",
      body: JSON.stringify(req),
    }),

  // Settings
  getSettings: () => request<SettingsPublic>("/settings"),
  updateSettings: (req: SettingsUpdate) =>
    request<SettingsPublic>("/settings", {
      method: "PUT",
      body: JSON.stringify(req),
    }),
  getProviders: () => request<Providers>("/settings/providers"),

  // Exports (return file blobs)
  exportAnswer: (req: ExportAnswerRequest) =>
    requestBlob("/exports/answer", {
      method: "POST",
      body: JSON.stringify(req),
    }),
  exportComparison: (req: ComparisonRequest) =>
    requestBlob("/exports/comparison", {
      method: "POST",
      body: JSON.stringify(req),
    }),
  exportSummary: (req: SummaryRequest) =>
    requestBlob("/exports/summary", {
      method: "POST",
      body: JSON.stringify(req),
    }),
};

export interface AskStreamHandlers {
  onMeta?: (conversationId: number) => void;
  onToken?: (token: string) => void;
  onCitations?: (citations: import("./types").Citation[]) => void;
  onDone?: (answer: string) => void;
  onError?: (error: Error) => void;
}

/**
 * Streams an answer from POST /api/chat/ask via Server-Sent Events.
 * Returns a function that aborts the in-flight request.
 */
export function askStream(
  req: AskRequest,
  handlers: AskStreamHandlers,
): () => void {
  const controller = new AbortController();

  (async () => {
    let res: Response;
    try {
      res = await fetch(`${getApiBase()}/chat/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify(req),
        signal: controller.signal,
      });
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        handlers.onError?.(
          new Error("Could not reach the RAG backend. Make sure it is running."),
        );
      }
      return;
    }

    if (!res.ok || !res.body) {
      handlers.onError?.(
        new ApiError(res.status, `${res.status} ${res.statusText}`),
      );
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    const dispatch = (raw: string) => {
      const line = raw.startsWith("data:") ? raw.slice(5).trim() : raw.trim();
      if (!line) return;
      let evt: AskEvent;
      try {
        evt = JSON.parse(line) as AskEvent;
      } catch {
        return;
      }
      switch (evt.type) {
        case "meta":
          handlers.onMeta?.(evt.conversation_id);
          break;
        case "token":
          handlers.onToken?.(evt.content);
          break;
        case "citations":
          handlers.onCitations?.(evt.citations);
          break;
        case "done":
          handlers.onDone?.(evt.answer);
          break;
      }
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const chunk = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          for (const ln of chunk.split("\n")) dispatch(ln);
        }
      }
      if (buffer.trim()) {
        for (const ln of buffer.split("\n")) dispatch(ln);
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        handlers.onError?.(e as Error);
      }
    }
  })();

  return () => controller.abort();
}
