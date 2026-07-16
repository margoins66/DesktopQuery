import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "wouter";
import {
  useConversations,
  useMessages,
  useCreateConversation,
  useDeleteConversation,
  useBookmarkConversation,
  useDocuments,
  qk,
} from "@/hooks/useRag";
import { askStream, api, downloadBlob } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { MessageSquare, Plus, Send, FileText, Trash2, Bookmark, Download, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Citation, Message } from "@/lib/types";

function CitationList({ citations, onSelect }: { citations: Citation[]; onSelect: (c: Citation) => void }) {
  if (!citations || citations.length === 0) return null;
  return (
    <div className="mt-4 pt-4 border-t border-border/50 space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Sources
      </p>
      {citations.map((cit, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onSelect(cit)}
          className="w-full text-left text-xs bg-muted/50 hover:bg-muted p-2 rounded flex items-start gap-2 transition-colors"
        >
          <FileText className="w-3 h-3 mt-0.5 shrink-0 text-primary" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <span className="font-medium">{cit.document_name}</span>
              {cit.page_number != null && (
                <span className="text-muted-foreground">p.{cit.page_number}</span>
              )}
              {cit.heading && (
                <span className="text-muted-foreground">· {cit.heading}</span>
              )}
              {cit.confidence != null && (
                <span className="ml-auto shrink-0 rounded-full bg-primary/10 text-primary px-1.5 py-0.5 font-medium">
                  {Math.round(cit.confidence * 100)}%
                </span>
              )}
            </div>
            {cit.quoted_text && (
              <div className="mt-1 text-muted-foreground line-clamp-2 italic">
                "{cit.quoted_text}"
              </div>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}

export default function Chat() {
  const queryClient = useQueryClient();
  const { data: conversations, isLoading: convsLoading, isError: convsError } = useConversations();
  const { data: documents } = useDocuments({ status: "indexed" });
  const [activeConvId, setActiveConvId] = useState<number | null>(null);

  const { data: messages, isLoading: msgsLoading, isError: msgsError, error: msgsErrorObj } = useMessages(activeConvId);
  const createConv = useCreateConversation();
  const deleteConv = useDeleteConversation();
  const bookmarkConv = useBookmarkConversation();

  const [searchParams, setSearchParams] = useSearchParams();
  const [scopedDocId, setScopedDocId] = useState<number | null>(null);
  const [previewCit, setPreviewCit] = useState<Citation | null>(null);

  // When arriving from "Ask about this document", scope the chat to that doc.
  useEffect(() => {
    const doc = searchParams.get("doc");
    if (doc) {
      setScopedDocId(parseInt(doc, 10));
      setActiveConvId(null);
    }
  }, [searchParams]);

  const clearScope = () => {
    setScopedDocId(null);
    setSearchParams(new URLSearchParams());
  };

  const [input, setInput] = useState("");
  const [streamingAnswer, setStreamingAnswer] = useState("");
  const [streamingCitations, setStreamingCitations] = useState<Citation[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const activeConv = conversations?.find((c) => c.id === activeConvId);
  const scopedDoc = documents?.find((d) => d.id === scopedDocId);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingAnswer]);

  const handleSend = () => {
    if (!input.trim() || isStreaming) return;

    const question = input.trim();
    setInput("");
    setIsStreaming(true);
    setStreamingAnswer("");
    setStreamingCitations([]);

    let convId = activeConvId;

    askStream({
      question,
      conversation_id: activeConvId,
      document_ids: scopedDocId != null ? [scopedDocId] : undefined,
    }, {
      onMeta: (id) => {
        convId = id;
        if (!activeConvId) setActiveConvId(id);
      },
      onToken: (token) => {
        setStreamingAnswer((prev) => prev + token);
      },
      onCitations: (citations) => {
        setStreamingCitations(citations);
      },
      onDone: () => {
        setIsStreaming(false);
        setStreamingAnswer("");
        setStreamingCitations([]);
        queryClient.invalidateQueries({ queryKey: qk.conversations });
        if (convId != null) {
          queryClient.invalidateQueries({ queryKey: qk.messages(convId) });
        }
        queryClient.invalidateQueries({ queryKey: qk.dashboard });
      },
      onError: (err) => {
        setStreamingAnswer((prev) => prev + `\n\n[Error: ${err.message}]`);
        setIsStreaming(false);
      },
    });
  };

  const questionForAnswer = (list: Message[], idx: number): string => {
    for (let i = idx - 1; i >= 0; i--) {
      if (list[i].role === "user") return list[i].content;
    }
    return "";
  };

  const handleExportAnswer = async (question: string, answer: string, citations: Citation[]) => {
    try {
      const blob = await api.exportAnswer({ question, answer, citations: citations ?? [] });
      downloadBlob(blob, "answer.docx");
      toast.success("Word document downloaded");
    } catch (err) {
      toast.error(`Export failed: ${(err as Error).message}`);
    }
  };

  const handleClearConversation = () => {
    if (activeConvId == null) return;
    const id = activeConvId;
    deleteConv.mutate(id, {
      onSuccess: () => toast.success("Conversation cleared"),
      onError: (err) => toast.error(`Failed to clear: ${err.message}`),
    });
    setActiveConvId(null);
  };

  return (
    <div className="flex h-full overflow-hidden animate-in fade-in duration-300">
      <div className="w-64 border-r border-border bg-muted/20 flex flex-col">
        <div className="p-4 border-b">
          <Button
            className="w-full justify-start gap-2"
            variant="default"
            onClick={() => {
              setActiveConvId(null);
              clearScope();
            }}
          >
            <Plus className="w-4 h-4" />
            New Chat
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {convsLoading ? (
              Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)
            ) : convsError ? (
              <p className="px-3 py-6 text-center text-xs text-destructive">Could not load conversations</p>
            ) : conversations && conversations.length > 0 ? conversations.map((conv) => (
              <div
                key={conv.id}
                className={cn(
                  "flex items-center justify-between group px-3 py-2 rounded-md cursor-pointer transition-colors text-sm",
                  activeConvId === conv.id ? "bg-primary text-primary-foreground" : "hover:bg-accent hover:text-accent-foreground"
                )}
                onClick={() => setActiveConvId(conv.id)}
              >
                <div className="flex items-center gap-2 truncate">
                  {conv.bookmarked ? <Bookmark className="w-4 h-4 shrink-0 fill-current" /> : <MessageSquare className="w-4 h-4 shrink-0" />}
                  <span className="truncate">{conv.title || "Untitled Chat"}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn("h-6 w-6 opacity-0 group-hover:opacity-100", activeConvId === conv.id ? "text-primary-foreground hover:bg-primary-foreground/20" : "")}
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteConv.mutate(conv.id);
                    if (activeConvId === conv.id) setActiveConvId(null);
                  }}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            )) : (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">No conversations yet</p>
            )}
          </div>
        </ScrollArea>
      </div>

      <div className="flex-1 flex flex-col bg-background">
        {(activeConv || scopedDoc) && (
          <div className="flex items-center justify-between gap-3 px-6 py-3 border-b bg-background/80 backdrop-blur">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-medium truncate">{activeConv?.title || "New Chat"}</span>
              {scopedDoc && (
                <Badge variant="secondary" className="gap-1 shrink-0">
                  <FileText className="w-3 h-3" /> {scopedDoc.title || scopedDoc.file_name}
                  <button onClick={clearScope} className="ml-1 hover:text-foreground"><X className="w-3 h-3" /></button>
                </Badge>
              )}
            </div>
            {activeConv && (
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => bookmarkConv.mutate(activeConv.id)}
                  disabled={bookmarkConv.isPending}
                >
                  <Bookmark className={cn("w-4 h-4 mr-2", activeConv.bookmarked && "fill-current")} />
                  {activeConv.bookmarked ? "Saved" : "Save"}
                </Button>
                <Button variant="outline" size="sm" onClick={handleClearConversation} disabled={deleteConv.isPending}>
                  <Trash2 className="w-4 h-4 mr-2" /> Clear
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="flex-1 overflow-auto p-6" ref={scrollRef}>
          <div className="max-w-3xl mx-auto space-y-6 pb-20">
            {msgsLoading && activeConvId != null ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-2/3" />)}
              </div>
            ) : msgsError && activeConvId != null ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-center mt-12">
                <MessageSquare className="w-8 h-8 mx-auto text-destructive mb-3" />
                <p className="font-medium">Could not load this conversation</p>
                <p className="text-sm text-muted-foreground mt-1">{(msgsErrorObj as Error)?.message}</p>
              </div>
            ) : (!messages || messages.length === 0) && !isStreaming ? (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-4 mt-24">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <MessageSquare className="w-8 h-8 text-primary" />
                </div>
                <div>
                  <h2 className="text-2xl font-serif font-bold">Ask your documents</h2>
                  <p className="text-muted-foreground mt-2 max-w-md mx-auto">
                    {scopedDoc
                      ? `Questions will be answered using "${scopedDoc.title || scopedDoc.file_name}" only.`
                      : "Type a question below. The answers will be grounded strictly in your indexed corpus."}
                  </p>
                </div>
              </div>
            ) : (
              <>
                {messages?.map((msg, idx) => (
                  <div key={msg.id} className={cn("flex gap-4", msg.role === "user" ? "flex-row-reverse" : "flex-row")}>
                    <div className={cn(
                      "max-w-[80%] rounded-2xl p-4 shadow-sm",
                      msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-card border"
                    )}>
                      <div className="prose dark:prose-invert max-w-none text-sm leading-relaxed whitespace-pre-wrap">
                        {msg.content}
                      </div>
                      {msg.citations && <CitationList citations={msg.citations} onSelect={setPreviewCit} />}
                      {msg.role === "assistant" && msg.content && (
                        <div className="mt-3 flex justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-muted-foreground"
                            onClick={() => handleExportAnswer(questionForAnswer(messages, idx), msg.content, msg.citations ?? [])}
                          >
                            <Download className="w-3.5 h-3.5 mr-1.5" /> Export Word
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {isStreaming && (
                  <div className="flex gap-4 flex-row">
                    <div className="max-w-[80%] rounded-2xl p-4 shadow-sm bg-card border">
                      <div className="prose dark:prose-invert max-w-none text-sm leading-relaxed whitespace-pre-wrap">
                        {streamingAnswer}
                        <span className="inline-block w-1.5 h-4 ml-1 bg-primary animate-pulse align-middle" />
                      </div>
                      <CitationList citations={streamingCitations} onSelect={setPreviewCit} />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="p-4 bg-background border-t">
          <div className="max-w-3xl mx-auto relative">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={scopedDoc ? `Ask about ${scopedDoc.title || scopedDoc.file_name}...` : "Ask about your documents..."}
              className="pr-12 py-6 rounded-xl shadow-sm text-base"
              disabled={isStreaming}
            />
            <Button
              size="icon"
              className="absolute right-2 top-2 h-9 w-9 rounded-lg"
              onClick={handleSend}
              disabled={!input.trim() || isStreaming}
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={!!previewCit} onOpenChange={(open) => !open && setPreviewCit(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" /> {previewCit?.document_name}
            </DialogTitle>
            <DialogDescription>
              {previewCit?.page_number != null && <span>Page {previewCit.page_number}</span>}
              {previewCit?.page_number != null && previewCit?.heading && <span> · </span>}
              {previewCit?.heading && <span>{previewCit.heading}</span>}
            </DialogDescription>
          </DialogHeader>
          {previewCit?.confidence != null && (
            <Badge variant="outline" className="w-fit text-primary border-primary/30 bg-primary/10">
              {Math.round(previewCit.confidence * 100)}% confidence
            </Badge>
          )}
          <div className="max-h-[50vh] overflow-auto text-sm leading-relaxed whitespace-pre-wrap rounded-lg border bg-muted/30 p-4">
            {previewCit?.quoted_text}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
