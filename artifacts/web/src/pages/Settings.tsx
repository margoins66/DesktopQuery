import { useState } from "react";
import {
  useSettings,
  useUpdateSettings,
  useProviders,
  useFolders,
  useAddFolder,
  useRescanFolder,
  useDeleteFolder,
} from "@/hooks/useRag";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ErrorState";
import { toast } from "sonner";
import {
  Save,
  Settings2,
  Database,
  Key,
  Palette,
  Scissors,
  ShieldAlert,
  Folder,
  HardDrive,
  RefreshCw,
  Plus,
  Trash2,
  RotateCcw,
} from "lucide-react";
import { format } from "date-fns";

export default function Settings() {
  const settingsQuery = useSettings();
  const { data: settings, isLoading, isError, error } = settingsQuery;
  const { data: providers } = useProviders();
  const updateSettings = useUpdateSettings();

  const { data: folders, isLoading: foldersLoading } = useFolders();
  const addFolder = useAddFolder();
  const rescanFolder = useRescanFolder();
  const deleteFolder = useDeleteFolder();
  const [newFolderPath, setNewFolderPath] = useState("");

  const [form, setForm] = useState<Record<string, string>>({});
  const [hasChanges, setHasChanges] = useState(false);

  // Initialize form when settings load
  if (!isLoading && settings && Object.keys(form).length === 0 && !hasChanges) {
    setForm({
      llm_provider: settings.llm_provider || "",
      llm_model: settings.llm_model || "",
      ollama_base_url: settings.ollama_base_url || "",
      anthropic_model: settings.anthropic_model || "",
      embedding_provider: settings.embedding_provider || "",
      openai_embedding_model: settings.openai_embedding_model || "",
      chunk_size: settings.chunk_size || "",
      chunk_overlap: settings.chunk_overlap || "",
      theme: settings.theme || "system",
      local_only: settings.local_only || "false",
      retrieval_top_k: settings.retrieval_top_k || "5",
    });
  }

  const handleChange = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = () => {
    updateSettings.mutate(form, {
      onSuccess: () => {
        toast.success("Settings saved successfully");
        setHasChanges(false);
      },
      onError: (err) => {
        toast.error(`Failed to save settings: ${err.message}`);
      },
    });
  };

  const handleAddFolder = () => {
    if (!newFolderPath.trim()) return;
    addFolder.mutate(newFolderPath, {
      onSuccess: () => {
        toast.success("Folder added successfully");
        setNewFolderPath("");
      },
      onError: (err) => toast.error(`Failed to add folder: ${err.message}`),
    });
  };

  if (isLoading) {
    return (
      <div className="p-8 space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <ErrorState
          title="Could not load settings"
          error={error}
          onRetry={() => settingsQuery.refetch()}
          isRetrying={settingsQuery.isFetching}
        />
      </div>
    );
  }

  const cloudEnabled = settings?.cloud_ai_enabled;
  const localOnly = form.local_only === "true";

  return (
    <div className="p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl mx-auto">
      <div className="flex justify-between items-end border-b pb-4">
        <div>
          <h1 className="text-4xl font-serif font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground mt-2">Configure models, providers, and application behavior.</p>
        </div>
        <Button onClick={handleSave} disabled={!hasChanges || updateSettings.isPending}>
          {updateSettings.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Save Changes
        </Button>
      </div>

      {cloudEnabled && !localOnly && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-amber-600 dark:text-amber-400">Cloud AI is enabled</p>
            <p className="text-muted-foreground mt-0.5">
              Document content and questions may be sent to a third-party cloud provider for
              processing. Enable <span className="font-medium">Local Only Mode</span> below to keep
              all data on-device.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Settings2 className="w-5 h-5" /> Generation Models</CardTitle>
            <CardDescription>Configure the primary LLM used for chat and summaries.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>LLM Provider</Label>
                <Select value={form.llm_provider} onValueChange={(v) => handleChange("llm_provider", v)}>
                  <SelectTrigger><SelectValue placeholder="Select provider..." /></SelectTrigger>
                  <SelectContent>
                    {providers?.llm.map((p) => (
                      <SelectItem key={p.id} value={p.id} disabled={p.status === "coming_soon"}>
                        {p.label} {p.status === "coming_soon" && "(Coming Soon)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Model Name</Label>
                <Input value={form.llm_model || ""} onChange={(e) => handleChange("llm_model", e.target.value)} placeholder="e.g. gpt-4o" />
              </div>
            </div>

            {form.llm_provider === "ollama" && (
              <div className="space-y-2">
                <Label>Ollama Base URL</Label>
                <Input value={form.ollama_base_url || ""} onChange={(e) => handleChange("ollama_base_url", e.target.value)} placeholder="http://localhost:11434" />
              </div>
            )}

            {form.llm_provider === "anthropic" && (
              <div className="space-y-2">
                <Label>Anthropic Model</Label>
                <Input value={form.anthropic_model || ""} onChange={(e) => handleChange("anthropic_model", e.target.value)} placeholder="e.g. claude-3-5-sonnet-latest" />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Database className="w-5 h-5" /> Embedding Models</CardTitle>
            <CardDescription>Configure how documents are vectorized and retrieved.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Embedding Provider</Label>
                <Select value={form.embedding_provider} onValueChange={(v) => handleChange("embedding_provider", v)}>
                  <SelectTrigger><SelectValue placeholder="Select provider..." /></SelectTrigger>
                  <SelectContent>
                    {providers?.embeddings.map((p) => (
                      <SelectItem key={p.id} value={p.id} disabled={p.status === "coming_soon"}>
                        {p.label} {p.status === "coming_soon" && "(Coming Soon)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Retrieval Top K</Label>
                <Input type="number" value={form.retrieval_top_k || ""} onChange={(e) => handleChange("retrieval_top_k", e.target.value)} />
              </div>
            </div>
            {form.embedding_provider === "openai" && (
              <div className="space-y-2">
                <Label>OpenAI Embedding Model</Label>
                <Input value={form.openai_embedding_model || ""} onChange={(e) => handleChange("openai_embedding_model", e.target.value)} placeholder="e.g. text-embedding-3-small" />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Scissors className="w-5 h-5" /> Chunking</CardTitle>
            <CardDescription>Control how documents are split before indexing. Changes apply to newly indexed documents.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Chunk Size (characters)</Label>
                <Input type="number" value={form.chunk_size || ""} onChange={(e) => handleChange("chunk_size", e.target.value)} placeholder="e.g. 1000" />
              </div>
              <div className="space-y-2">
                <Label>Chunk Overlap (characters)</Label>
                <Input type="number" value={form.chunk_overlap || ""} onChange={(e) => handleChange("chunk_overlap", e.target.value)} placeholder="e.g. 200" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Palette className="w-5 h-5" /> Appearance</CardTitle>
            <CardDescription>Customize the look and feel of the interface.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Theme</Label>
                <p className="text-sm text-muted-foreground">Choose light, dark, or follow your system.</p>
              </div>
              <Select value={form.theme} onValueChange={(v) => handleChange("theme", v)}>
                <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Key className="w-5 h-5" /> API Keys & Security</CardTitle>
            <CardDescription>Manage credentials for cloud providers.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  OpenAI API Key
                  {settings?.openai_api_key_set && (
                    <Badge variant="outline" className="text-emerald-500 border-emerald-500/30 bg-emerald-500/10 text-[10px]">
                      Configured{settings.openai_api_key_source === "environment" ? " (env)" : ""}
                    </Badge>
                  )}
                </Label>
                <Input
                  type="password"
                  placeholder={settings?.openai_api_key_set ? "••••••••••••••••" : "sk-..."}
                  onChange={(e) => handleChange("openai_api_key", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  Anthropic API Key
                  {settings?.anthropic_api_key_set && (
                    <Badge variant="outline" className="text-emerald-500 border-emerald-500/30 bg-emerald-500/10 text-[10px]">
                      Configured{settings.anthropic_api_key_source === "environment" ? " (env)" : ""}
                    </Badge>
                  )}
                </Label>
                <Input
                  type="password"
                  placeholder={settings?.anthropic_api_key_set ? "••••••••••••••••" : "sk-ant-..."}
                  onChange={(e) => handleChange("anthropic_api_key", e.target.value)}
                />
              </div>
            </div>

            <div className="pt-4 border-t">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Local Only Mode</Label>
                  <p className="text-sm text-muted-foreground">Force all requests to stay on-device.</p>
                </div>
                <Select value={form.local_only} onValueChange={(v) => handleChange("local_only", v)}>
                  <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Enabled</SelectItem>
                    <SelectItem value="false">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Folder className="w-5 h-5" /> Indexed Folders</CardTitle>
            <CardDescription>Local directories automatically scanned and indexed.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3 mb-6">
              <Input
                placeholder="Absolute folder path (e.g. /Users/name/Documents)"
                value={newFolderPath}
                onChange={(e) => setNewFolderPath(e.target.value)}
                className="max-w-md"
              />
              <Button onClick={handleAddFolder} disabled={addFolder.isPending || !newFolderPath.trim()}>
                {addFolder.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                Add
              </Button>
            </div>

            {foldersLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : folders && folders.length > 0 ? (
              <div className="space-y-3">
                {folders.map((folder) => (
                  <div key={folder.id} className="flex items-center justify-between p-4 border rounded-lg bg-card shadow-sm">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="p-2.5 bg-muted rounded-md shrink-0">
                        <HardDrive className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div className="truncate">
                        <p className="font-medium text-sm truncate">{folder.path}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          {folder.enabled ? <span className="text-emerald-500">Active</span> : <span>Inactive</span>}
                          <span>•</span>
                          Last scanned: {folder.last_scanned ? format(new Date(folder.last_scanned), "MMM d, yyyy HH:mm") : "Never"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button variant="outline" size="sm" onClick={() => rescanFolder.mutate(folder.id)} disabled={rescanFolder.isPending}>
                        <RefreshCw className="w-3 h-3 mr-2" /> Rescan
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => deleteFolder.mutate(folder.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-10 border rounded-md border-dashed">
                <Folder className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground font-medium">No folders configured</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><RotateCcw className="w-5 h-5" /> Index Maintenance</CardTitle>
            <CardDescription>Bulk operations across the entire vector index.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" disabled className="gap-2">
                <RefreshCw className="w-4 h-4" /> Rebuild Index
                <Badge variant="secondary" className="ml-1 text-[10px]">Coming Soon</Badge>
              </Button>
              <Button variant="outline" disabled className="gap-2">
                <Trash2 className="w-4 h-4" /> Clear Index
                <Badge variant="secondary" className="ml-1 text-[10px]">Coming Soon</Badge>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              To re-index a single document, use the re-index action on the Documents page.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
