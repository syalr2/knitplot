import { z } from "zod";
import { readChartDocument } from "./chart-schema";
import { chartSummaryFromRow } from "./chart-summary";
import { HttpError } from "./http";
import { stringifyKnitplot } from "./yoke-program-wire";
import { cellAspectRatio } from "./chart";
import { clubCoverSchema, readClubCover } from "./club-cover";
import {
  fitsSweaterPhoto,
  SWEATER_PREVIEW_TOO_DEEP,
} from "./yoke-photo-preview";

const postDetails = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1200).default(""),
});
export const clubPostUpdateSchema = postDetails
  .extend({ id: z.uuid() })
  .strict();

const shareSchema = postDetails.extend({
  sourceId: z.uuid(),
  sourceVersion: z.number().int().positive().max(2147483647),
  confirmRights: z.literal(true),
  shareYokeMeasurements: z.boolean().default(false),
  cover: clubCoverSchema.optional(),
});

export function readClubShare(value: unknown) {
  const parsed = shareSchema.safeParse(value);
  if (!parsed.success)
    throw new HttpError(
      "Check the title and cover options, and confirm you have permission to share.",
    );
  return parsed.data;
}

export function clubSnapshot(
  privateDocument: unknown,
  options: ReturnType<typeof readClubShare>,
) {
  const document = readChartDocument(privateDocument);
  if (document.yoke && !options.shareYokeMeasurements)
    throw new HttpError(
      "An editable yoke copy includes its planning measurements. Confirm sharing them before posting.",
    );
  const { kind, width, height, palette, preview } = chartSummaryFromRow({
    document,
  });
  const cover = readClubCover(document, options.cover);
  if (
    options.cover &&
    (options.cover.kind !== cover.kind ||
      (options.cover.kind === "yoke" &&
        document.yoke &&
        options.cover.repeat >= document.yoke.measurements.repeats))
  )
    throw new HttpError("Choose a knitted cover view for this chart type.");
  if (
    cover.kind === "yoke" &&
    cover.view === "sweater" &&
    !fitsSweaterPhoto(document)
  )
    throw new HttpError(SWEATER_PREVIEW_TOO_DEEP);
  return {
    summary: {
      kind,
      width,
      height,
      palette,
      preview,
      cover,
      coverRatio: document.yoke
        ? 1
        : (width * cellAspectRatio(document)) / height,
    },
    editableDocument: stringifyKnitplot({ ...document, name: options.title }),
  };
}
