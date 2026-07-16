import { useState } from "react";
import { useSearch, useDocuments } from "@/hooks/useRag";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Search as SearchIcon, FileText, CheckCircle2, ChevronRight, SlidersHorizontal, Loader2, Eye } from "lucide-react";
import type { SearchMode, Citation } from "@/lib/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export default function Search() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<SearchMode>("semantic");
  const [topK, setTopK] = useState("10");
  const [documentType, setDocumentType] = useState("");
  const [vendor, setVendor] = useState("");
  const [selectedDocs, setSelectedDocs] = useState<number[]>([]);
  const [preview, setPreview] = useState<Citation | null>(null);

  const { data: documents } = useDocuments({ status: "indexed" });
  const searchMutation = useSearch();

  const handleSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;

    searchMutation.mutate({
      query: query.trim(),
      mode,
      top_k: topK ? parseInt(topK, 10) : undefined,
      document_type: documentType || undefined,
      vendor: vendor || undefined,
      document_ids: selectedDocs.length > 0 ? selectedDocs : undefined
    }, {
      onError: (err) => {
        toast.error(`Search failed: ${err.message}`);
      }
    });
  };

  return (
    <div className="p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-6xl mx-auto h-full flex flex-col">
      <div className="flex justify-between items-end border-b pb-4 shrink-0">
        <div>
          <h1 className="text-4xl font-serif font-bold tracking-tight">Search</h1>
          <p className="text-muted-foreground mt-2">Semantic and keyword retrieval across your corpus.</p>
        </div>
      </div>

      <div className="shrink-0 space-y-4">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <SearchIcon className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input 
              value={query} 
              onChange={e => setQuery(e.target.value)} 
              placeholder="Search across all documents..." 
              className="pl-10 h-12 text-base rounded-xl shadow-sm"
            />
          </div>
          <Button type="submit" size="lg" className="h-12 px-8 rounded-xl shadow-sm" disabled={searchMutation.isPending || !query.trim()}>
            {searchMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Search"}
          </Button>
        </form>

        <div className="flex flex-wrap gap-3 items-center p-3 bg-muted/30 rounded-lg border">
          <SlidersHorizontal className="w-4 h-4 text-muted-foreground ml-2" />
          <span className="text-sm font-medium text-muted-foreground mr-2">Filters:</span>
          
          <Select value={mode} onValueChange={(v: SearchMode) => setMode(v)}>
            <SelectTrigger className="w-[140px] h-8 text-xs bg-background">
              <SelectValue placeholder="Mode" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="semantic">Semantic (AI)</SelectItem>
              <SelectItem value="keyword">Keyword (Exact)</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2 border-l pl-3">
            <span className="text-xs text-muted-foreground">Top K</span>
            <Input 
              type="number" 
              className="w-16 h-8 text-xs bg-background" 
              value={topK} 
              onChange={e => setTopK(e.target.value)}
              min="1"
              max="50"
            />
          </div>

          <Input 
            placeholder="Type..." 
            className="w-24 h-8 text-xs bg-background ml-2" 
            value={documentType} 
            onChange={e => setDocumentType(e.target.value)} 
          />

          <Input 
            placeholder="Vendor..." 
            className="w-24 h-8 text-xs bg-background" 
            value={vendor} 
            onChange={e => setVendor(e.target.value)} 
          />

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-8 text-xs bg-background w-[180px] justify-start truncate">
                {selectedDocs.length > 0 ? `${selectedDocs.length} Docs Selected` : "Select Documents..."}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0" align="start">
              <div className="p-2 max-h-64 overflow-auto space-y-1">
                {documents?.map(doc => (
                  <div key={doc.id} className="flex items-center space-x-2 p-1 hover:bg-muted rounded">
                    <Checkbox 
                      id={`doc-${doc.id}`}
                      checked={selectedDocs.includes(doc.id)}
                      onCheckedChange={(checked) => {
                        if (checked) setSelectedDocs(prev => [...prev, doc.id]);
                        else setSelectedDocs(prev => prev.filter(id => id !== doc.id));
                      }}
                    />
                    <label htmlFor={`doc-${doc.id}`} className="text-sm font-medium leading-none cursor-pointer truncate">
                      {doc.title || doc.file_name}
                    </label>
                  </div>
                ))}
              </div>
              {selectedDocs.length > 0 && (
                <div className="p-2 border-t border-border">
                  <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setSelectedDocs([])}>Clear Selection</Button>
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="flex-1 overflow-auto min-h-[400px]">
        {searchMutation.isPending ? (
          <div className="space-y-4">
            {[1,2,3].map(i => <Skeleton key={i} className="h-32 w-full" />)}
          </div>
        ) : searchMutation.isError ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-center">
            <SearchIcon className="w-8 h-8 mx-auto text-destructive mb-3" />
            <p className="font-medium">Search failed</p>
            <p className="text-sm text-muted-foreground mt-1">{(searchMutation.error as Error)?.message}</p>
          </div>
        ) : searchMutation.data ? (
          <div className="space-y-6">
            <h2 className="font-semibold text-lg border-b pb-2">
              Found {searchMutation.data.results.length} results
            </h2>
            
            {searchMutation.data.results.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground bg-muted/20 border rounded-lg">
                <SearchIcon className="w-8 h-8 mx-auto mb-3 opacity-20" />
                <p>No results found for your query.</p>
                <p className="text-sm mt-1">Try adjusting your filters or search terms.</p>
              </div>
            ) : (
              <div className="space-y-4 pb-12">
                {searchMutation.data.results.map((cit, i) => (
                  <Card key={i} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-5">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-primary" />
                          <span className="font-medium">{cit.document_name}</span>
                          {cit.page_number && <Badge variant="secondary" className="text-xs">Page {cit.page_number}</Badge>}
                        </div>
                        {searchMutation.data.mode === "semantic" && cit.confidence !== null ? (
                          <Badge variant="outline" className={cit.confidence > 0.8 ? "text-emerald-500 border-emerald-500/30 bg-emerald-500/10" : cit.confidence > 0.5 ? "text-amber-500 border-amber-500/30 bg-amber-500/10" : "text-muted-foreground"}>
                            {(cit.confidence * 100).toFixed(0)}% Match
                          </Badge>
                        ) : searchMutation.data.mode === "keyword" ? (
                          <Badge variant="outline" className="text-blue-500 border-blue-500/30 bg-blue-500/10">Keyword Match</Badge>
                        ) : null}
                      </div>
                      
                      {cit.heading && <h4 className="text-sm font-semibold mb-2 flex items-center"><ChevronRight className="w-3 h-3 mr-1 text-muted-foreground"/> {cit.heading}</h4>}
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap pl-4 border-l-2 border-primary/20 italic bg-muted/10 p-3 rounded-r-md line-clamp-4">"{cit.quoted_text}"</p>
                      <div className="mt-3 flex justify-end">
                        <Button variant="outline" size="sm" onClick={() => setPreview(cit)}>
                          <Eye className="w-3.5 h-3.5 mr-2" /> Open / Preview
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center py-20 text-muted-foreground border-2 border-dashed rounded-xl">
            <SearchIcon className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <h3 className="text-xl font-medium text-foreground mb-2">Search your documents</h3>
            <p className="max-w-md mx-auto">Enter a query above to search through all your indexed documents. Use Semantic mode for conceptual matching, or Keyword mode for exact text matching.</p>
          </div>
        )}
      </div>

      <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" /> {preview?.document_name}
            </DialogTitle>
            <DialogDescription>
              {preview?.page_number != null && <span>Page {preview.page_number}</span>}
              {preview?.page_number != null && preview?.heading && <span> · </span>}
              {preview?.heading && <span>{preview.heading}</span>}
            </DialogDescription>
          </DialogHeader>
          {preview?.confidence != null && (
            <Badge variant="outline" className="w-fit text-emerald-500 border-emerald-500/30 bg-emerald-500/10">
              {(preview.confidence * 100).toFixed(0)}% match
            </Badge>
          )}
          <div className="max-h-[50vh] overflow-auto text-sm leading-relaxed whitespace-pre-wrap rounded-lg border bg-muted/30 p-4">
            {preview?.quoted_text}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
