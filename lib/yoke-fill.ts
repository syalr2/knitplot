import type { YokeProject } from "./yoke-project";
import { repeatTargets, type YokeRepeatScope } from "./yoke-repeat-scope";
import {
  yokeCellRepeat,
  yokeRepeatWidths,
  recolorYokeCells,
} from "./yoke-program-state";

/** Connected fabric cells: placeholder columns are not holes in the knitting.
 * Across increases, adjacent courses connect wherever their stitch spans overlap.
 */
export function floodYokeYarn(
  project: YokeProject,
  row: number,
  column: number,
  color: number,
  repeatScope: YokeRepeatScope,
  singleRepeat: boolean,
) {
  const targetCell = yokeCellRepeat(project, row, column);
  if (!targetCell) return project;
  const repeatWidths = yokeRepeatWidths(project);
  const scope =
    repeatScope !== false || singleRepeat ? targetCell.section : null;
  const selected = new Set(
    repeatTargets(
      repeatScope,
      project.measurements.repeats,
      targetCell.section,
    ),
  );
  if (!selected.size) return project;
  const widths = project.cells.map((line, r) =>
    scope === null ? line.length : repeatWidths[r][scope],
  );
  const offsets = widths.map((_, r) =>
    scope === null
      ? 0
      : repeatWidths[r].slice(0, scope).reduce((a, b) => a + b, 0),
  );
  const target = project.cells[row][column];
  const visited = widths.map((width) => new Uint8Array(width));
  const queue: [number, number][] = [];
  function visit(r: number, c: number) {
    if (
      r < 0 ||
      r >= widths.length ||
      c < 0 ||
      c >= widths[r] ||
      visited[r][c] ||
      project.cells[r][offsets[r] + c] !== target
    )
      return;
    visited[r][c] = 1;
    queue.push([r, c]);
  }
  visit(row, column - offsets[row]);
  for (let index = 0; index < queue.length; index++) {
    const [r, c] = queue[index],
      width = widths[r];
    visit(r, c - 1);
    visit(r, c + 1);
    if (scope === null) {
      if (c === 0) visit(r, width - 1);
      if (c === width - 1) visit(r, 0);
    }
    for (const adjacent of [r - 1, r + 1]) {
      if (adjacent < 0 || adjacent >= widths.length) continue;
      const n = widths[adjacent];
      const first = Math.floor((c * n) / width + 1e-9),
        last = Math.ceil(((c + 1) * n) / width - 1e-9) - 1;
      for (let candidate = first; candidate <= last; candidate++)
        visit(adjacent, candidate);
    }
  }
  const cells = project.cells.map((line) => [...line]);
  let changed = false;
  for (const [r, c] of queue) {
    const targets =
      repeatScope !== false
        ? repeatWidths[r]
            .map((width, s) =>
              selected.has(s) && c < width
                ? repeatWidths[r].slice(0, s).reduce((a, b) => a + b, 0) + c
                : -1,
            )
            .filter((at) => at >= 0)
        : [offsets[r] + c];
    for (const at of targets)
      if (cells[r][at] !== color) {
        cells[r][at] = color;
        changed = true;
      }
  }
  return changed ? recolorYokeCells(project, cells) : project;
}
