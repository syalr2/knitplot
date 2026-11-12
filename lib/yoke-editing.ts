import { type CellSelection, type ChartDocument } from "./chart";
import {
  copySelectionBlock,
  reduceSelectionEdit,
  type SelectionEdit,
} from "./chart-selection";
import { yokeChart } from "./yoke-chart";
import { paintYoke, type YokeProject } from "./yoke-project";
import { floodYokeYarn } from "./yoke-fill";
import { repeatTargets, type YokeRepeatScope } from "./yoke-repeat-scope";
import { yokeProgramDrawing } from "./yoke-program-drawing";
import {
  recolorYokeCells,
  yokeCellRepeat,
  yokeRepeatWidths,
  resolvedYokeProgram,
} from "./yoke-program-state";

/** A temporary editing surface; never saved as the canonical chart document. */
export function yokeDrawing(project: YokeProject, repeat: number | null) {
  if (project.program) return yokeProgramDrawing(project, repeat);
  const base = yokeChart(project, repeat ?? 0);
  const count = repeat === null ? project.measurements.repeats : 1;
  const width = base.document.width;
  const document: ChartDocument =
    count === 1
      ? base.document
      : {
          ...base.document,
          width: width * count,
          cells: base.document.cells.map((_, chartRow) => {
            const row = project.cells.length - 1 - chartRow;
            const active = project.cells[row].length / count;
            const result = Array<string>(width * count).fill("yarn-0");
            for (let section = 0; section < count; section++)
              base.maps[row].forEach((column, stitch) => {
                result[section * width + column] =
                  `yarn-${project.cells[row][section * active + stitch]}`;
              });
            return result;
          }),
          stitchActions: base.document.stitchActions!.map((row) =>
            Array.from({ length: count }, () => row).flat(),
          ),
        };
  function chartCell(row: number, column: number) {
    const active = project.cells[row].length / project.measurements.repeats;
    return {
      row: project.cells.length - 1 - row,
      column:
        base.maps[row][column % active] +
        (repeat === null ? Math.floor(column / active) * width : 0),
    };
  }
  function yokeCell(row: number, column: number) {
    if (
      row < 0 ||
      row >= document.height ||
      column < 0 ||
      column >= document.width
    )
      return null;
    const round = project.cells.length - 1 - row;
    const stitch = base.maps[round]?.indexOf(column % width) ?? -1;
    if (stitch < 0) return null;
    const active = project.cells[round].length / project.measurements.repeats;
    return {
      row: round,
      column: (repeat ?? Math.floor(column / width)) * active + stitch,
    };
  }
  return {
    document,
    chartCell,
    yokeCell,
    operationAt: undefined,
    repeatScope: repeat,
  };
}

export function commitYokeYarn(
  project: YokeProject,
  drawing: ReturnType<typeof yokeDrawing>,
  cells: string[][],
  scope: YokeRepeatScope,
  touched?: Set<string>,
) {
  const next = project.cells.map((row) => [...row]);
  const allWidths = yokeRepeatWidths(project);
  let changed = false;
  const force = new Set<string>();
  cells.forEach((row, r) =>
    row.forEach((color, c) => {
      if (
        (!touched?.has(`${r}:${c}`) &&
          color === drawing.document.cells[r][c]) ||
        !/^yarn-\d+$/.test(color)
      )
        return;
      const cell = drawing.yokeCell(r, c);
      const value = Number(color.slice(5));
      if (!cell || value >= project.palette.length) return;
      const widths = allWidths[cell.row];
      let offset = 0,
        within = -1,
        source = -1;
      for (const [section, width] of widths.entries()) {
        if (cell.column < offset + width) {
          within = cell.column - offset;
          source = section;
          break;
        }
        offset += width;
      }
      if (within < 0) return;
      const columns = repeatTargets(scope, widths.length, source)
        .filter((s) => within < widths[s])
        .map((s) => widths.slice(0, s).reduce((a, b) => a + b, 0) + within);
      for (const column of columns) {
        force.add(`${cell.row}:${column}`);
        if (next[cell.row][column] !== value) {
          next[cell.row][column] = value;
          changed = true;
        }
      }
    }),
  );
  return changed || (project.program && force.size)
    ? recolorYokeCells(project, next, force)
    : project;
}

export function copyYokeSelection(
  document: ChartDocument,
  selection: CellSelection | null,
) {
  const block = copySelectionBlock(document, selection);
  if (block)
    block.cells = block.cells.map((row, r) =>
      row.map((color, c) =>
        block.stitchActions[r][c] === "no-stitch" ? "" : color,
      ),
    );
  return block;
}

/** Reuse normal chart selection maths, but never move the shaping layer. */
export function editYokeSelection(
  project: YokeProject,
  drawing: ReturnType<typeof yokeDrawing>,
  selection: CellSelection | null,
  action: SelectionEdit,
  allRepeats: YokeRepeatScope,
) {
  const transparent = {
    ...drawing.document,
    cells: drawing.document.cells.map((row, r) =>
      row.map((color, c) =>
        drawing.document.stitchActions![r][c] === "no-stitch" ? "" : color,
      ),
    ),
  };
  const result = reduceSelectionEdit(
    { document: transparent, selection },
    action,
  );
  if (result.document === transparent && result.selection === selection)
    return { project, selection };
  const touched = new Set<string>();
  for (const area of [selection, result.selection]) {
    if (!area) continue;
    for (
      let r = Math.min(area.startRow, area.endRow);
      r <= Math.max(area.startRow, area.endRow);
      r++
    )
      for (
        let c = Math.min(area.startColumn, area.endColumn);
        c <= Math.max(area.startColumn, area.endColumn);
        c++
      )
        touched.add(`${r}:${c}`);
  }
  // A transform/move must not silently drop yarn into nonexistent stitches.
  if (
    action.type === "move" ||
    action.type === "transform" ||
    action.type === "paste"
  ) {
    if (typeof allRepeats !== "boolean") {
      const widths = yokeRepeatWidths(project);
      const outsideGroup = result.document.cells.some((row, r) =>
        row.some((color, c) => {
          if (color === transparent.cells[r]?.[c]) return false;
          const cell = drawing.yokeCell(r, c);
          if (!cell) return false;
          let end = 0;
          const section = widths[cell.row].findIndex((width) => {
            end += width;
            return cell.column < end;
          });
          return !allRepeats.includes(section);
        }),
      );
      if (outsideGroup)
        throw new Error(
          "That edit would cross outside the selected repeat group.",
        );
    }
    if (
      result.document.cells.some((row, r) =>
        row.some(
          (color, c) =>
            color &&
            color !== "yarn-0" &&
            color !== transparent.cells[r][c] &&
            !drawing.yokeCell(r, c),
        ),
      )
    )
      throw new Error(
        "That design would extend into no-stitch space. Move or resize the selection first.",
      );
  }
  return {
    project: commitYokeYarn(
      project,
      drawing,
      result.document.cells,
      allRepeats,
      touched,
    ),
    selection: result.selection,
  };
}

export function fillYoke(
  project: YokeProject,
  drawing: ReturnType<typeof yokeDrawing>,
  row: number,
  column: number,
  color: number,
  allRepeats: YokeRepeatScope,
  rowOnly: boolean,
) {
  if (!rowOnly) {
    return floodYokeYarn(
      project,
      row,
      column,
      color,
      allRepeats,
      drawing.repeatScope !== null,
    );
  }
  const scope = yokeCellRepeat(project, row, column);
  if (!scope) return project;
  const start = allRepeats || drawing.repeatScope !== null ? scope.offset : 0;
  const end =
    allRepeats || drawing.repeatScope !== null
      ? start + scope.width
      : project.cells[row].length;
  const old = project.cells[row][column];
  let next = project;
  for (let c = column; c >= start && project.cells[row][c] === old; c--)
    next = paintYoke(next, row, c, color, allRepeats);
  for (let c = column + 1; c < end && project.cells[row][c] === old; c++)
    next = paintYoke(next, row, c, color, allRepeats);
  return next;
}

export function yokeRepeatsDiffer(project: YokeProject) {
  if (project.program) {
    const rounds = resolvedYokeProgram(project.program);
    return rounds.some((round) =>
      round.sections.some(
        (section) =>
          JSON.stringify(section.map((loop) => [loop.color, loop.action])) !==
          JSON.stringify(
            round.sections[0].map((loop) => [loop.color, loop.action]),
          ),
      ),
    );
  }
  const repeats = project.measurements.repeats;
  return project.cells.some((row) => {
    const width = row.length / repeats;
    return row.some((color, index) => color !== row[index % width]);
  });
}

export function copyYokeRepeat(
  project: YokeProject,
  repeat: number,
  targets?: readonly number[],
) {
  if (
    !Number.isInteger(repeat) ||
    repeat < 0 ||
    repeat >= project.measurements.repeats
  )
    throw new Error("Choose a valid repeat.");
  if (!yokeRepeatsDiffer(project)) return project;
  if (project.program) {
    const widths = yokeRepeatWidths(project);
    const cells = project.cells.map((row, r) => {
      const width = widths[r][repeat],
        offset = widths[r].slice(0, repeat).reduce((a, b) => a + b, 0),
        source = row.slice(offset, offset + width);
      let start = 0;
      return widths[r].flatMap((size, section) => {
        const original = row.slice(start, start + size);
        start += size;
        if (targets && !targets.includes(section)) return original;
        return Array.from({ length: size }, (_, c) =>
          source.length
            ? source[
                Math.min(
                  source.length - 1,
                  Math.floor((c * source.length) / size),
                )
              ]
            : 0,
        );
      });
    });
    return recolorYokeCells(project, cells);
  }
  return {
    ...project,
    cells: project.cells.map((row) => {
      const width = row.length / project.measurements.repeats;
      const source = row.slice(repeat * width, (repeat + 1) * width);
      return row.map((color, index) =>
        !targets || targets.includes(Math.floor(index / width))
          ? source[index % width]
          : color,
      );
    }),
  };
}
