export type YokeView = "whole" | "repeat" | "chart" | "front" | "back";
export const YOKE_CANVAS = { width: 1000, height: 800 };
const TAU = Math.PI * 2;
const margin = 40;

export function yokeGeometry(
  counts: number[],
  repeats: number,
  view: YokeView,
  aspect: number,
) {
  const half = view === "front" || view === "back";
  const shownCounts = counts.map((count) =>
    view === "whole" ? count : half ? Math.ceil(count / 2) : count / repeats,
  );
  const columnOffsets = counts.map((count) =>
    half ? Math.floor(count * (view === "front" ? 0.25 : 0.75)) : 0,
  );
  const largest = Math.max(...shownCounts);
  const rowHeight = (YOKE_CANVAS.height - margin * 2) / counts.length;
  const cellWidth = Math.min(
    rowHeight * aspect,
    (YOKE_CANVAS.width - margin * 2) / largest,
  );
  const arc = view === "whole" ? TAU : half ? Math.PI : TAU / repeats;
  const inner = view === "whole" || half ? 95 : 80;
  const outer = view === "whole" ? 355 : half ? 450 : 690;
  return {
    shownCounts,
    columnOffsets,
    cellWidth,
    rowHeight,
    arc,
    inner,
    outer,
    radialHeight: (outer - inner) / counts.length,
    cx: 500,
    cy: view === "whole" ? 400 : half ? 180 : 20,
    startAngle: view === "whole" ? -Math.PI / 2 : Math.PI / 2 - arc / 2,
    rowArcs: counts.map(() => arc),
    rowAngles: counts.map(() =>
      view === "whole" ? -Math.PI / 2 : Math.PI / 2 - arc / 2,
    ),
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
  geometry?: ReturnType<typeof yokeGeometry>,
) {
  const g = geometry ?? yokeGeometry(counts, repeats, view, aspect);
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
  const angle = (((Math.atan2(dy, dx) - g.rowAngles[row]) % TAU) + TAU) % TAU;
  if (angle >= g.rowArcs[row] || !g.shownCounts[row]) return null;
  const column = Math.min(
    g.shownCounts[row] - 1,
    Math.floor((angle / g.rowArcs[row]) * g.shownCounts[row]),
  );
  return { row, column: (column + g.columnOffsets[row]) % counts[row] };
}
