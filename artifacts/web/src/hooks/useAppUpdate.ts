import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Drives the Tauri self-update flow for the desktop build.
 *
 * The web build (running in a normal browser) has no Tauri runtime, so every
 * hook here becomes a no-op: `isDesktop` is false and no update is ever
 * surfaced. Inside the desktop app it checks the signed update manifest on
 * mount, then lets the user download+install and relaunch.
 *
 * The Tauri plugins are imported dynamically so the web bundle never pulls in
 * desktop-only code paths.
 */

export type UpdateStage =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "ready"
  | "upToDate"
  | "error";

export interface AppUpdateState {
  isDesktop: boolean;
  stage: UpdateStage;
  version: string | null;
  notes: string | null;
  progress: number | null;
  error: string | null;
  checkForUpdate: () => Promise<void>;
  installUpdate: () => Promise<void>;
  dismiss: () => void;
}

function isTauriRuntime(): boolean {
  return (
    typeof window !== "undefined" &&
    "__TAURI_INTERNALS__" in (window as unknown as Record<string, unknown>)
  );
}

export function useAppUpdate(): AppUpdateState {
  const isDesktop = isTauriRuntime();
  const [stage, setStage] = useState<UpdateStage>("idle");
  const [version, setVersion] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Hold the resolved Update object between "check" and "install" so we don't
  // download it twice.
  const pendingUpdate = useRef<import("@tauri-apps/plugin-updater").Update | null>(
    null,
  );

  const checkForUpdate = useCallback(async () => {
    if (!isDesktop) return;
    setStage("checking");
    setError(null);
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (update) {
        pendingUpdate.current = update;
        setVersion(update.version);
        setNotes(update.body ?? null);
        setStage("available");
      } else {
        setStage("upToDate");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStage("error");
    }
  }, [isDesktop]);

  const installUpdate = useCallback(async () => {
    const update = pendingUpdate.current;
    if (!isDesktop || !update) return;
    setStage("downloading");
    setProgress(0);
    setError(null);
    try {
      let downloaded = 0;
      let contentLength = 0;
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            contentLength = event.data.contentLength ?? 0;
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            setProgress(
              contentLength > 0
                ? Math.min(100, Math.round((downloaded / contentLength) * 100))
                : null,
            );
            break;
          case "Finished":
            setProgress(100);
            break;
        }
      });
      setStage("ready");
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStage("error");
    }
  }, [isDesktop]);

  const dismiss = useCallback(() => {
    setStage("idle");
    setError(null);
  }, []);

  // Check once on mount inside the desktop app.
  useEffect(() => {
    if (isDesktop) {
      void checkForUpdate();
    }
  }, [isDesktop, checkForUpdate]);

  return {
    isDesktop,
    stage,
    version,
    notes,
    progress,
    error,
    checkForUpdate,
    installUpdate,
    dismiss,
  };
}
