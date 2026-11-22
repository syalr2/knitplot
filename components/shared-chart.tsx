"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { saveBrowserChartCopy } from "@/lib/browser-chart-copy";
import { downloadBlob, fileName } from "@/lib/browser-download";
import type { ChartDocument } from "@/lib/chart";
import { chartLinkFromHash } from "@/lib/chart-links";
import { responseJson } from "@/lib/http";
import { readProject } from "@/lib/project-file";
import { stringifyKnitplot } from "@/lib/yoke-program-wire";

const ChartViewer = dynamic(
  () => import("./club-chart-viewer").then((m) => m.ClubChartViewer),
  { ssr: false },
);
type State = { chart: ChartDocument } | { error: string } | null;

export function SharedChart() {
  const [state, setState] = useState<State>(null);
  const [copyError, setCopyError] = useState("");
  useEffect(() => {
    let controller: AbortController | undefined;
    async function load() {
      controller?.abort();
      const attempt = new AbortController();
      controller = attempt;
      const link = chartLinkFromHash(window.location.hash);
      try {
        if (!link) throw new Error("This chart link is incomplete or invalid.");
        const response = await fetch("/api/chart-links/open", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(link),
          signal: attempt.signal,
        });
        const chart = readProject(await responseJson(response));
        if (!attempt.signal.aborted) setState({ chart });
      } catch (error) {
        if (!attempt.signal.aborted)
          setState({
            error:
              error instanceof Error
                ? error.message
                : "Couldn’t open this chart.",
          });
      }
    }
    function followHash() {
      setState(null);
      setCopyError("");
      void load();
    }
    void load();
    window.addEventListener("hashchange", followHash);
    return () => {
      controller?.abort();
      window.removeEventListener("hashchange", followHash);
    };
  }, []);

  if (!state) return <p role="status">Opening shared chart…</p>;
  if ("error" in state)
    return (
      <p className="library-empty" role="alert">
        {state.error}
      </p>
    );
  const { chart } = state;
  return (
    <>
      <header className="library-heading">
        <div>
          <h1>{chart.name}</h1>
          <p>Shared with a link</p>
        </div>
      </header>
      <div className="club-creator-links">
        <button
          className="primary-button"
          type="button"
          onClick={() => {
            try {
              saveBrowserChartCopy(chart);
              // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Reload the saved workspace.
              window.location.assign("/");
            } catch (error) {
              setCopyError(
                error instanceof Error
                  ? error.message
                  : "Couldn’t open the copy.",
              );
            }
          }}
        >
          Open a copy in Chart Maker
        </button>
        <button
          className="chart-club-link"
          type="button"
          onClick={() => {
            const file = stringifyKnitplot(
              { format: "colorwork-chart", version: 2, document: chart },
              2,
            );
            downloadBlob(
              new Blob([file], { type: "application/json" }),
              fileName(chart.name, "knitplot"),
            );
          }}
        >
          Download editable copy
        </button>
      </div>
      {copyError && <p role="alert">{copyError}</p>}
      <ChartViewer document={chart} />
    </>
  );
}
