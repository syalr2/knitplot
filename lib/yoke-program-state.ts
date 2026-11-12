import {
  resolveYokeProgram,
  type YokeStitchProgram,
} from "./yoke-stitch-program";
import type { YokeProject } from "./yoke-project";
const resolvedCache = new Map<
  YokeStitchProgram,
  ReturnType<typeof resolveYokeProgram>
>();
export function resolvedYokeProgram(program: YokeStitchProgram) {
  let result = resolvedCache.get(program);
  if (!result) {
    result = resolveYokeProgram(program);
    resolvedCache.set(program, result);
    while (resolvedCache.size > 3)
      resolvedCache.delete(resolvedCache.keys().next().value!);
  }
  return result;
}
export function withYokeProgram(
  project: YokeProject,
  program: YokeStitchProgram,
): YokeProject {
  const resolved = resolvedYokeProgram(program);
  return {
    ...project,
    version: 2,
    program,
    cells: resolved.map((round) =>
      round.sections.flat().map((loop) => loop.color),
    ),
  };
}
export function yokeRepeatWidths(project: YokeProject) {
  return project.program
    ? resolvedYokeProgram(project.program).map((round) =>
        round.sections.map((section) => section.length),
      )
    : project.cells.map((row) =>
        Array<number>(project.measurements.repeats).fill(
          row.length / project.measurements.repeats,
        ),
      );
}
export function yokeRepeatOffset(
  project: YokeProject,
  row: number,
  repeat: number,
) {
  return yokeRepeatWidths(project)
    [row].slice(0, repeat)
    .reduce((a, b) => a + b, 0);
}
export function yokeCellRepeat(
  project: YokeProject,
  row: number,
  column: number,
) {
  const widths = yokeRepeatWidths(project)[row];
  let offset = 0;
  for (let section = 0; section < widths.length; section++) {
    if (column < offset + widths[section])
      return {
        section,
        within: column - offset,
        offset,
        width: widths[section],
      };
    offset += widths[section];
  }
  return null;
}
/** Colour edits on one kfb output colour that instruction's two loops together. */
export function recolorYokeCells(
  project: YokeProject,
  cells: number[][],
  force?: Set<string>,
): YokeProject {
  if (!project.program) return { ...project, cells };
  const resolved = resolvedYokeProgram(project.program);
  let changed = false;
  const rounds = project.program.rounds.map((sections, r) => {
    let offset = 0;
    return sections.map((ops, s) => {
      const colors = new Map<string, number>();
      resolved[r].sections[s].forEach((loop, c) => {
        if (
          cells[r][offset + c] !== project.cells[r][offset + c] ||
          force?.has(`${r}:${offset + c}`)
        )
          colors.set(loop.operation, cells[r][offset + c]);
      });
      offset += resolved[r].sections[s].length;
      return ops.map((op) => {
        const color = colors.get(op.id);
        if (color === undefined) return op;
        const displayColor =
          op.action !== "knit" &&
          (project.stitchColors?.[op.action] || op.displayColor)
            ? "yarn"
            : undefined;
        if (color === op.color && displayColor === op.displayColor) return op;
        changed = true;
        const next = { ...op, color };
        if (displayColor) next.displayColor = displayColor;
        else delete next.displayColor;
        return next;
      });
    });
  });
  return changed
    ? withYokeProgram(project, { ...project.program, rounds })
    : project;
}
