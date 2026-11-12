import { z } from "zod";
import { cloneDocument, type ChartDocument } from "./chart";
import {
  createPreviewSettings,
  knitProgressSchema,
  clampKnitProgress,
  readChartDocument,
  type KnitProgress,
  type PreviewSettings,
} from "./chart-schema";
import { HttpError, isRecord } from "./http";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import { stringifyKnitplot } from "./yoke-program-wire";

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
const documentDigests = new WeakMap<ChartDocument, string>();
const snapshotPrefix = "sha256-v1:";
const digest = (value: string) =>
  bytesToHex(sha256(new TextEncoder().encode(value)));

function canonicalJson(input: unknown) {
  return JSON.stringify(input, (_key, value: unknown) =>
    isRecord(value)
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, value[key]]),
        )
      : value,
  );
}

/** Cache immutable documents so progress updates and changes to other tabs
 * don't walk an entire chart again. Sort keys because Postgres JSONB reorders them. */
export function tabSnapshot(
  tab: Pick<ChartTab, "document" | "knitProgress" | "preview">,
) {
  let documentDigest = documentDigests.get(tab.document);
  if (!documentDigest) {
    documentDigest = digest(
      canonicalJson(JSON.parse(stringifyKnitplot(tab.document))),
    );
    documentDigests.set(tab.document, documentDigest);
  }
  return (
    snapshotPrefix +
    digest(canonicalJson([documentDigest, tab.knitProgress, tab.preview]))
  );
}

function readCloudSnapshot(value: unknown) {
  if (typeof value !== "string") return undefined;
  if (/^sha256-v1:[0-9a-f]{64}$/.test(value)) return value;
  try {
    // Hash the saved baseline, never the current document: it may have unsynced edits.
    const saved: unknown = JSON.parse(value);
    if (
      !isRecord(saved) ||
      !isRecord(saved.document) ||
      !isRecord(saved.knitProgress) ||
      !isRecord(saved.preview)
    )
      return undefined;
    return tabSnapshot(saved as Parameters<typeof tabSnapshot>[0]);
  } catch {
    return undefined;
  }
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
        cloudSnapshot: readCloudSnapshot(raw.cloudSnapshot),
        document,
        preview: createPreviewSettings(raw.preview ?? {}),
        knitProgress: clampKnitProgress(progress, document),
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
