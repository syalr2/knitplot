import { z } from "zod";
import {
  cloneDocument,
  MAX_CHART_ROWS,
  MAX_CHART_STITCHES,
  type ChartDocument,
} from "./chart";
import { HttpError } from "./http";

export const stitchPaletteActionSchema = z.enum([
  "purl",
  "no-stitch",
  "cast-on",
  "m1l",
  "m1r",
  "kfb",
  "inc",
  "ssk",
  "k2tog",
  "cdd",
  "dec",
  "bind-off",
]);
export const stitchActionSchema = z.union([
  z.literal("knit"),
  stitchPaletteActionSchema,
]);
const hex = z.string().regex(/^#[0-9a-f]{6}$/i);
const measurement = z.number().positive().max(100);
const dimension = (max: number) => z.number().int().min(1).max(max);
export const chartDocumentSchema = z
  .object({
    name: z.string().max(200),
    width: dimension(MAX_CHART_STITCHES),
    height: dimension(MAX_CHART_ROWS),
    gaugeStitches: measurement,
    gaugeRows: measurement,
    gaugeMeasure: measurement,
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
  if (!parsed.success)
    throw new HttpError(
      "The chart contains invalid colours, stitches, or dimensions.",
    );
  // Supply defaults for older files only after validating their contents.
  return cloneDocument(parsed.data as ChartDocument);
}
export const previewSettingsSchema = z
  .object({
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
  trimBorder: z.boolean().default(false),
  markerStyle: z
    .enum(["none", "flower", "heart", "star", "yarn"])
    .default("flower"),
});
export type KnitProgress = z.output<typeof knitProgressSchema>;
