import { z } from "zod";
import { MAX_CHART_ROWS, MAX_CHART_STITCHES } from "./chart";
import { HttpError } from "./http";
import { MAX_REFERENCE_BASE64 } from "./ai-upload";

const colorCount = z.number().int().min(2).max(8);
const common = z.object({
  prompt: z.string().trim().min(3).max(800),
  width: z.number().int().min(1).max(MAX_CHART_STITCHES),
  height: z.number().int().min(1).max(MAX_CHART_ROWS),
  colorMode: z.enum(["exact", "range"]).default("exact"),
  colorCount: colorCount.optional(),
  minimumColors: colorCount.optional(),
  maximumColors: colorCount.optional(),
  layoutMode: z.enum(["repeat", "motif"]).default("motif"),
});
function validColors(value: z.output<typeof common>) {
  return value.colorMode === "exact"
    ? value.colorCount !== undefined
    : value.minimumColors !== undefined &&
        value.maximumColors !== undefined &&
        value.minimumColors <= value.maximumColors;
}
export const generateRequestSchema = common
  .extend({
    chartAspect: z.number().positive().max(1000),
    referenceImage: z
      .string()
      .max(MAX_REFERENCE_BASE64)
      .regex(/^[A-Za-z0-9+/]*={0,2}$/)
      .optional(),
    referenceMimeType: z
      .enum(["image/png", "image/jpeg", "image/webp"])
      .default("image/png"),
    referenceUse: z.enum(["style", "subject"]).default("subject"),
  })
  .refine(validColors);
export const editRequestSchema = common
  .extend({
    palette: z.unknown(),
    rows: z.unknown(),
  })
  .refine(validColors);
export function readAiRequest<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new HttpError(
      "The AI request settings or reference image were not valid.",
    );
  return parsed.data;
}
