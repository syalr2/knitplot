import {
  readChartDocument,
  knitProgressSchema,
  clampKnitProgress,
  previewSettingsSchema,
} from "./chart-schema";
import { HttpError, isRecord, readJsonObject } from "./http";

export const readCloudChartRequest = (request: Request) =>
  readJsonObject(request, {
    bytes: 4_000_000,
    message: "The chart data was too large.",
  });

export function readCloudChartPayload(value: unknown) {
  if (!isRecord(value)) throw new HttpError("The chart data was not valid.");
  const progress = knitProgressSchema.safeParse(value.knitProgress ?? {});
  const preview = previewSettingsSchema.safeParse(value.preview ?? {});
  if (!progress.success || !preview.success)
    throw new HttpError("The chart settings were not valid.");
  const document = readChartDocument(value.document);
  return {
    document,
    knitProgress: clampKnitProgress(progress.data, document),
    preview: preview.data,
  };
}
