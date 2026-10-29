import { cloneDocument } from "./chart";
import { readCloudChartPayload } from "./cloud-charts";
import { cloudVersionToken } from "./cloud-revision";
import { HttpError, responseJson } from "./http";
import {
  MAX_CHART_TABS,
  tabSnapshot,
  workspaceSave,
  type WorkspaceSave,
} from "./workspace";

/** No cloud writes: persist both copies locally before releasing a stopped queue. */
export async function loadCloudVersion(options: {
  tabId: string;
  cloudId: string;
  newTabId: string;
  transport?: typeof fetch;
  getWorkspace: () => WorkspaceSave;
  canRecover: () => boolean;
  persist: (workspace: WorkspaceSave) => void;
  clearConflict: () => void;
  commit: (workspace: WorkspaceSave) => void;
}) {
  const current = () => {
    const workspace = options.getWorkspace();
    const local = workspace.tabs.find(
      (tab) => tab.id === options.tabId && tab.cloudId === options.cloudId,
    );
    if (!local || !options.canRecover())
      throw new HttpError(
        "This chart is no longer waiting for conflict recovery.",
      );
    if (workspace.tabs.length >= MAX_CHART_TABS)
      throw new HttpError(
        "Close one chart tab first so your local copy can be kept safely.",
      );
    if (workspace.tabs.some((tab) => tab.id === options.newTabId))
      throw new HttpError("Please retry loading the cloud chart.");
    return { workspace, local };
  };
  current();
  const remote = await responseJson<{ id: string; version: number }>(
    await (options.transport ?? fetch)(
      `/api/charts/${encodeURIComponent(options.cloudId)}`,
      { signal: AbortSignal.timeout(20_000), cache: "no-store" },
    ),
  );
  if (remote.id !== options.cloudId)
    throw new HttpError("The cloud chart response was not valid.", 502);
  const payload = readCloudChartPayload(remote);
  const incoming = {
    id: options.newTabId,
    cloudId: options.cloudId,
    cloudVersion: cloudVersionToken(remote),
    ...payload,
    cloudSnapshot: tabSnapshot(payload),
  };
  // Re-read after the request: drawing, closing and switching tabs may have happened.
  const { workspace, local } = current();
  const copy = {
    ...structuredClone(local),
    cloudId: undefined,
    cloudVersion: undefined,
    cloudSnapshot: undefined,
    document: {
      ...cloneDocument(local.document),
      name: `${local.document.name.slice(0, 187)} (local copy)`,
    },
  };
  const next = workspaceSave(
    [
      ...workspace.tabs.map((tab) => (tab.id === local.id ? copy : tab)),
      incoming,
    ],
    workspace.activeTabId === local.id ? incoming.id : workspace.activeTabId,
  );
  options.persist(next); // Quota/cross-window errors must abort before changing React state.
  options.clearConflict();
  options.commit(next);
}
