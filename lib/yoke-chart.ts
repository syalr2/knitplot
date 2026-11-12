import { cloneDocument, defaultDocument, type StitchAction } from "./chart";
import { increasePositions } from "./yoke-plan";
import type { YokeProject } from "./yoke-project";
import { yokeProgramChart } from "./yoke-program-chart";

/** Follow stitch ancestry backwards: new stitches leave no-stitch placeholders below. */
export function yokeChart(project: YokeProject, repeat = 0) {
  if (project.program) return yokeProgramChart(project, repeat);
  const repeats = project.measurements.repeats;
  const height = project.cells.length;
  const width = project.cells[height - 1].length / repeats;
  let columns = Array.from({ length: width }, (_, index) => index);
  const maps: number[][] = Array.from({ length: height }, () => []);
  const cells = Array.from({ length: height }, () =>
    Array<string>(width).fill("yarn-0"),
  );
  const actions = Array.from({ length: height }, () =>
    Array<StitchAction>(width).fill("no-stitch"),
  );
  const increases = new Map(
    project.events.map((event) => [event.round - 1, event]),
  );
  for (let row = height - 1; row >= 0; row--) {
    const chartRow = height - 1 - row;
    const event = increases.get(row);
    const positions = event
      ? new Set(
          increasePositions(
            event,
            project.cells[row - 1].length / repeats,
            repeats,
          ),
        )
      : new Set<number>();
    maps[row] = columns;
    columns.forEach((column, stitch) => {
      cells[chartRow][column] =
        `yarn-${project.cells[row][repeat * columns.length + stitch]}`;
      actions[chartRow][column] = positions.has(stitch)
        ? (event?.directions?.[event.placements?.indexOf(stitch) ?? -1] ??
          event?.stitch ??
          "m1l")
        : "knit";
    });
    columns = columns.filter((_, stitch) => !positions.has(stitch));
  }
  const document = cloneDocument(defaultDocument);
  Object.assign(document, {
    name: "Yoke repeat",
    width,
    height,
    cells,
    stitchActions: actions,
    stitchCellColors: undefined,
    stitchPalette: project.stitchPalette,
    stitchColors: project.stitchColors,
    palette: project.palette.map((hex, index) => ({
      id: `yarn-${index}`,
      hex,
    })),
    gaugeStitches: project.measurements.gaugeStitches,
    gaugeRows: project.measurements.gaugeRows,
    gaugeMeasure: project.measurements.gaugeMeasure,
    gaugeUnit: project.measurements.unit,
    instructions: {
      ...document.instructions,
      construction: "round",
      patternUse: "repeat",
    },
    guides: { ...document.guides, repeatWidth: width, repeatHeight: height },
  });
  return { document, maps, operationMaps: undefined, surface: undefined };
}

export function yokeChartCell(
  project: YokeProject,
  chartRow: number,
  chartColumn: number,
) {
  const row = project.cells.length - 1 - chartRow;
  const columns = yokeChart(project).maps[row];
  const column = columns?.indexOf(chartColumn) ?? -1;
  return column < 0 ? null : { row, column };
}
