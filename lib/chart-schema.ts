import { z } from "zod";
import {
  cloneDocument,
  MAX_CHART_ROWS,
  MAX_CHART_STITCHES,
  type ChartDocument,
} from "./chart";
import { HttpError } from "./http";
import { yokeProjectSchema } from "./yoke-project";
import { yokeChart } from "./yoke-chart";
import { gaugeMeasurementSchema } from "./gauge-schema";

import { stitchActionSchema, stitchPaletteActionSchema } from "./stitch-schema";
export { stitchActionSchema, stitchPaletteActionSchema } from "./stitch-schema";
const hex = z.string().regex(/^#[0-9a-f]{6}$/i);
const dimension = (max: number) => z.number().int().min(1).max(max);
export const chartDocumentSchema = z
  .object({
    name: z.string().max(200),
    yoke: yokeProjectSchema.optional(),
    width: dimension(MAX_CHART_STITCHES),
    height: dimension(MAX_CHART_ROWS),
    gaugeStitches: gaugeMeasurementSchema,
    gaugeRows: gaugeMeasurementSchema,
    gaugeMeasure: gaugeMeasurementSchema,
    gaugeUnit: z.enum(["cm", "in"]),
    instructions: z
      .object({
        technique: z.enum(["stranded", "intarsia", "duplicate"]),
        construction: z.enum(["flat", "round"]),
        patternUse: z.enum(["single", "repeat"]),
        trimBackground: z.boolean().optional(),
        showSymbols: z.boolean().optional(),
      })
      .optional(),
    guides: z
      .object({
        symmetry: z.enum(["none", "horizontal", "vertical", "both"]),
        showRepeatGuides: z.boolean(),
        repeatWidth: dimension(MAX_CHART_STITCHES),
        repeatHeight: dimension(MAX_CHART_ROWS),
      })
      .optional(),
    palette: z
      .array(z.object({ id: z.string().min(1).max(200), hex }))
      .min(2)
      .max(8),
    cells: z
      .array(z.array(z.string()).max(MAX_CHART_STITCHES))
      .max(MAX_CHART_ROWS),
    stitchActions: z
      .array(z.array(stitchActionSchema).max(MAX_CHART_STITCHES))
      .max(MAX_CHART_ROWS)
      .optional(),
    stitchPalette: z
      .array(stitchPaletteActionSchema)
      .max(12)
      .refine((v) => new Set(v).size === v.length)
      .optional(),
    stitchColors: z.partialRecord(stitchPaletteActionSchema, hex).optional(),
    stitchCellColors: z
      .array(z.array(hex.nullable()).max(MAX_CHART_STITCHES))
      .max(MAX_CHART_ROWS)
      .optional(),
  })
  .superRefine((doc, ctx) => {
    if (doc.yoke) {
      let expected: ChartDocument;
      try {
        expected = cloneDocument(yokeChart(doc.yoke).document);
      } catch {
        ctx.addIssue({
          code: "custom",
          message: "Yoke chart exceeds the supported chart bounds.",
        });
        return;
      }
      const actual = cloneDocument(doc as ChartDocument);
      const fields = [
        "width",
        "height",
        "cells",
        "stitchActions",
        "palette",
        "gaugeStitches",
        "gaugeRows",
        "gaugeMeasure",
        "gaugeUnit",
        "stitchPalette",
        "stitchColors",
        "stitchCellColors",
      ] as const;
      if (
        fields.some(
          (key) =>
            !(
              key === "stitchPalette" &&
              doc.yoke?.version === 1 &&
              doc.yoke.stitchPalette === undefined
            ) && JSON.stringify(actual[key]) !== JSON.stringify(expected[key]),
        )
      )
        ctx.addIssue({
          code: "custom",
          message: "Yoke chart does not match its shaping plan.",
        });
    }
    const ids = new Set(doc.palette.map((entry) => entry.id));
    const validMatrix = (matrix: unknown[][] | undefined) =>
      !matrix ||
      (matrix.length === doc.height &&
        matrix.every((row) => row.length === doc.width));
    if (
      ids.size !== doc.palette.length ||
      !validMatrix(doc.cells) ||
      !doc.cells.every((row) => row.every((id) => ids.has(id))) ||
      !validMatrix(doc.stitchActions) ||
      !validMatrix(doc.stitchCellColors) ||
      (doc.guides &&
        (doc.guides.repeatWidth > doc.width ||
          doc.guides.repeatHeight > doc.height))
    ) {
      ctx.addIssue({ code: "custom", message: "Invalid chart matrix." });
    }
  });
export function readChartDocument(value: unknown): ChartDocument {
  const parsed = chartDocumentSchema.safeParse(value);
  if (!parsed.success) {
    const yokeIssue = parsed.error.issues.find(
      (issue) =>
        issue.code === "custom" &&
        issue.path.length === 1 &&
        issue.path[0] === "yoke",
    );
    throw new HttpError(
      yokeIssue?.message ??
        "The chart contains invalid colours, stitches, or dimensions.",
    );
  }
  // Supply defaults for older files only after validating their contents.
  return cloneDocument(parsed.data as ChartDocument);
}
export const previewSettingsSchema = z
  .object({
    yokeView: z.enum(["whole", "repeat", "chart", "front", "back"]).optional(),
    repeatX: z.number().int().min(1).max(3).default(1),
    repeatY: z.number().int().min(1).max(3).default(1),
    repeatStyle: z.enum(["normal", "mirrored"]).default("normal"),
    renderedRepeatX: z.number().int().min(1).max(3).optional(),
    renderedRepeatY: z.number().int().min(1).max(3).optional(),
    renderedRepeatStyle: z.enum(["normal", "mirrored"]).optional(),
  })
  .transform((v) => ({
    ...v,
    renderedRepeatX: v.renderedRepeatX ?? v.repeatX,
    renderedRepeatY: v.renderedRepeatY ?? v.repeatY,
    renderedRepeatStyle: v.renderedRepeatStyle ?? v.repeatStyle,
  }));
export type PreviewSettings = z.output<typeof previewSettingsSchema>;
export function createPreviewSettings(value: unknown = {}): PreviewSettings {
  return previewSettingsSchema.parse(value);
}
export const knitProgressSchema = z.object({
  row: z.number().int().min(1).max(MAX_CHART_ROWS).default(1),
  stitch: z.number().int().min(0).max(MAX_CHART_STITCHES).default(0),
  section: z.number().int().min(0).max(39).optional(),
  viewSection: z.number().int().min(0).max(319).optional(),
  sectionColumns: z.number().int().min(25).max(200).optional(),
  shortRowNoteSeen: z.boolean().optional(),
  trimBorder: z.boolean().default(false),
  markerStyle: z
    .enum(["none", "flower", "heart", "star", "yarn"])
    .default("flower"),
});
export type KnitProgress = z.output<typeof knitProgressSchema>;
export function clampKnitProgress(
  progress: KnitProgress,
  document: ChartDocument,
): KnitProgress {
  const { section, ...rest } = progress;
  return {
    ...rest,
    row: Math.min(progress.row, document.height),
    stitch: Math.min(
      progress.stitch,
      document.yoke ? MAX_CHART_STITCHES : document.width,
    ),
    ...(document.yoke && section !== undefined
      ? { section: Math.min(section, document.yoke.measurements.repeats - 1) }
      : {}),
  };
}
