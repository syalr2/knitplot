"use client";

import { useEffect, useRef } from "react";
import type { ChartDocument } from "@/lib/chart";
import { recordUsage } from "@/lib/usage-analytics";

export function useChartActivity(
  document: ChartDocument,
  tabId: string,
  loaded: boolean,
  signedIn: boolean,
) {
  const previous = useRef<{ tabId: string; drawing: string } | null>(null);
  useEffect(() => {
    if (!loaded) return;
    const drawing = JSON.stringify([
      document.cells,
      document.stitchActions,
      document.stitchColors,
      document.stitchCellColors,
      document.palette,
      document.stitchPalette,
      document.yoke?.cells,
      document.yoke?.program,
      document.yoke?.palette,
      document.yoke?.stitchColors,
    ]);
    const before = previous.current;
    previous.current = { tabId, drawing };
    if (!before || before.tabId !== tabId || before.drawing === drawing) return;
    recordUsage({
      account: signedIn ? "signed_in" : "guest",
      chart_type: document.yoke ? "yoke" : "regular",
    });
  }, [
    document.cells,
    document.stitchActions,
    document.stitchColors,
    document.stitchCellColors,
    document.palette,
    document.stitchPalette,
    document.yoke?.cells,
    document.yoke?.program,
    document.yoke?.palette,
    document.yoke,
    tabId,
    loaded,
    signedIn,
  ]);
}
