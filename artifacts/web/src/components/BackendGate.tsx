import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { isDesktop, resolveApiBase } from "@/lib/config";
import { ErrorState } from "@/components/ErrorState";

interface BackendGateProps {
  children: React.ReactNode;
}

const HEALTH_POLL_MS = 500;
/** Give the bundled sidecar a generous window to boot before surfacing an error. */
const STARTUP_TIMEOUT_MS = 30_000;

/**
 * Gates the desktop app behind a "starting up" screen until the bundled backend
 * has bound its runtime port and answered a health check. On the web this is a
 * no-op — the app renders immediately and pages handle their own load/error
 * states as before.
 */
export function BackendGate({ children }: BackendGateProps) {
  // On the web there is no sidecar to wait for, so start ready.
  const [ready, setReady] = useState(() => !isDesktop());
  const [timedOut, setTimedOut] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!isDesktop()) return;

    let cancelled = false;
    setReady(false);
    setTimedOut(false);

    (async () => {
      await resolveApiBase();
      const deadline = Date.now() + STARTUP_TIMEOUT_MS;

      while (!cancelled) {
        try {
          await api.getHealth();
          if (!cancelled) setReady(true);
          return;
        } catch {
          if (Date.now() > deadline) {
            if (!cancelled) setTimedOut(true);
            return;
          }
          await new Promise((r) => setTimeout(r, HEALTH_POLL_MS));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (ready) return <>{children}</>;

  if (timedOut) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8">
        <ErrorState
          className="max-w-md"
          title="The app couldn't start"
          message="The local backend didn't respond in time. It may still be starting up."
          onRetry={() => setAttempt((a) => a + 1)}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <div>
        <p className="font-medium">Starting up…</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Getting the local backend ready.
        </p>
      </div>
    </div>
  );
}
