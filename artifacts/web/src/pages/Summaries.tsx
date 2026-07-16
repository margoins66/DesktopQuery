import { useState, useEffect } from "react";
import { useSearchParams } from "wouter";
import { useDocuments, useSummaryStyles, useGenerateSummary } from "@/hooks/useRag";
import { api, downloadBlob } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ErrorState } from "@/components/ErrorState";
import { toast } from "sonner";
import { FileText, Download, Loader2, Play, ChevronRight, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Summaries() {
  const documentsQuery = useDocuments({ status: "indexed" });
  const stylesQuery = useSummaryStyles();
  const { data: documents } = documentsQuery;
  const { data: styles } = stylesQuery;
  
  const [selectedDocId, setSelectedDocId] = useState<string>("");
  const [selectedStyle, setSelectedStyle] = useState<string>("");
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const doc = searchParams.get("doc");
    if (doc) setSelectedDocId(doc);
  }, [searchParams]);

  const generateSummary = useGenerateSummary();
  const [isExporting, setIsExporting] = useState(false);

  const handleGenerate = () => {
    if (!selectedDocId) return;
    generateSummary.mutate({
      document_id: parseInt(selectedDocId, 10),
      style: selectedStyle || undefined
    }, {
      onError: (err) => toast.error(`Summary failed: ${err.message}`)
    });
  };

  const handleExport = async () => {
    if (!selectedDocId || !generateSummary.data) return;
    setIsExporting(true);
    try {
      const blob = await api.exportSummary({
        document_id: parseInt(selectedDocId, 10),
        style: selectedStyle || undefined
      });
      downloadBlob(blob, "summary.pdf");
      toast.success("PDF downloaded");
    } catch (err: any) {
      toast.error(`Export failed: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const missingInfoFallback = "I could not locate that information in the indexed documents.";

  if (documentsQuery.isError || stylesQuery.isError) {
    return (
      <div className="p-8 max-w-5xl mx-auto">
        <ErrorState
          title="Could not load summary data"
          error={documentsQuery.error ?? stylesQuery.error}
          onRetry={() => {
            documentsQuery.refetch();
            stylesQuery.refetch();
          }}
          isRetrying={documentsQuery.isFetching || stylesQuery.isFetching}
        />
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-5xl mx-auto h-full flex flex-col">
      <div className="flex justify-between items-end border-b pb-4 shrink-0">
        <div>
          <h1 className="text-4xl font-serif font-bold tracking-tight">Summaries</h1>
          <p className="text-muted-foreground mt-2">Generate styled briefs for long documents.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={handleExport} disabled={!generateSummary.data || isExporting}>
            {isExporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            Export PDF
          </Button>
          <Button onClick={handleGenerate} disabled={!selectedDocId || generateSummary.isPending}>
            {generateSummary.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
            Generate
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 shrink-0">
        <div className="space-y-2">
          <label className="text-sm font-semibold">Select Document</label>
          <Select value={selectedDocId} onValueChange={setSelectedDocId}>
            <SelectTrigger className="w-full bg-card">
              <SelectValue placeholder="Choose a document..." />
            </SelectTrigger>
            <SelectContent>
              {documents?.map(doc => (
                <SelectItem key={doc.id} value={String(doc.id)}>
                  {doc.title || doc.file_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-semibold">Summary Style</label>
          <Select
            value={selectedStyle || "default"}
            onValueChange={(v) => setSelectedStyle(v === "default" ? "" : v)}
          >
            <SelectTrigger className="w-full bg-card">
              <SelectValue placeholder="Default Style" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Default</SelectItem>
              {styles?.map(s => (
                <SelectItem key={s.key} value={s.key}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-1 overflow-hidden min-h-[400px]">
        {generateSummary.isPending ? (
          <div className="h-full p-8 border rounded-xl bg-card shadow-sm space-y-4">
            <Skeleton className="h-8 w-1/3 mb-6" />
            {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-4 w-full" />)}
            <Skeleton className="h-4 w-4/5" />
          </div>
        ) : generateSummary.isError ? (
          <div className="h-full flex flex-col items-center justify-center text-center rounded-xl border border-destructive/30 bg-destructive/10 p-8">
            <AlertTriangle className="w-8 h-8 text-destructive mb-3" />
            <p className="font-medium">Could not generate the summary</p>
            <p className="text-sm text-muted-foreground mt-1">{(generateSummary.error as Error)?.message}</p>
          </div>
        ) : generateSummary.data ? (
          <div className="h-full border rounded-xl bg-card shadow-sm flex flex-col">
            <div className="p-6 border-b bg-muted/20">
              <h2 className="text-2xl font-serif font-bold">
                {documents?.find(d => String(d.id) === selectedDocId)?.title || documents?.find(d => String(d.id) === selectedDocId)?.file_name}
              </h2>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="secondary">Summary</Badge>
                {generateSummary.data.style_label && (
                  <Badge variant="outline">{generateSummary.data.style_label}</Badge>
                )}
              </div>
            </div>
            
            <div className="flex-1 overflow-auto p-8 flex flex-col lg:flex-row gap-8">
              <div className="flex-1">
                <div className={cn(
                  "prose dark:prose-invert max-w-none text-base leading-relaxed whitespace-pre-wrap",
                  generateSummary.data.summary === missingInfoFallback && "text-muted-foreground italic"
                )}>
                  {generateSummary.data.summary}
                </div>
              </div>
              
              {generateSummary.data.citations && generateSummary.data.citations.length > 0 && (
                <div className="w-full lg:w-80 shrink-0 space-y-4 border-t lg:border-t-0 lg:border-l pt-6 lg:pt-0 lg:pl-6">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">Sources</h3>
                  <div className="space-y-4">
                    {generateSummary.data.citations.map((cit, i) => (
                      <Card key={i} className="bg-muted/30 shadow-none border-none">
                        <CardContent className="p-3 text-sm">
                          <div className="flex items-start gap-2 mb-2">
                            <FileText className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium line-clamp-1">{cit.document_name}</span>
                                {cit.confidence != null && (
                                  <span className="ml-auto shrink-0 rounded-full bg-primary/10 text-primary text-xs px-1.5 py-0.5 font-medium">
                                    {Math.round(cit.confidence * 100)}%
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {cit.page_number != null && <span>Page {cit.page_number}</span>}
                                {cit.page_number != null && cit.heading && <span> · </span>}
                                {cit.heading && <span>{cit.heading}</span>}
                              </div>
                            </div>
                          </div>
                          {cit.quoted_text && (
                            <p className="text-xs text-muted-foreground pl-6 border-l-2 border-primary/20 italic">"{cit.quoted_text}"</p>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center py-20 text-muted-foreground border-2 border-dashed rounded-xl">
            <FileText className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <h3 className="text-xl font-medium text-foreground mb-2">Generate a Summary</h3>
            <p className="max-w-md mx-auto">Select a document and a style template, then click Generate to create an AI-powered summary with citations.</p>
          </div>
        )}
      </div>
    </div>
  );
}
