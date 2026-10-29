"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { loadCloudVersion } from "@/lib/cloud-recovery";
import { HttpError } from "@/lib/http";
import type { WorkspaceSave } from "@/lib/workspace";

export function useCloudRecovery(options: {
  workspace: WorkspaceSave;
  persist: (workspace: WorkspaceSave) => void;
  canRecover: (cloudId: string) => boolean;
  clearConflict: (cloudId: string) => void;
  commit: (workspace: WorkspaceSave) => void;
}) {
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ tabId: string; message: string } | null>(
    null,
  );
  return {
    busy,
    error: error?.tabId === options.workspace.activeTabId ? error.message : "",
    load: async (tabId: string, cloudId: string) => {
      if (running.current) return;
      running.current = true;
      setBusy(true);
      setError(null);
      try {
        await loadCloudVersion({
          tabId,
          cloudId,
          newTabId: `chart-${crypto.randomUUID()}`,
          getWorkspace: () => latest.current.workspace,
          canRecover: () => latest.current.canRecover(cloudId),
          persist: (next) => latest.current.persist(next),
          clearConflict: () => latest.current.clearConflict(cloudId),
          commit: (next) => latest.current.commit(next),
        });
      } catch (error) {
        setError({
          tabId,
          message:
            error instanceof HttpError
              ? error.message
              : "Could not load the cloud version. Your local chart is unchanged; please try again.",
        });
      } finally {
        running.current = false;
        setBusy(false);
      }
    },
  };
}
