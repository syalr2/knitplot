import type { planYokeShortRows } from "./yoke-short-rows";

/** Design projection, not fabric simulation. Pack active partial rows against
 * chart round 1 at each neck stitch so shortening rows cannot leave air gaps.
 * Full-round drawing/hit-test geometry is intentionally unchanged.
 */
export function shortRowCells(
  plan: ReturnType<typeof planYokeShortRows>,
  chartInner: number,
  chartRowHeight: number,
) {
  const height = Math.min(
    chartRowHeight,
    (chartInner - 35) / Math.max(1, plan.extraRows),
  );
  if (!Number.isFinite(height) || height <= 0)
    throw new Error("Invalid short-row drawing bounds.");
  const cells: {
    column: number;
    pair: number;
    course: number;
    inner: number;
    outer: number;
    start: number;
    end: number;
  }[] = [];
  for (let column = 0; column < plan.neck; column++) {
    const active = plan.distances.flatMap((distance, pair) =>
      column < distance || column >= plan.neck - distance ? [pair] : [],
    );
    active.forEach((pair, index) => {
      for (let course = 0; course < 2; course++) {
        const inner =
          chartInner - (active.length * 2 - index * 2 - course) * height;
        cells.push({
          column,
          pair,
          course,
          inner,
          outer: inner + height,
          start: -Math.PI / 2 + (column / plan.neck) * Math.PI * 2,
          end: -Math.PI / 2 + ((column + 1) / plan.neck) * Math.PI * 2,
        });
      }
    });
  }
  return cells;
}

/** Re-project the actual back-centred courses into a front/back half, including
 * shoulder-side portions that legitimately wrap into the front half. */
export function shortRowViewCells(
  plan: ReturnType<typeof planYokeShortRows>,
  inner: number,
  height: number,
  view: "whole" | "front" | "back",
) {
  const cells = shortRowCells(plan, inner, height);
  if (view === "whole") return cells;
  const offset = Math.floor(plan.neck * (view === "front" ? 0.25 : 0.75));
  const count = Math.ceil(plan.neck / 2);
  return cells.flatMap((cell) => {
    const column = (cell.column - offset + plan.neck) % plan.neck;
    return column < count
      ? [
          {
            ...cell,
            start: (column / count) * Math.PI,
            end: ((column + 1) / count) * Math.PI,
          },
        ]
      : [];
  });
}
