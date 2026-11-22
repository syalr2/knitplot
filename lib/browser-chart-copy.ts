import type { ChartDocument } from "./chart";
import {
  MAX_CHART_TABS,
  newChartTab,
  readStoredWorkspace,
  STORAGE_KEY,
  workspaceSave,
} from "./workspace";
import { stringifyKnitplot } from "./yoke-program-wire";

export function saveBrowserChartCopy(document: ChartDocument) {
  const tabs = readStoredWorkspace(localStorage)?.tabs ?? [];
  if (tabs.length >= MAX_CHART_TABS)
    throw new Error(
      "Close a chart tab before opening a copy. You can also download it now.",
    );
  const tab = newChartTab(document, `chart-${crypto.randomUUID()}`);
  localStorage.setItem(
    STORAGE_KEY,
    stringifyKnitplot(workspaceSave([...tabs, tab], tab.id)),
  );
  return tab.id;
}
