import { z } from "zod";
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
