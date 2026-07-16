import { useDashboard, useHealth, useDocuments } from "@/hooks/useRag";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ErrorState";
import {
  Activity,
  Database,
  CheckCircle,
  AlertTriangle,
  FileText,
  Server,
  Folder,
  MessageSquare,
  HardDrive,
  Clock,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export default function Dashboard() {
  const dash = useDashboard();
  const healthQuery = useHealth();
  const docsQuery = useDocuments();

  const { data: dashboard } = dash;
  const { data: health } = healthQuery;
  const { data: documents } = docsQuery;

  if (dash.isLoading || healthQuery.isLoading) {
    return (
      <div className="p-8 space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-32" />)}
        </div>
      </div>
    );
  }

  if (dash.isError || healthQuery.isError) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <ErrorState
          title="Could not load the dashboard"
          error={dash.error ?? healthQuery.error}
          onRetry={() => {
            dash.refetch();
            healthQuery.refetch();
            docsQuery.refetch();
          }}
          isRetrying={dash.isFetching || healthQuery.isFetching}
        />
      </div>
    );
  }

  // Computed from the real documents list (backend does not expose these directly).
  const storageUsed = documents?.reduce((sum, d) => sum + (d.file_size || 0), 0) ?? 0;
  const lastIndexedDate = documents
    ?.map((d) => d.indexed_at)
    .filter((v): v is string => !!v)
    .sort()
    .at(-1);

  return (
    <div className="p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-serif font-bold tracking-tight">System Overview</h1>
          <p className="text-muted-foreground mt-2">Monitor your indexed corpus and RAG pipeline health.</p>
        </div>
        <div className="flex items-center gap-2 text-sm bg-card border px-3 py-1.5 rounded-full shadow-sm">
          <div className={`w-2.5 h-2.5 rounded-full ${health?.status === "ok" ? "bg-emerald-500" : "bg-destructive"}`} />
          <span className="font-medium">{health?.status === "ok" ? "System Healthy" : "System Degraded"}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="border-l-4 border-l-primary shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
              Total Documents
              <FileText className="w-4 h-4 text-muted-foreground" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{dashboard?.total_documents ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">{dashboard?.indexed ?? 0} successfully indexed</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
              Vector Count
              <Database className="w-4 h-4 text-muted-foreground" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{dashboard?.vector_count.toLocaleString() ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Across {dashboard?.total_chunks ?? 0} chunks</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-500 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
              LLM Provider
              <Server className="w-4 h-4 text-muted-foreground" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold truncate capitalize">{health?.llm_provider || "None"}</div>
            <p className="text-xs text-muted-foreground mt-1">Embeddings: {health?.embedding_provider || "None"}</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
              Processing Errors
              <AlertTriangle className="w-4 h-4 text-muted-foreground" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{dashboard?.failed ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">{dashboard?.pending ?? 0} pending index</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <Card className="shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2"><HardDrive className="w-4 h-4" /> Storage Used</div>
            <div className="text-2xl font-bold">{formatBytes(storageUsed)}</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2"><Clock className="w-4 h-4" /> Last Indexed</div>
            <div className="text-2xl font-bold">
              {lastIndexedDate ? formatDistanceToNow(new Date(lastIndexedDate), { addSuffix: true }) : "Never"}
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2"><Folder className="w-4 h-4" /> Indexed Folders</div>
            <div className="text-2xl font-bold">{dashboard?.total_folders ?? 0}</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2"><MessageSquare className="w-4 h-4" /> Conversations</div>
            <div className="text-2xl font-bold">{dashboard?.total_conversations ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Recent Uploads</CardTitle>
          </CardHeader>
          <CardContent>
            {dashboard?.recent_documents && dashboard.recent_documents.length > 0 ? (
              <div className="space-y-4">
                {dashboard.recent_documents.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between p-3 rounded-lg border bg-card/50 hover:bg-accent/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded bg-muted">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="font-medium text-sm truncate max-w-[200px]">{doc.title || doc.file_name}</p>
                        <p className="text-xs text-muted-foreground">{format(new Date(doc.created_at), "MMM d, yyyy")}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {doc.status === "indexed" ? (
                        <CheckCircle className="w-4 h-4 text-emerald-500" />
                      ) : doc.status === "failed" ? (
                        <AlertTriangle className="w-4 h-4 text-destructive" />
                      ) : (
                        <Activity className="w-4 h-4 text-amber-500" />
                      )}
                      <span className="text-xs font-medium capitalize">{doc.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="w-8 h-8 mx-auto mb-3 opacity-20" />
                <p>No documents uploaded yet</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Documents by Type</CardTitle>
          </CardHeader>
          <CardContent>
            {dashboard?.by_type && dashboard.by_type.length > 0 ? (
              <div className="space-y-3">
                {dashboard.by_type.map((row) => {
                  const total = dashboard.total_documents || 1;
                  const pct = Math.round((row.count / total) * 100);
                  return (
                    <div key={row.type}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="font-medium capitalize">{row.type}</span>
                        <span className="text-muted-foreground">{row.count} ({pct}%)</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Database className="w-8 h-8 mx-auto mb-3 opacity-20" />
                <p>No documents to categorize yet</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
