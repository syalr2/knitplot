import { z } from "zod";
import { stitchActionSchema } from "./stitch-schema";
import { resolvedYokeProgram } from "./yoke-program-state";
import { decodeYokeProgram } from "./yoke-program-wire";
const programSchema = z
  .object({
    revision: z.number().int().min(0).max(999_999),
    mirrored: z.literal(true).optional(),
    mirroredSections: z
      .array(z.number().int().min(0).max(39))
      .max(40)
      .optional(),
    startingCounts: z.array(z.number().int().min(1).max(200)).min(2).max(40),
    rounds: z
      .array(
        z
          .array(
            z
              .array(
                z.object({
                  id: z.string().min(1).max(100),
                  action: stitchActionSchema,
                  color: z.number().int().min(0).max(7),
                  displayColor: z
                    .union([
                      z.literal("yarn"),
                      z.string().regex(/^#[0-9a-f]{6}$/i),
                    ])
                    .optional(),
                }),
              )
              .max(200),
          )
          .min(2)
          .max(40),
      )
      .min(1)
      .max(150),
  })
  .superRefine((program, ctx) => {
    try {
      const sections = program.mirroredSections;
      if (
        sections &&
        (program.mirrored ||
          new Set(sections).size !== sections.length ||
          sections.some((section) => section >= program.startingCounts.length))
      )
        throw new Error("Invalid mirrored repeat positions.");
      resolvedYokeProgram(program);
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        message:
          error instanceof Error ? error.message : "Invalid yoke instructions.",
      });
    }
  });
export const yokeStitchProgramSchema = z.preprocess(
  decodeYokeProgram,
  programSchema,
);
