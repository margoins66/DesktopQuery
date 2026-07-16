import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { 
  useDocuments, 
  useDocument, 
  useDocumentChunks, 
  useFolders, 
  useAddFolder, 
  useRescanFolder, 
  useDeleteFolder, 
  useUploadDocuments, 
  useReindexDocument, 
  useDeleteDocument 
} from "@/hooks/useRag";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter, DrawerClose } from "@/components/ui/drawer";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Search, Folder, FileText, Upload, RefreshCw, Trash2, Plus, AlertTriangle, CheckCircle, Activity, HardDrive, FileSearch, MessageSquare } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

function StatusBadge({ status }: { status: string }) {
  if (status === "indexed") return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20"><CheckCircle className="w-3 h-3 mr-1"/> Indexed</Badge>;
  if (status === "failed") return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20"><AlertTriangle className="w-3 h-3 mr-1"/> Failed</Badge>;
  if (status === "indexing") return <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20"><RefreshCw className="w-3 h-3 mr-1 animate-spin"/> Indexing</Badge>;
  return <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20"><Activity className="w-3 h-3 mr-1"/> Pending</Badge>;
}

export default function Documents() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const { data: documents, isLoading: docsLoading, isError: docsError, error: docsErrorObj } = useDocuments({ q: q || undefined, status: status === "all" ? undefined : status });
  
  const [selectedDocId, setSelectedDocId] = useState<number | null>(null);
  const { data: docDetails, isLoading: docLoading } = useDocument(selectedDocId);
  const { data: docChunks, isLoading: chunksLoading } = useDocumentChunks(selectedDocId);

  const [docToDelete, setDocToDelete] = useState<number | null>(null);

  const reindexDoc = useReindexDocument();
  const deleteDoc = useDeleteDocument();
  const uploadDocs = useUploadDocuments();

  const [, navigate] = useLocation();
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadFiles = (files: File[]) => {
    if (files.length === 0) return;
    uploadDocs.mutate(files, {
      onSuccess: (data) => {
        data.results.forEach(res => {
          if (res.status === "success") {
            toast.success(`Uploaded ${res.file_name}`);
          } else {
            toast.error(`Failed ${res.file_name}: ${res.reason}`);
          }
        });
      },
      onError: (err) => {
        toast.error(`Upload failed: ${err.message}`);
      }
    });
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      uploadFiles(Array.from(e.target.files));
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      uploadFiles(Array.from(e.dataTransfer.files));
    }
  };

  const { data: folders, isLoading: foldersLoading } = useFolders();
  const [newFolderPath, setNewFolderPath] = useState("");
  const addFolder = useAddFolder();
  const rescanFolder = useRescanFolder();
  const deleteFolder = useDeleteFolder();

  const handleAddFolder = () => {
    if (!newFolderPath.trim()) return;
    addFolder.mutate(newFolderPath, {
      onSuccess: () => {
        toast.success("Folder added successfully");
        setNewFolderPath("");
      },
      onError: (err) => {
        toast.error(`Failed to add folder: ${err.message}`);
      }
    });
  };

  return (
    <div className="p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-7xl mx-auto">
      <div className="flex justify-between items-end border-b pb-4">
        <div>
          <h1 className="text-4xl font-serif font-bold tracking-tight">Corpus Manager</h1>
          <p className="text-muted-foreground mt-2">Upload documents, manage folders, and view indexing status.</p>
        </div>
        <div className="flex gap-3">
          <input type="file" multiple className="hidden" ref={fileInputRef} onChange={handleUpload} accept=".pdf,.docx,.xlsx,.txt,.md,.rtf,.pptx,.html,.htm,.csv" />
          <Button onClick={() => fileInputRef.current?.click()} disabled={uploadDocs.isPending}>
            {uploadDocs.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
            Upload Files
          </Button>
        </div>
      </div>

      <Tabs defaultValue="documents" className="w-full">
        <TabsList>
          <TabsTrigger value="documents" className="gap-2"><FileText className="w-4 h-4"/> Documents</TabsTrigger>
          <TabsTrigger value="folders" className="gap-2"><Folder className="w-4 h-4"/> Folders</TabsTrigger>
        </TabsList>
        
        <TabsContent value="documents" className="space-y-4 mt-6">
          <Card
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
            onDrop={handleDrop}
            className={cn("relative transition-colors", isDragging && "ring-2 ring-primary ring-offset-2")}
          >
            {isDragging && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-lg bg-primary/5 backdrop-blur-sm border-2 border-dashed border-primary pointer-events-none">
                <Upload className="w-10 h-10 text-primary mb-2" />
                <p className="font-medium text-primary">Drop files to upload</p>
              </div>
            )}
            <CardHeader className="pb-4">
              <div className="flex justify-between items-center">
                <CardTitle>Indexed Documents</CardTitle>
                <div className="flex gap-3">
                  <div className="relative w-64">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input placeholder="Search filenames..." value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
                  </div>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="indexing">Indexing</SelectItem>
                      <SelectItem value="indexed">Indexed</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {docsLoading ? (
                <div className="space-y-4">
                  {[1,2,3,4].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : docsError ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-center">
                  <AlertTriangle className="w-8 h-8 mx-auto text-destructive mb-3" />
                  <p className="font-medium">Could not load documents</p>
                  <p className="text-sm text-muted-foreground mt-1">{(docsErrorObj as Error)?.message}</p>
                </div>
              ) : documents && documents.length > 0 ? (
                <div className="border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>File</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Vendor</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Chunks</TableHead>
                        <TableHead>Size</TableHead>
                        <TableHead>Added</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {documents.map((doc) => (
                        <TableRow key={doc.id} className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setSelectedDocId(doc.id)}>
                          <TableCell className="font-medium max-w-[200px] truncate" title={doc.title || doc.file_name}>
                            {doc.title || doc.file_name}
                            {doc.status === "failed" && doc.error_message && (
                              <p className="text-xs text-destructive truncate mt-1">{doc.error_message}</p>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">{doc.document_type || "-"}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{doc.vendor || "-"}</TableCell>
                          <TableCell><StatusBadge status={doc.status} /></TableCell>
                          <TableCell className="text-muted-foreground text-sm">{doc.chunk_count}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{(doc.file_size / 1024).toFixed(1)} KB</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{format(new Date(doc.created_at), "MMM d, yyyy")}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" title="Ask about this document" onClick={() => navigate(`/chat?doc=${doc.id}`)}>
                                <MessageSquare className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" title="Summarize" onClick={() => navigate(`/summaries?doc=${doc.id}`)}>
                                <FileSearch className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" title="Re-index" onClick={() => reindexDoc.mutate(doc.id)} disabled={reindexDoc.isPending}>
                                <RefreshCw className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" title="Remove" onClick={() => setDocToDelete(doc.id)}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-12 border rounded-md bg-muted/20">
                  <FileText className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground font-medium">No documents found</p>
                  <p className="text-sm text-muted-foreground mt-1">Adjust your filters or upload new files.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="folders" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Watched Folders</CardTitle>
              <CardDescription>Automatically index files from local directories.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3 mb-6">
                <Input 
                  placeholder="Absolute folder path (e.g. /Users/name/Documents)" 
                  value={newFolderPath}
                  onChange={e => setNewFolderPath(e.target.value)}
                  className="max-w-md"
                />
                <Button onClick={handleAddFolder} disabled={addFolder.isPending || !newFolderPath.trim()}>
                  {addFolder.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                  Add Folder
                </Button>
              </div>

              {foldersLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : folders && folders.length > 0 ? (
                <div className="space-y-3">
                  {folders.map(folder => (
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
                        <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => deleteFolder.mutate(folder.id)}>
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 border rounded-md border-dashed">
                  <Folder className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground font-medium">No folders configured</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AlertDialog open={!!docToDelete} onOpenChange={(open) => !open && setDocToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the document from the vector store. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                if (docToDelete) deleteDoc.mutate(docToDelete);
                setDocToDelete(null);
              }}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              Delete Document
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Drawer open={!!selectedDocId} onOpenChange={(open) => !open && setSelectedDocId(null)}>
        <DrawerContent className="max-h-[90vh]">
          <div className="mx-auto w-full max-w-4xl h-full flex flex-col">
            <DrawerHeader>
              <DrawerTitle>{docDetails?.title || docDetails?.file_name || "Document Details"}</DrawerTitle>
              <DrawerDescription className="flex items-center gap-2 mt-1">
                {docDetails && <StatusBadge status={docDetails.status} />}
                <span>{docDetails?.file_name}</span>
              </DrawerDescription>
            </DrawerHeader>
            
            <div className="p-4 flex-1 overflow-auto">
              {docLoading || chunksLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-32 w-full" />
                  <Skeleton className="h-64 w-full" />
                </div>
              ) : docDetails ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-3 bg-muted/50 rounded-lg border">
                      <p className="text-xs text-muted-foreground font-medium uppercase mb-1">Type</p>
                      <p className="text-sm font-medium">{docDetails.document_type || "Unknown"}</p>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg border">
                      <p className="text-xs text-muted-foreground font-medium uppercase mb-1">Vendor</p>
                      <p className="text-sm font-medium">{docDetails.vendor || "Unknown"}</p>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg border">
                      <p className="text-xs text-muted-foreground font-medium uppercase mb-1">Size</p>
                      <p className="text-sm font-medium">{(docDetails.file_size / 1024).toFixed(1)} KB</p>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg border">
                      <p className="text-xs text-muted-foreground font-medium uppercase mb-1">Chunks</p>
                      <p className="text-sm font-medium">{docDetails.chunk_count}</p>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-serif font-semibold mb-3">Indexed Chunks</h3>
                    <div className="space-y-3">
                      {docChunks && docChunks.length > 0 ? (
                        docChunks.map((chunk, i) => (
                          <div key={i} className="p-4 border rounded-lg bg-card">
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-xs font-mono bg-muted px-2 py-1 rounded border">Chunk {chunk.chunk_index}</span>
                              {chunk.page_number && <span className="text-xs font-medium text-muted-foreground">Page {chunk.page_number}</span>}
                            </div>
                            {chunk.heading && <h4 className="text-sm font-semibold mb-2">{chunk.heading}</h4>}
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{chunk.content}</p>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground italic">No chunks available.</p>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
            <DrawerFooter>
              <DrawerClose asChild>
                <Button variant="outline">Close</Button>
              </DrawerClose>
            </DrawerFooter>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
