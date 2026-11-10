import { z } from "zod";
import {
  calculateYokeTargets,
  increaseEventSchema,
  yokeMeasurementsSchema,
  yokeRoundCounts,
  type YokeMeasurements,
  type IncreaseEvent,
} from "./yoke-plan";

const paletteSchema = z
  .array(z.string().regex(/^#[0-9a-f]{6}$/i))
  .min(2)
  .max(8);
export const yokeProjectSchema = z
  .object({
    format: z.literal("knitplot-yoke"),
    version: z.literal(1),
    measurements: yokeMeasurementsSchema,
    events: z.array(increaseEventSchema).max(149),
    palette: paletteSchema,
    cells: z.array(z.array(z.number().int().min(0).max(7)).max(1200)).max(150),
  })
  .superRefine((project, ctx) => {
    try {
      const counts = yokeRoundCounts(
        calculateYokeTargets(project.measurements),
        project.measurements.repeats,
        project.events,
      );
      if (
        project.cells.length !== counts.length ||
        project.cells.some(
          (row, index) =>
            row.length !== counts[index] ||
            row.some((color) => color >= project.palette.length),
        )
      )
        throw new Error("Invalid yoke stitch data.");
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        message: error instanceof Error ? error.message : "Invalid yoke plan.",
      });
    }
  });
export type YokeProject = z.infer<typeof yokeProjectSchema>;

export function createYokeProject(
  measurements: YokeMeasurements,
  events: IncreaseEvent[],
): YokeProject {
  const counts = yokeRoundCounts(
    calculateYokeTargets(measurements),
    measurements.repeats,
    events,
  );
  return {
    format: "knitplot-yoke",
    version: 1,
    measurements: { ...measurements },
    events: events.map((event) => ({ ...event })),
    palette: ["#f2eadf", "#334c44", "#c86f52"],
    cells: counts.map((count) => Array<number>(count).fill(0)),
  };
}

export function paintYoke(
  project: YokeProject,
  row: number,
  column: number,
  color: number,
  allRepeats: boolean,
): YokeProject {
  if (
    !Number.isInteger(row) ||
    !Number.isInteger(column) ||
    !Number.isInteger(color) ||
    !project.cells[row] ||
    column < 0 ||
    column >= project.cells[row].length ||
    color < 0 ||
    color >= project.palette.length
  )
    return project;
  const width = project.cells[row].length / project.measurements.repeats;
  const cells = project.cells.slice();
  let changed = false;
  cells[row] = project.cells[row].map((previous, index) => {
    if (
      (allRepeats ? index % width === column % width : index === column) &&
      previous !== color
    ) {
      changed = true;
      return color;
    }
    return previous;
  });
  return changed ? { ...project, cells } : project;
}
