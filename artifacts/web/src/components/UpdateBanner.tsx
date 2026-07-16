import { Download, RefreshCw, X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAppUpdate } from "@/hooks/useAppUpdate";

/**
 * Floating notification for desktop self-updates. Renders nothing in the web
 * build (no Tauri runtime) and stays hidden until an update is found.
 */
export function UpdateBanner() {
  const {
    isDesktop,
    stage,
    version,
    notes,
    progress,
    error,
    installUpdate,
    dismiss,
  } = useAppUpdate();

  if (!isDesktop) return null;
  if (stage === "idle" || stage === "checking" || stage === "upToDate") {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 rounded-lg border border-border bg-card p-4 shadow-lg">
      {stage === "error" ? (
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div className="flex-1">
            <p className="text-sm font-medium">Update failed</p>
            <p className="mt-1 text-xs text-muted-foreground break-words">
              {error ?? "Could not install the update."}
            </p>
          </div>
          <button
            onClick={dismiss}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="flex items-start gap-3">
          <Download className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">
              {stage === "available"
                ? `Update available${version ? ` (v${version})` : ""}`
                : stage === "downloading"
                  ? "Downloading update…"
                  : "Update ready — restarting…"}
            </p>
            {stage === "available" && notes && (
              <p className="mt-1 line-clamp-3 text-xs text-muted-foreground break-words">
                {notes}
              </p>
            )}
            {stage === "downloading" && (
              <div className="mt-2">
                <Progress value={progress ?? undefined} />
              </div>
            )}
            {stage === "available" && (
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={() => void installUpdate()}>
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  Install &amp; restart
                </Button>
                <Button size="sm" variant="ghost" onClick={dismiss}>
                  Later
                </Button>
              </div>
            )}
          </div>
          {stage === "available" && (
            <button
              onClick={dismiss}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
