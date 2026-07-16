import { useRef, useState } from "react";
import { useDocuments, useComparisonTopics, useRunComparison, useRunRisk } from "@/hooks/useRag";
import { api, downloadBlob } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ErrorState";
import { toast } from "sonner";
import { Columns, Download, Loader2, Play, CheckSquare, AlertTriangle, ShieldCheck, Quote, GitCompareArrows } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import type { ComparisonRow, ComparisonDocRef, RiskResult } from "@/lib/types";

const missingInfoFallback = "I could not locate that information in the indexed documents.";

function diffStatus(row: ComparisonRow, docs: ComparisonDocRef[]) {
  const vals = docs
    .map((d) => (row.values[String(d.id)] || "").trim())
    .filter((v) => v && v !== missingInfoFallback);
  if (vals.length < 2) {
    return { label: "Insufficient data", className: "text-muted-foreground border-muted-foreground/30 bg-muted/30" };
  }
  const allSame = vals.every((v) => v.toLowerCase() === vals[0].toLowerCase());
  return allSame
    ? { label: "Aligned", className: "text-emerald-600 border-emerald-500/30 bg-emerald-500/10" }
    : { label: "Differs", className: "text-amber-600 border-amber-500/30 bg-amber-500/10" };
}

const severityClass = (sev: string) => {
  switch (sev) {
    case "high":
      return "text-destructive border-destructive/30 bg-destructive/10";
    case "medium":
      return "text-amber-600 border-amber-500/30 bg-amber-500/10";
    case "low":
      return "text-blue-600 border-blue-500/30 bg-blue-500/10";
    default:
      return "text-muted-foreground border-muted-foreground/30 bg-muted/30";
  }
};

export default function Comparisons() {
  const documentsQuery = useDocuments({ status: "indexed" });
  const topicsQuery = useComparisonTopics();
  const { data: documents } = documentsQuery;
  const { data: topicsData } = topicsQuery;

  const [selectedDocs, setSelectedDocs] = useState<number[]>([]);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);

  const runComparison = useRunComparison();
  const runRisk = useRunRisk();
  const [riskResults, setRiskResults] = useState<Record<number, RiskResult>>({});
  const [risksLoading, setRisksLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const runIdRef = useRef(0);

  const toggleDoc = (id: number) => {
    setSelectedDocs((prev) => (prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]));
  };

  const toggleTopic = (topic: string) => {
    setSelectedTopics((prev) => (prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic]));
  };

  const handleRun = () => {
    if (selectedDocs.length < 2) return;
    const docs = [...selectedDocs];
    const runId = ++runIdRef.current;

    runComparison.mutate(
      {
        document_ids: docs,
        topics: selectedTopics.length > 0 ? selectedTopics : undefined,
      },
      { onError: (err) => toast.error(`Comparison failed: ${err.message}`) },
    );

    // Risk notes come from the per-document /risk endpoint (real data, not derived
    // from the comparison matrix). Fetch one per selected document in parallel.
    // Guard every state write with runId so a slower previous run can never
    // overwrite the results of a newer one (stale-data protection).
    setRiskResults({});
    setRisksLoading(true);
    Promise.all(
      docs.map((id) =>
        runRisk
          .mutateAsync({ document_id: id })
          .then((r) => [id, r] as const)
          .catch(() => null),
      ),
    )
      .then((entries) => {
        if (runIdRef.current !== runId) return;
        const map: Record<number, RiskResult> = {};
        let failures = 0;
        for (const e of entries) {
          if (e) map[e[0]] = e[1];
          else failures += 1;
        }
        setRiskResults(map);
        if (failures > 0) {
          toast.error(`Risk analysis failed for ${failures} document${failures === 1 ? "" : "s"}.`);
        }
      })
      .finally(() => {
        if (runIdRef.current === runId) setRisksLoading(false);
      });
  };

  const handleExport = async () => {
    if (selectedDocs.length < 2) return;
    setIsExporting(true);
    try {
      const blob = await api.exportComparison({
        document_ids: selectedDocs,
        topics: selectedTopics.length > 0 ? selectedTopics : undefined,
      });
      downloadBlob(blob, "comparison.xlsx");
      toast.success("Export downloaded");
    } catch (err) {
      toast.error(`Export failed: ${(err as Error).message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const comparison = runComparison.data;

  if (documentsQuery.isError || topicsQuery.isError) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <ErrorState
          title="Could not load comparison data"
          error={documentsQuery.error ?? topicsQuery.error}
          onRetry={() => {
            documentsQuery.refetch();
            topicsQuery.refetch();
          }}
          isRetrying={documentsQuery.isFetching || topicsQuery.isFetching}
        />
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-7xl mx-auto">
      <div className="flex justify-between items-end border-b pb-4">
        <div>
          <h1 className="text-4xl font-serif font-bold tracking-tight">Comparisons</h1>
          <p className="text-muted-foreground mt-2">Compare contracts topic-by-topic with difference flags, risk notes, and citations.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={handleExport} disabled={selectedDocs.length < 2 || isExporting || !comparison}>
            {isExporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            Export Excel
          </Button>
          <Button onClick={handleRun} disabled={selectedDocs.length < 2 || runComparison.isPending}>
            {runComparison.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
            Run Comparison
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="md:col-span-2">
          <CardContent className="p-4 space-y-3">
            <h3 className="font-semibold text-sm flex justify-between items-center">
              Select Documents (Min 2)
              <Badge variant="secondary">{selectedDocs.length} selected</Badge>
            </h3>
            <ScrollArea className="h-[150px] w-full border rounded-md p-2 bg-muted/10">
              <div className="space-y-1">
                {documents?.map((doc) => (
                  <div
                    key={doc.id}
                    className={cn(
                      "flex items-center gap-2 p-2 rounded cursor-pointer text-sm transition-colors",
                      selectedDocs.includes(doc.id) ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted",
                    )}
                    onClick={() => toggleDoc(doc.id)}
                  >
                    <CheckSquare className={cn("w-4 h-4", selectedDocs.includes(doc.id) ? "text-primary" : "text-muted-foreground opacity-30")} />
                    <span className="truncate">{doc.title || doc.file_name}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardContent className="p-4 space-y-3">
            <h3 className="font-semibold text-sm flex justify-between items-center">
              Optional Topics
              <Badge variant="secondary">{selectedTopics.length || "Default"} selected</Badge>
            </h3>
            <ScrollArea className="h-[150px] w-full border rounded-md p-2 bg-muted/10">
              <div className="flex flex-wrap gap-2">
                {topicsData?.topics.map((topic) => (
                  <Badge
                    key={topic}
                    variant={selectedTopics.includes(topic) ? "default" : "outline"}
                    className="cursor-pointer hover:opacity-80 py-1.5 px-3 font-normal"
                    onClick={() => toggleTopic(topic)}
                  >
                    {topic}
                  </Badge>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Comparison matrix */}
      <div className="min-h-[300px] border rounded-xl bg-card shadow-sm overflow-hidden">
        {runComparison.isPending ? (
          <div className="p-8 space-y-4 flex flex-col h-[300px] items-center justify-center">
            <Loader2 className="w-12 h-12 text-primary animate-spin mb-2" />
            <h3 className="text-xl font-medium">Analyzing Documents</h3>
            <p className="text-muted-foreground max-w-sm text-center">Reading and comparing topics across the selected documents. This may take a minute.</p>
          </div>
        ) : runComparison.isError ? (
          <div className="h-[300px] flex flex-col items-center justify-center text-center p-8">
            <AlertTriangle className="w-10 h-10 text-destructive mb-3" />
            <p className="font-medium">Comparison failed</p>
            <p className="text-sm text-muted-foreground mt-1">{(runComparison.error as Error)?.message}</p>
          </div>
        ) : comparison ? (
          <ScrollArea className="w-full max-h-[520px]">
            <div className="min-w-[800px]">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className="p-4 border-b border-r bg-muted/30 font-serif font-bold text-lg sticky top-0 left-0 z-20 w-[260px] min-w-[260px] backdrop-blur-md">
                      Topic
                    </th>
                    {comparison.documents.map((doc) => (
                      <th key={doc.id} className="p-4 border-b bg-muted/30 font-medium text-sm sticky top-0 z-10 w-[300px] align-top backdrop-blur-md">
                        <div className="flex items-start gap-2">
                          <div className="w-8 h-8 rounded bg-background flex items-center justify-center shrink-0 shadow-sm">
                            <Columns className="w-4 h-4 text-primary" />
                          </div>
                          <span className="line-clamp-2">{doc.name}</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {comparison.rows.map((row, i) => {
                    const diff = diffStatus(row, comparison.documents);
                    return (
                      <tr key={i} className="group hover:bg-muted/10 transition-colors">
                        <td className="p-4 border-b border-r font-medium text-sm sticky left-0 z-10 bg-card align-top group-hover:bg-muted/50">
                          <div>{row.topic}</div>
                          <Badge variant="outline" className={cn("mt-2 gap-1 font-normal", diff.className)}>
                            <GitCompareArrows className="w-3 h-3" /> {diff.label}
                          </Badge>
                        </td>
                        {comparison.documents.map((doc) => {
                          const val = row.values[String(doc.id)];
                          const isMissing = val === missingInfoFallback;
                          return (
                            <td key={doc.id} className="p-4 border-b align-top text-sm">
                              <div className={cn("prose dark:prose-invert max-w-none text-sm leading-relaxed", isMissing && "text-muted-foreground/60 italic")}>
                                {val || "-"}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        ) : (
          <div className="h-[300px] flex flex-col items-center justify-center text-center text-muted-foreground">
            <Columns className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <h3 className="text-xl font-medium text-foreground mb-2">Build a Comparison</h3>
            <p className="max-w-md mx-auto">Select at least 2 documents from the list above and click Run Comparison to generate a side-by-side analysis matrix.</p>
          </div>
        )}
      </div>

      {/* Risk notes & citations (per document, from the /risk endpoint) */}
      {comparison && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-serif font-bold">Risk Notes &amp; Citations</h2>
            {risksLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          </div>

          {risksLoading && Object.keys(riskResults).length === 0 ? (
            <p className="text-sm text-muted-foreground">Analyzing risks across the selected documents…</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {comparison.documents.map((doc) => {
                const risk = riskResults[doc.id];
                return (
                  <Card key={doc.id} className="shadow-sm">
                    <CardContent className="p-5 space-y-4">
                      <div className="flex items-center gap-2 border-b pb-3">
                        <Columns className="w-4 h-4 text-primary shrink-0" />
                        <span className="font-medium truncate">{doc.name}</span>
                        {risk && (
                          <Badge variant="secondary" className="ml-auto shrink-0">
                            {risk.count} {risk.count === 1 ? "finding" : "findings"}
                          </Badge>
                        )}
                      </div>

                      {!risk ? (
                        <p className="text-sm text-muted-foreground">No risk analysis available for this document.</p>
                      ) : risk.findings.length === 0 ? (
                        <p className="text-sm text-muted-foreground italic">{risk.summary || missingInfoFallback}</p>
                      ) : (
                        <div className="space-y-4">
                          {risk.findings.map((f, idx) => (
                            <div key={idx} className="rounded-lg border bg-muted/10 p-3 space-y-2">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className={cn("capitalize", severityClass(f.severity))}>
                                  {f.severity}
                                </Badge>
                                <span className="text-sm font-medium">{f.category}</span>
                              </div>
                              <p className="text-sm leading-relaxed">{f.description}</p>
                              {f.evidence && (
                                <div className="text-xs text-muted-foreground border-l-2 border-primary/30 pl-3 italic flex gap-2">
                                  <Quote className="w-3 h-3 shrink-0 mt-0.5" />
                                  <span>"{f.evidence}" — {doc.name}</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
