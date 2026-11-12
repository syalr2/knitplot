import { YOKE_CANVAS, yokeGeometry, type YokeView } from "./yoke-layout";

/** Native screen resolution where possible, with bounded bitmap memory. */
export function yokeBitmapScale(
  width: number,
  height: number,
  displayScale: number,
  pixelRatio: number,
) {
  return Math.min(
    displayScale * pixelRatio,
    8192 / Math.max(width, height),
    Math.sqrt(12_000_000 / (width * height)),
  );
}

/** Crop empty margins and keep a drawable minimum cell size at 100%. */
export function yokeCanvasViewport(
  counts: number[],
  repeats: number,
  view: YokeView,
  aspect: number,
  geometry?: ReturnType<typeof yokeGeometry>,
) {
  const g = geometry ?? yokeGeometry(counts, repeats, view, aspect);
  const angles = [g.startAngle, g.startAngle + g.arc];
  for (let a = -Math.PI * 2; a <= Math.PI * 4; a += Math.PI / 2)
    if (a >= g.startAngle && a <= g.startAngle + g.arc) angles.push(a);
  const points = angles.flatMap((a) =>
    [g.inner, g.outer].map((radius) => ({
      x: g.cx + Math.cos(a) * radius,
      y: g.cy + Math.sin(a) * radius,
    })),
  );
  const minX = view === "chart" ? 0 : Math.min(...points.map((p) => p.x)) - 8;
  const minY = view === "chart" ? 0 : Math.min(...points.map((p) => p.y)) - 8;
  const width =
    view === "chart"
      ? YOKE_CANVAS.width
      : Math.max(...points.map((p) => p.x)) - minX + 8;
  const height =
    view === "chart"
      ? YOKE_CANVAS.height
      : Math.max(...points.map((p) => p.y)) - minY + 8;
  const narrowest = Math.min(
    ...g.shownCounts.map((n, r) =>
      n
        ? ((g.inner + (r + 0.5) * g.radialHeight) * g.rowArcs[r]) / n
        : Infinity,
    ),
  );
  const scale =
    view === "chart" ? 1 : Math.max(1, 22 / g.radialHeight, 24 / narrowest);
  return { x: minX, y: minY, width, height, scale };
}
