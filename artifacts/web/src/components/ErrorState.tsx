import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface ErrorStateProps {
  /** Short, friendly headline describing what failed. */
  title?: string;
  /** Optional explicit message; falls back to the error message, then a generic backend-unreachable hint. */
  message?: string;
  /** The error thrown by the failed fetch, used to derive a message when none is provided. */
  error?: unknown;
  /** Retry handler — typically a React Query `refetch`. When omitted, the retry button is hidden. */
  onRetry?: () => void;
  /** When true, shows a spinning icon and disables the retry button. */
  isRetrying?: boolean;
  className?: string;
}

/**
 * Shared error/retry surface shown when a page's initial data fetch fails
 * (e.g. the backend is unreachable). Kept generic so every primary page can
 * present a consistent, recoverable error state.
 */
export function ErrorState({
  title = "Something went wrong",
  message,
  error,
  onRetry,
  isRetrying,
  className,
}: ErrorStateProps) {
  const detail =
    message ??
    (error instanceof Error ? error.message : undefined) ??
    "We couldn't reach the backend. It may be offline or still starting up.";

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center rounded-xl border border-destructive/30 bg-destructive/10 p-8",
        className,
      )}
    >
      <AlertTriangle className="w-8 h-8 text-destructive mb-3" />
      <p className="font-medium">{title}</p>
      <p className="text-sm text-muted-foreground mt-1 max-w-md">{detail}</p>
      {onRetry && (
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={onRetry}
          disabled={isRetrying}
        >
          <RefreshCw className={cn("w-4 h-4 mr-2", isRetrying && "animate-spin")} />
          Try Again
        </Button>
      )}
    </div>
  );
}
