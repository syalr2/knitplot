import { z } from "zod";
import { cloneDocument, type ChartDocument } from "./chart";
import {
  createPreviewSettings,
  knitProgressSchema,
  readChartDocument,
  type KnitProgress,
  type PreviewSettings,
} from "./chart-schema";
import { HttpError, isRecord } from "./http";

export const STORAGE_KEY = "colorwork-chart-v1";
export const MAX_CHART_TABS = 8;
export const INITIAL_TAB_ID = "chart-initial";
export type ChartTab = {
  id: string;
  cloudId?: string;
  cloudVersion?: string;
  cloudSnapshot?: string;
  document: ChartDocument;
  knitProgress: KnitProgress;
  preview: PreviewSettings;
};
export type WorkspaceSave = {
  format: "knitplot-workspace";
  version: 4;
  activeTabId: string;
  tabs: ChartTab[];
};

export function tabPayload(
  tab: Pick<ChartTab, "document" | "knitProgress" | "preview">,
) {
  return {
    document: tab.document,
    knitProgress: tab.knitProgress,
    preview: tab.preview,
  };
}
export function tabSnapshot(
  tab: Pick<ChartTab, "document" | "knitProgress" | "preview">,
) {
  return JSON.stringify(tabPayload(tab), (_key, value: unknown) =>
    isRecord(value)
      ? Object.fromEntries(
          Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
        )
      : value,
  );
}
export function newChartTab(document: ChartDocument, id: string): ChartTab {
  return {
    id,
    document: cloneDocument(document),
    knitProgress: knitProgressSchema.parse({}),
    preview: createPreviewSettings(),
  };
}
export function workspaceSave(
  tabs: ChartTab[],
  activeTabId: string,
): WorkspaceSave {
  return { format: "knitplot-workspace", version: 4, activeTabId, tabs };
}

/** Validate every tab separately: one damaged tab must not destroy the others. */
export function readWorkspace(value: unknown): {
  workspace: WorkspaceSave;
  rejectedTabs: number;
} {
  if (!isRecord(value))
    throw new HttpError("The browser workspace could not be read.");
  if (value.format !== "knitplot-workspace") {
    const tab = newChartTab(readChartDocument(value), INITIAL_TAB_ID);
    return { workspace: workspaceSave([tab], tab.id), rejectedTabs: 0 };
  }
  if (
    ![1, 2, 3, 4].includes(Number(value.version)) ||
    !Array.isArray(value.tabs) ||
    !value.tabs.length
  ) {
    throw new HttpError(
      "This browser workspace is damaged or uses a newer format.",
    );
  }
  const tabs: ChartTab[] = [];
  let rejectedTabs = Math.max(0, value.tabs.length - MAX_CHART_TABS);
  for (const raw of value.tabs.slice(0, MAX_CHART_TABS)) {
    try {
      if (
        !isRecord(raw) ||
        typeof raw.id !== "string" ||
        !raw.id ||
        tabs.some((tab) => tab.id === raw.id)
      )
        throw new Error();
      const document = readChartDocument(raw.document);
      const progress = knitProgressSchema.parse(raw.knitProgress ?? {});
      const cloudId =
        raw.cloudId === undefined ? undefined : z.uuid().parse(raw.cloudId);
      tabs.push({
        id: raw.id,
        cloudId,
        cloudVersion:
          typeof raw.cloudVersion === "string" ? raw.cloudVersion : undefined,
        cloudSnapshot:
          typeof raw.cloudSnapshot === "string" ? raw.cloudSnapshot : undefined,
        document,
        preview: createPreviewSettings(raw.preview ?? {}),
        knitProgress: {
          ...progress,
          row: Math.min(progress.row, document.height),
          stitch: Math.min(progress.stitch, document.width),
        },
      });
    } catch {
      rejectedTabs += 1;
    }
  }
  if (!tabs.length)
    throw new HttpError(
      "None of the saved chart tabs could be read. The original save has been kept.",
    );
  return {
    workspace: workspaceSave(
      tabs,
      tabs.some((tab) => tab.id === value.activeTabId)
        ? String(value.activeTabId)
        : tabs[0].id,
    ),
    rejectedTabs,
  };
}

export function readStoredWorkspace(
  storage: Pick<Storage, "getItem" | "setItem">,
) {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return null;
  const result = readWorkspace(JSON.parse(raw));
  if (result.rejectedTabs) storage.setItem(STORAGE_KEY + "-recovery", raw);
  return result.workspace;
}

/** Opening My Charts must never discard an existing local working copy. */
export function openCloudTab(
  workspace: WorkspaceSave | null,
  incoming: ChartTab,
): WorkspaceSave {
  const tabs = workspace ? [...workspace.tabs] : [];
  const existing = tabs.find((tab) => tab.cloudId === incoming.cloudId);
  if (existing) {
    if (
      existing.cloudSnapshot &&
      existing.cloudSnapshot === tabSnapshot(existing)
    ) {
      return workspaceSave(
        tabs.map((tab) =>
          tab.id === existing.id ? { ...incoming, id: existing.id } : tab,
        ),
        existing.id,
      );
    }
    return workspaceSave(tabs, existing.id);
  }
  if (tabs.length >= MAX_CHART_TABS)
    throw new HttpError("Close one chart tab before opening another chart.");
  tabs.push(incoming);
  return workspaceSave(tabs, incoming.id);
}
