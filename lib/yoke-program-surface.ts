import type { YokeProject } from "./yoke-project";
import { yokeProgramChart } from "./yoke-program-chart";
import { yokeGeometry, type YokeView } from "./yoke-layout";
const cache = new Map<YokeProject, ReturnType<typeof build>>();
function build(project: YokeProject) {
  if (!project.program) throw new Error("Missing yoke stitch program.");
  const charts = project.program.startingCounts.map((_, s) =>
    yokeProgramChart(project, s),
  );
  const rows = project.cells.map((_, r) => {
    let outputOffset = 0;
    return charts.flatMap((chart, section) => {
      const result = chart.surface[r].map((slot) => ({
        ...slot,
        section,
        loop: slot.loop < 0 ? -1 : slot.loop + outputOffset,
      }));
      outputOffset += chart.maps[r].length;
      return result;
    });
  });
  const widths = project.cells.map((_, r) =>
    charts.map((chart) => chart.surface[r].length),
  );
  return { charts, rows, widths };
}
export function yokeProgramSurface(project: YokeProject) {
  let result = cache.get(project);
  if (!result) {
    result = build(project);
    cache.set(project, result);
    while (cache.size > 3) cache.delete(cache.keys().next().value!);
  }
  return result;
}
export function yokeProgramGeometry(
  project: YokeProject,
  view: YokeView,
  repeat: number,
) {
  const surface = yokeProgramSurface(project),
    counts = surface.rows.map((row) => row.length);
  const g = yokeGeometry(
    counts,
    project.measurements.repeats,
    view,
    project.measurements.gaugeRows / project.measurements.gaugeStitches,
  );
  if (view === "repeat") {
    g.shownCounts = surface.widths.map((row) => row[repeat]);
    g.columnOffsets = surface.widths.map((row) =>
      row.slice(0, repeat).reduce((a, b) => a + b, 0),
    );
    g.rowArcs = surface.widths.map((row) =>
      Math.max(
        0.001,
        (row[repeat] /
          Math.max(
            1,
            row.reduce((a, b) => a + b, 0),
          )) *
          Math.PI *
          2,
      ),
    );
    g.rowAngles = g.rowArcs.map((arc) => Math.PI / 2 - arc / 2);
    g.arc = Math.max(...g.rowArcs);
    g.startAngle = Math.PI / 2 - g.arc / 2;
  }
  return g;
}
