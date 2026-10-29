import {
  readChartDocument,
  knitProgressSchema,
  previewSettingsSchema,
} from "./chart-schema";
import { HttpError, isRecord } from "./http";

export function readCloudChartPayload(value: unknown) {
  if (!isRecord(value)) throw new HttpError("The chart data was not valid.");
  if (JSON.stringify(value).length > 2_000_000)
    throw new HttpError("The chart data was too large.", 413);
  const progress = knitProgressSchema.safeParse(value.knitProgress ?? {});
  const preview = previewSettingsSchema.safeParse(value.preview ?? {});
  if (!progress.success || !preview.success)
    throw new HttpError("The chart settings were not valid.");
  const document = readChartDocument(value.document);
  return {
    document,
    knitProgress: {
      ...progress.data,
      row: Math.min(progress.data.row, document.height),
      stitch: Math.min(progress.data.stitch, document.width),
    },
    preview: preview.data,
  };
}
