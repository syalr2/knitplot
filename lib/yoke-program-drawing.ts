import type { ChartDocument } from "./chart";
import type { YokeProject } from "./yoke-project";
import { yokeProgramSurface } from "./yoke-program-surface";
import { yokeRepeatWidths } from "./yoke-program-state";

export function yokeProgramDrawing(
  project: YokeProject,
  repeat: number | null,
) {
  const { charts } = yokeProgramSurface(project);
  const widths = yokeRepeatWidths(project);
  const sizes = charts.map((chart) => chart.document.width);
  const offsets = sizes.map((_, s) =>
    sizes.slice(0, s).reduce((a, b) => a + b, 0),
  );
  const document: ChartDocument =
    repeat !== null
      ? charts[repeat].document
      : {
          ...charts[0].document,
          width: sizes.reduce((a, b) => a + b, 0),
          cells: charts[0].document.cells.map((_, r) =>
            charts.flatMap((chart) => chart.document.cells[r]),
          ),
          stitchActions: charts[0].document.cells.map((_, r) =>
            charts.flatMap((chart) => chart.document.stitchActions![r]),
          ),
          stitchCellColors: charts[0].document.cells.map((_, r) =>
            charts.flatMap((chart) => chart.document.stitchCellColors![r]),
          ),
        };
  function chartCell(row: number, column: number) {
    let offset = 0;
    for (let s = 0; s < widths[row].length; s++) {
      if (column < offset + widths[row][s])
        return {
          row: project.cells.length - 1 - row,
          column:
            charts[s].maps[row][column - offset] +
            (repeat === null ? offsets[s] : 0),
        };
      offset += widths[row][s];
    }
    return { row: -1, column: -1 };
  }
  function sectionCell(row: number, column: number) {
    const round = project.cells.length - 1 - row;
    if (
      round < 0 ||
      round >= widths.length ||
      column < 0 ||
      column >= document.width
    )
      return null;
    const s =
      repeat ??
      offsets.findIndex(
        (offset, s) => column >= offset && column < offset + sizes[s],
      );
    if (s < 0) return null;
    return {
      round,
      section: s,
      column: column - (repeat === null ? offsets[s] : 0),
    };
  }
  function yokeCell(row: number, column: number) {
    const cell = sectionCell(row, column);
    if (!cell) return null;
    const within = charts[cell.section].maps[cell.round].indexOf(cell.column);
    return within < 0
      ? null
      : {
          row: cell.round,
          column:
            widths[cell.round]
              .slice(0, cell.section)
              .reduce((a, b) => a + b, 0) + within,
        };
  }
  function operationAt(row: number, column: number) {
    const cell = sectionCell(row, column);
    if (!cell) return null;
    const operation = charts[cell.section].operationMaps[cell.round].get(
      cell.column,
    );
    return operation
      ? { round: cell.round, section: cell.section, operation }
      : null;
  }
  return { document, chartCell, yokeCell, operationAt, repeatScope: repeat };
}
