export type YokeView = "whole" | "repeat" | "chart";
export const YOKE_CANVAS = { width: 1000, height: 800 };
const TAU = Math.PI * 2;
const margin = 40;

export function yokeGeometry(
  counts: number[],
  repeats: number,
  view: YokeView,
  aspect: number,
) {
  const shownCounts = counts.map((count) =>
    view === "whole" ? count : count / repeats,
  );
  const largest = Math.max(...shownCounts);
  const rowHeight = (YOKE_CANVAS.height - margin * 2) / counts.length;
  const cellWidth = Math.min(
    rowHeight * aspect,
    (YOKE_CANVAS.width - margin * 2) / largest,
  );
  const arc = view === "whole" ? TAU : TAU / repeats;
  const inner = view === "whole" ? 95 : 80;
  const outer = view === "whole" ? 355 : 690;
  return {
    shownCounts,
    cellWidth,
    rowHeight,
    arc,
    inner,
    outer,
    radialHeight: (outer - inner) / counts.length,
    cx: 500,
    cy: view === "whole" ? 400 : 20,
    startAngle: view === "whole" ? -Math.PI / 2 : Math.PI / 2 - arc / 2,
  };
}

/** Shared geometry for drawing AND hit testing; CSS scaling is handled by callers. */
export function yokeCellAt(
  counts: number[],
  repeats: number,
  view: YokeView,
  aspect: number,
  x: number,
  y: number,
) {
  const g = yokeGeometry(counts, repeats, view, aspect);
  if (view === "chart") {
    const row = Math.floor((YOKE_CANVAS.height - margin - y) / g.rowHeight);
    if (row < 0 || row >= counts.length) return null;
    const left = (YOKE_CANVAS.width - g.shownCounts[row] * g.cellWidth) / 2;
    const column = Math.floor((x - left) / g.cellWidth);
    return column >= 0 && column < g.shownCounts[row] ? { row, column } : null;
  }
  const dx = x - g.cx,
    dy = y - g.cy;
  const radius = Math.hypot(dx, dy);
  const row = Math.floor((radius - g.inner) / g.radialHeight);
  if (row < 0 || row >= counts.length) return null;
  const angle = (((Math.atan2(dy, dx) - g.startAngle) % TAU) + TAU) % TAU;
  if (angle >= g.arc) return null;
  const column = Math.min(
    g.shownCounts[row] - 1,
    Math.floor((angle / g.arc) * g.shownCounts[row]),
  );
  return { row, column };
}
