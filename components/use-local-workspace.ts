"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { WorkspacePersistence } from "@/lib/workspace-persistence";
import { HttpError } from "@/lib/http";
import {
  STORAGE_KEY,
  workspaceSave,
  type ChartTab,
  type WorkspaceSave,
} from "@/lib/workspace";

/** Debounce drawing updates; flush only on lifecycle events, not every pointer move. */
export function useLocalWorkspace(
  tabs: ChartTab[],
  activeTabId: string,
  enabled: boolean,
  initialValue: string | null,
) {
  const [error, setError] = useState("");
  const writer = useRef<WorkspacePersistence | null>(null);
  const latest = useRef<WorkspaceSave | null>(null);
  const failed = useRef(false);
  const persist = useCallback(
    (workspace: WorkspaceSave) => {
      if (!enabled)
        throw new HttpError(
          "Browser storage is not ready. Download your chart before reloading.",
        );
      if (!writer.current)
        writer.current = new WorkspacePersistence(localStorage, initialValue);
      writer.current.save(workspace);
      latest.current = workspace;
      failed.current = false;
      setError("");
    },
    [enabled, initialValue],
  );
  const save = useCallback(() => {
    if (!latest.current) return;
    try {
      persist(latest.current);
    } catch (error) {
      failed.current = true;
      setError(
        error instanceof HttpError
          ? error.message
          : "Your browser could not save your work. Download your chart from File before closing this page.",
      );
    }
  }, [persist]);
  useEffect(() => {
    if (!enabled) return;
    latest.current = workspaceSave(tabs, activeTabId);
    const timer = setTimeout(save, 250);
    return () => clearTimeout(timer);
  }, [tabs, activeTabId, enabled, save]);
  useEffect(() => {
    if (!enabled) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      save();
      if (failed.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const onHidden = () => {
      if (document.visibilityState === "hidden") save();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) save();
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("pagehide", save);
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      save();
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("pagehide", save);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onHidden);
    };
  }, [enabled, save]);
  return { error, persist };
}
