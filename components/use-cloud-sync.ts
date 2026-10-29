"use client";
import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { CloudSaveQueue, type SaveStatus } from "@/lib/cloud-save-queue";
import { saveCloudChart } from "@/lib/cloud-save";
import { tabPayload, tabSnapshot, type ChartTab } from "@/lib/workspace";

export function useCloudSync(
  tabs: ChartTab[],
  activeTabId: string,
  enabled: boolean,
  setTabs: Dispatch<SetStateAction<ChartTab[]>>,
) {
  const [statuses, setStatuses] = useState<
    Record<string, { state: SaveStatus; message: string; conflict?: boolean }>
  >({});
  const queue = useRef<CloudSaveQueue<ReturnType<typeof tabPayload>> | null>(
    null,
  );
  const previousActive = useRef(activeTabId);
  const previousCloud = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!enabled) return;
    if (!queue.current)
      queue.current = new CloudSaveQueue(
        saveCloudChart,
        (cloudId, state, message, saved, conflict) => {
          setStatuses((current) => ({
            ...current,
            [cloudId]: { state, message, conflict },
          }));
          if (saved)
            setTabs((current) =>
              current.map((tab) =>
                tab.cloudId === cloudId
                  ? {
                      ...tab,
                      cloudVersion: saved.version,
                      cloudSnapshot: saved.snapshot,
                    }
                  : tab,
              ),
            );
        },
      );
    for (const tab of tabs) {
      if (tab.cloudId)
        queue.current.enqueue(
          tab.cloudId,
          {
            data: tabPayload(tab),
            snapshot: tabSnapshot(tab),
            version: tab.cloudVersion,
          },
          tab.cloudSnapshot ?? "",
        );
    }
    if (previousActive.current !== activeTabId && previousCloud.current)
      void queue.current.flush(previousCloud.current);
    previousActive.current = activeTabId;
    previousCloud.current = tabs.find((tab) => tab.id === activeTabId)?.cloudId;
  }, [tabs, activeTabId, enabled, setTabs]);
  useEffect(() => {
    if (!enabled) return;
    const flush = () => {
      void queue.current?.flushAll();
    };
    const hidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      flush();
      if (queue.current?.hasPending()) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      flush();
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [enabled]);
  const id = tabs.find((tab) => tab.id === activeTabId)?.cloudId;
  const status = id
    ? (statuses[id] ?? { state: "idle" as const, message: "" })
    : { state: "idle" as const, message: "" };
  return {
    ...status,
    flushChart: async (cloudId: string) => {
      await queue.current?.flush(cloudId);
      return !queue.current?.hasPending(cloudId);
    },
    forgetSaved: (cloudId: string) => queue.current?.forgetSaved(cloudId),
    canRecover: (cloudId: string) => queue.current?.isStopped(cloudId) ?? false,
    forgetFailed: (cloudId: string) => {
      queue.current?.forgetFailed(cloudId);
      setStatuses((current) => {
        const next = { ...current };
        delete next[cloudId];
        return next;
      });
    },
    retry: () => {
      if (id) void queue.current?.retry(id);
    },
  };
}
