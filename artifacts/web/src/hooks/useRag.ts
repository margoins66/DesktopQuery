import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  ComparisonRequest,
  RiskRequest,
  SearchRequest,
  SettingsUpdate,
  SummaryRequest,
} from "@/lib/types";

export const qk = {
  health: ["health"] as const,
  dashboard: ["dashboard"] as const,
  documents: (params?: { status?: string; q?: string }) =>
    ["documents", params ?? {}] as const,
  document: (id: number) => ["document", id] as const,
  chunks: (id: number) => ["chunks", id] as const,
  folders: ["folders"] as const,
  conversations: ["conversations"] as const,
  messages: (id: number) => ["messages", id] as const,
  summaryStyles: ["summaryStyles"] as const,
  comparisonTopics: ["comparisonTopics"] as const,
  riskCategories: ["riskCategories"] as const,
  settings: ["settings"] as const,
  providers: ["providers"] as const,
};

// ---- Queries ----
export function useHealth() {
  return useQuery({
    queryKey: qk.health,
    queryFn: api.getHealth,
    refetchInterval: 30_000,
  });
}

export function useDashboard() {
  return useQuery({ queryKey: qk.dashboard, queryFn: api.getDashboard });
}

export function useDocuments(params?: { status?: string; q?: string }) {
  return useQuery({
    queryKey: qk.documents(params),
    queryFn: () => api.listDocuments(params),
  });
}

export function useDocument(id: number | null | undefined) {
  return useQuery({
    queryKey: qk.document(id ?? 0),
    queryFn: () => api.getDocument(id as number),
    enabled: id != null,
  });
}

export function useDocumentChunks(id: number | null | undefined) {
  return useQuery({
    queryKey: qk.chunks(id ?? 0),
    queryFn: () => api.getDocumentChunks(id as number),
    enabled: id != null,
  });
}

export function useFolders() {
  return useQuery({ queryKey: qk.folders, queryFn: api.listFolders });
}

export function useConversations() {
  return useQuery({
    queryKey: qk.conversations,
    queryFn: api.listConversations,
  });
}

export function useMessages(conversationId: number | null | undefined) {
  return useQuery({
    queryKey: qk.messages(conversationId ?? 0),
    queryFn: () => api.getMessages(conversationId as number),
    enabled: conversationId != null,
  });
}

export function useSummaryStyles() {
  return useQuery({
    queryKey: qk.summaryStyles,
    queryFn: api.getSummaryStyles,
  });
}

export function useComparisonTopics() {
  return useQuery({
    queryKey: qk.comparisonTopics,
    queryFn: api.getComparisonTopics,
  });
}

export function useRiskCategories() {
  return useQuery({
    queryKey: qk.riskCategories,
    queryFn: api.getRiskCategories,
  });
}

export function useSettings() {
  return useQuery({ queryKey: qk.settings, queryFn: api.getSettings });
}

export function useProviders() {
  return useQuery({ queryKey: qk.providers, queryFn: api.getProviders });
}

// ---- Mutations ----
export function useUploadDocuments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (files: File[]) => api.uploadDocuments(files),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: qk.dashboard });
    },
  });
}

export function useReindexDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.reindexDocument(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: qk.dashboard });
    },
  });
}

export function useDeleteDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.deleteDocument(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: qk.dashboard });
    },
  });
}

export function useAddFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (path: string) => api.addFolder(path),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.folders });
      qc.invalidateQueries({ queryKey: qk.dashboard });
    },
  });
}

export function useRescanFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.rescanFolder(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.folders }),
  });
}

export function useDeleteFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.deleteFolder(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.folders });
      qc.invalidateQueries({ queryKey: qk.dashboard });
    },
  });
}

export function useSearch() {
  return useMutation({ mutationFn: (req: SearchRequest) => api.search(req) });
}

export function useCreateConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (title?: string) => api.createConversation(title),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.conversations }),
  });
}

export function useBookmarkConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.bookmarkConversation(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.conversations }),
  });
}

export function useDeleteConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.deleteConversation(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.conversations }),
  });
}

export function useGenerateSummary() {
  return useMutation({
    mutationFn: (req: SummaryRequest) => api.generateSummary(req),
  });
}

export function useRunComparison() {
  return useMutation({
    mutationFn: (req: ComparisonRequest) => api.runComparison(req),
  });
}

export function useRunRisk() {
  return useMutation({ mutationFn: (req: RiskRequest) => api.runRisk(req) });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: SettingsUpdate) => api.updateSettings(req),
    onSuccess: (data) => {
      qc.setQueryData(qk.settings, data);
      qc.invalidateQueries({ queryKey: qk.health });
    },
  });
}
