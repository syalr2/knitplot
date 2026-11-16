import { z } from "zod";
import type { ChartDocument } from "./chart";

const repeatCount = z.number().int().min(1).max(3);

export const clubCoverSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("chart"),
    across: repeatCount,
    down: repeatCount,
    style: z.enum(["normal", "mirrored"]),
  }),
  z.object({
    kind: z.literal("yoke"),
    view: z.enum(["whole", "front", "back", "repeat", "sweater"]),
    repeat: z.number().int().min(0).max(39),
  }),
]);

export type ClubCoverSettings = z.infer<typeof clubCoverSchema>;

export function readClubCover(
  document: ChartDocument,
  settings?: unknown,
  legacyView?: string,
): ClubCoverSettings {
  const parsed = clubCoverSchema.safeParse(settings);
  if (document.yoke) {
    if (
      parsed.success &&
      parsed.data.kind === "yoke" &&
      parsed.data.repeat < document.yoke.measurements.repeats
    )
      return parsed.data;
    return {
      kind: "yoke",
      view:
        legacyView === "front" || legacyView === "back" ? legacyView : "whole",
      repeat: 0,
    };
  }
  return parsed.success && parsed.data.kind === "chart"
    ? parsed.data
    : {
        kind: "chart",
        across: legacyView === "repeat" ? 2 : 1,
        down: 1,
        style: "normal",
      };
}
