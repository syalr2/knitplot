"use client";

import { useState } from "react";
import { responseJson } from "@/lib/http";
import { readProject } from "@/lib/project-file";
import {
  MAX_CHART_TABS,
  newChartTab,
  readStoredWorkspace,
  STORAGE_KEY,
  workspaceSave,
} from "@/lib/workspace";
import { stringifyKnitplot } from "@/lib/yoke-program-wire";

export function OpenClubCopy({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <>
      <button
        className="primary-button"
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const file = await responseJson(
              await fetch(`/api/chart-club/copy?id=${id}`),
            );
            const document = readProject(file);
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
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Reload the saved workspace.
            window.location.assign("/");
          } catch (err) {
            setError(
              err instanceof Error ? err.message : "Couldn’t open the chart.",
            );
            setBusy(false);
          }
        }}
      >
        {busy ? "Opening…" : "Open a copy in Chart Maker"}
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
