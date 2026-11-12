import { z } from "zod";
import { repeatTargets, type YokeRepeatScope } from "./yoke-repeat-scope";
import { planYokeShortRows, yokeShortRowsSchema } from "./yoke-short-rows";
import { yokeStitchProgramSchema } from "./yoke-stitch-program-schema";
import { validateYokeRepeatColumns } from "./yoke-program-chart";
import { stitchPaletteActionSchema } from "./stitch-schema";
import {
  yokeCellRepeat,
  yokeRepeatWidths,
  recolorYokeCells,
  resolvedYokeProgram,
  withYokeProgram,
} from "./yoke-program-state";
import { yokeProgramFromProject } from "./yoke-program-from-project";
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
    version: z.union([z.literal(1), z.literal(2)]),
    program: yokeStitchProgramSchema.optional(),
    stitchPalette: z
      .array(stitchPaletteActionSchema)
      .max(12)
      .refine((list) => new Set(list).size === list.length)
      .optional(),
    stitchColors: z
      .partialRecord(
        stitchPaletteActionSchema,
        z.string().regex(/^#[0-9a-f]{6}$/i),
      )
      .optional(),
    measurements: yokeMeasurementsSchema,
    events: z.array(increaseEventSchema).max(149),
    shortRows: yokeShortRowsSchema.optional(),
    palette: paletteSchema,
    cells: z.array(z.array(z.number().int().min(0).max(7)).max(1200)).max(150),
  })
  .superRefine((project, ctx) => {
    try {
      if (project.shortRows)
        planYokeShortRows(project.measurements, project.shortRows);
      if (project.version === 2) {
        if (!project.program)
          throw new Error("Revised yokes need stitch instructions.");
        const rounds = resolvedYokeProgram(project.program);
        if (
          project.program.startingCounts.length !==
            project.measurements.repeats ||
          project.program.startingCounts.reduce((a, b) => a + b, 0) !==
            calculateYokeTargets(project.measurements).neck ||
          rounds.length !== calculateYokeTargets(project.measurements).rounds
        )
          throw new Error(
            "Yoke instructions do not match its repeat/round settings.",
          );
        const expected = rounds.map((round) =>
          round.sections.flat().map((loop) => loop.color),
        );
        if (
          JSON.stringify(expected) !== JSON.stringify(project.cells) ||
          project.program.rounds.some((round) =>
            round.some((ops) =>
              ops.some((op) => op.color >= project.palette.length),
            ),
          )
        )
          throw new Error("Yoke colours do not match the stitch instructions.");
        validateYokeRepeatColumns(project.program);
        return;
      }
      if (project.program)
        throw new Error("Stitch programs need yoke version 2.");
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

export function serializeYokeProject(project: YokeProject) {
  return JSON.stringify(yokeProjectSchema.parse(project));
}

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
  scope: YokeRepeatScope,
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
  if (
    project.program ||
    (project.stitchColors && Object.keys(project.stitchColors).length)
  ) {
    const effective = project.program
      ? project
      : withYokeProgram(project, yokeProgramFromProject(project));
    const target = yokeCellRepeat(effective, row, column);
    if (!target) return project;
    const widths = yokeRepeatWidths(effective)[row],
      cells = effective.cells.map((line) => [...line]);
    const targets = new Set(
      repeatTargets(scope, widths.length, target.section),
    );
    let offset = 0;
    const force = new Set<string>();
    for (const [section, width] of widths.entries()) {
      const at = offset + target.within;
      if (targets.has(section) && target.within < width) {
        cells[row][at] = color;
        force.add(`${row}:${at}`);
      }
      offset += width;
    }
    if (!force.size) return project;
    return recolorYokeCells(effective, cells, force);
  }
  const width = project.cells[row].length / project.measurements.repeats;
  const targets = new Set(
    repeatTargets(
      scope,
      project.measurements.repeats,
      Math.floor(column / width),
    ),
  );
  const cells = project.cells.slice();
  let changed = false;
  cells[row] = project.cells[row].map((previous, index) => {
    if (
      targets.has(Math.floor(index / width)) &&
      index % width === column % width &&
      previous !== color
    ) {
      changed = true;
      return color;
    }
    return previous;
  });
  return changed ? { ...project, cells } : project;
}
