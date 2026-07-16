// Types mirroring the Python FastAPI RAG backend responses (backend/app).

export interface Citation {
  document_id: number;
  document_name: string;
  page_number: number | null;
  heading: string | null;
  quoted_text: string;
  confidence: number | null;
  score?: number;
}

export type DocumentStatus =
  | "pending"
  | "indexing"
  | "indexed"
  | "failed"
  | string;

export interface DocumentRow {
  id: number;
  file_name: string;
  title: string | null;
  file_type: string | null;
  folder_path: string | null;
  stored_path: string | null;
  source: string | null;
  vendor: string | null;
  customer: string | null;
  document_type: string | null;
  author: string | null;
  effective_date: string | null;
  expiration_date: string | null;
  file_size: number;
  file_created: string | null;
  file_modified: string | null;
  indexed_at: string | null;
  status: DocumentStatus;
  error_message: string | null;
  chunk_count: number;
  content_hash: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChunkRow {
  chunk_index: number;
  content: string;
  page_number: number | null;
  heading: string | null;
}

export interface UploadResultItem {
  document_id?: number;
  file_name: string;
  status: string;
  reason?: string;
}

export interface UploadResponse {
  results: UploadResultItem[];
}

export interface Folder {
  id: number;
  path: string;
  enabled: number;
  last_scanned: string | null;
  created_at: string;
}

export interface Conversation {
  id: number;
  title: string | null;
  bookmarked: number;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: number;
  conversation_id: number;
  role: "user" | "assistant" | string;
  content: string;
  citations: Citation[];
  created_at: string;
}

export interface DashboardTypeCount {
  type: string;
  count: number;
}

export interface DashboardRecentDoc {
  id: number;
  file_name: string;
  title: string | null;
  status: DocumentStatus;
  created_at: string;
}

export interface Dashboard {
  total_documents: number;
  indexed: number;
  pending: number;
  failed: number;
  total_chunks: number;
  vector_count: number;
  total_conversations: number;
  total_folders: number;
  by_type: DashboardTypeCount[];
  recent_documents: DashboardRecentDoc[];
}

export interface Health {
  status: string;
  llm_provider: string | null;
  embedding_provider: string | null;
  local_only: boolean;
  vector_store: { ok: boolean; count: number };
}

export type SearchMode = "semantic" | "keyword";

export interface SearchRequest {
  query: string;
  mode?: SearchMode;
  document_ids?: number[];
  document_type?: string;
  vendor?: string;
  top_k?: number;
}

export interface SearchResponse {
  mode: SearchMode;
  results: Citation[];
}

export interface AskRequest {
  question: string;
  conversation_id?: number | null;
  document_ids?: number[];
  top_k?: number;
}

// SSE event payloads emitted by POST /api/chat/ask
export interface MetaEvent {
  type: "meta";
  conversation_id: number;
}
export interface TokenEvent {
  type: "token";
  content: string;
}
export interface CitationsEvent {
  type: "citations";
  citations: Citation[];
}
export interface DoneEvent {
  type: "done";
  answer: string;
}
export type AskEvent = MetaEvent | TokenEvent | CitationsEvent | DoneEvent;

export interface SummaryStyle {
  key: string;
  label: string;
}

export interface SummaryRequest {
  document_id: number;
  style?: string;
}

export interface SummaryResult {
  summary: string;
  citations: Citation[];
  style: string;
  style_label?: string;
}

export interface ComparisonTopics {
  topics: string[];
}

export interface ComparisonRequest {
  document_ids: number[];
  topics?: string[];
}

export interface ComparisonDocRef {
  id: number;
  name: string;
}

export interface ComparisonRow {
  topic: string;
  values: Record<string, string>;
}

export interface ComparisonResult {
  documents: ComparisonDocRef[];
  topics: string[];
  rows: ComparisonRow[];
}

export interface RiskCategories {
  categories: string[];
}

export interface RiskRequest {
  document_id: number;
}

export type RiskSeverity = "low" | "medium" | "high" | string;

export interface RiskFinding {
  category: string;
  severity: RiskSeverity;
  description: string;
  evidence: string;
}

export interface RiskResult {
  document_id: number;
  findings: RiskFinding[];
  count: number;
  summary?: string;
}

export interface ProviderOption {
  id: string;
  label: string;
  status: "active" | "available" | "coming_soon" | string;
  type: "cloud" | "local" | string;
}

export interface Providers {
  llm: ProviderOption[];
  embeddings: ProviderOption[];
}

export interface SettingsPublic {
  llm_provider: string;
  llm_model: string;
  ollama_base_url: string;
  anthropic_model: string;
  embedding_provider: string;
  embedding_model: string;
  openai_embedding_model: string;
  chunk_size: string;
  chunk_overlap: string;
  theme: string;
  local_only: string;
  retrieval_top_k: string;
  openai_api_key_set: boolean;
  openai_api_key_source: "settings" | "environment" | "none" | string;
  anthropic_api_key_set: boolean;
  anthropic_api_key_source: "settings" | "environment" | "none" | string;
  cloud_ai_enabled: boolean;
  [key: string]: string | boolean;
}

export interface SettingsUpdate {
  llm_provider?: string;
  llm_model?: string;
  ollama_base_url?: string;
  openai_api_key?: string;
  anthropic_api_key?: string;
  anthropic_model?: string;
  embedding_provider?: string;
  openai_embedding_model?: string;
  chunk_size?: string;
  chunk_overlap?: string;
  theme?: string;
  local_only?: string;
  retrieval_top_k?: string;
}

export interface ExportAnswerRequest {
  question: string;
  answer: string;
  citations?: Citation[];
}

export interface SimpleStatus {
  document_id?: number;
  folder_id?: number;
  conversation_id?: number;
  status?: string;
  bookmarked?: number;
  path?: string;
}
