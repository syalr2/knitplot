import type { ChartDocument } from "./chart";
import { yokeChart } from "./yoke-chart";
import { createYokeProject, type YokeProject } from "./yoke-project";
import { yokeRepeatWidths } from "./yoke-program-state";
import {
  calculateYokeTargets,
  type IncreaseEvent,
  type YokeMeasurements,
} from "./yoke-plan";

export function yokeDocument(
  project: YokeProject,
  name = "Untitled yoke",
): ChartDocument {
  return { ...yokeChart(project).document, name, yoke: project };
}

export function yokeTransferCounts(source: YokeProject, target: YokeProject) {
  const repeats = Math.min(
    source.measurements.repeats,
    target.measurements.repeats,
  );
  let retained = 0;
  const oldWidths = yokeRepeatWidths(source),
    newWidths = yokeRepeatWidths(target);
  for (
    let row = 0;
    row < Math.min(source.cells.length, target.cells.length);
    row++
  )
    for (let repeat = 0; repeat < repeats; repeat++)
      retained += Math.min(oldWidths[row][repeat], newWidths[row][repeat]);
  return {
    cropped:
      source.cells.reduce((count, row) => count + row.length, 0) - retained,
    added:
      target.cells.reduce((count, row) => count + row.length, 0) - retained,
  };
}

/** Preserve stitch scale around each repeat's centre; extra repeats start blank.
 * Scaling maps each repeat separately, so independent motifs never blend.
 * Row zero is the neck edge. Shaping comes from the NEW plan, never resized symbols.
 */
export function reshapeYoke(
  source: YokeProject,
  measurements: YokeMeasurements,
  events: IncreaseEvent[],
  mode: "keep" | "scale",
) {
  const next = createYokeProject(measurements, events);
  next.palette = [...source.palette];
  const oldRepeats = source.measurements.repeats,
    newRepeats = measurements.repeats;
  const widths = yokeRepeatWidths(source);
  next.cells = next.cells.map((row, r) => {
    const oldRow =
      mode === "scale"
        ? Math.min(
            source.cells.length - 1,
            Math.floor((r * source.cells.length) / next.cells.length),
          )
        : r;
    if (!source.cells[oldRow]) return row;
    const width = row.length / newRepeats;
    return row.map((_, c) => {
      const repeat = Math.floor(c / width),
        within = c % width;
      const oldWidth = widths[oldRow][repeat] ?? 0;
      if (!oldWidth) return 0;
      const oldWithin =
        mode === "scale"
          ? Math.min(oldWidth - 1, Math.floor((within * oldWidth) / width))
          : within - Math.floor((width - oldWidth) / 2);
      return repeat < oldRepeats && oldWithin >= 0 && oldWithin < oldWidth
        ? source.cells[oldRow][
            widths[oldRow].slice(0, repeat).reduce((a, b) => a + b, 0) +
              oldWithin
          ]
        : 0;
    });
  });
  if (
    source.shortRows &&
    source.cells[0].length === next.cells[0].length &&
    calculateYokeTargets(measurements).shortRowPairs ===
      source.shortRows.distances.length
  )
    next.shortRows = structuredClone(source.shortRows);
  return next;
}

/** Gauge edits re-measure existing stitches; they never regenerate the plan. */
export function regaugeYoke(
  source: YokeProject,
  gauge: Pick<YokeMeasurements, "gaugeStitches" | "gaugeRows" | "gaugeMeasure">,
) {
  const old = source.measurements;
  if (
    Object.values(gauge).some(
      (value) => !Number.isFinite(value) || value <= 0 || value > 100,
    )
  )
    throw new Error("Enter positive gauge values up to 100.");
  const widthFactor =
    old.gaugeStitches /
    old.gaugeMeasure /
    (gauge.gaugeStitches / gauge.gaugeMeasure);
  const heightFactor =
    old.gaugeRows / old.gaugeMeasure / (gauge.gaugeRows / gauge.gaugeMeasure);
  const measurements = { ...old, ...gauge };
  for (const key of [
    "neck",
    "chest",
    "bodyEase",
    "upperArm",
    "sleeveEase",
    "underarm",
  ] as const)
    measurements[key] *= widthFactor;
  for (const key of ["depth", "backRise"] as const)
    measurements[key] *= heightFactor;
  if (measurements.shoulderCircumference !== undefined)
    measurements.shoulderCircumference *= widthFactor;
  if (measurements.shoulderLength !== undefined)
    measurements.shoulderLength *= heightFactor;
  return { ...source, measurements };
}
