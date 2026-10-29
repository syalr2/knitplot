import { z } from "zod";
import { HttpError } from "./http";

const revisionSchema = z.int().positive().max(2_147_483_647);

/** Timestamp tokens remain accepted only for clients/workspaces predating revisions. */
export function readCloudRevision(value: unknown): number | string | undefined {
  const revision = revisionSchema.safeParse(value);
  if (revision.success) return revision.data;
  if (typeof value !== "string" || value.length > 40) return undefined;
  const timestamp = value.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  return z.iso.datetime({ offset: true }).safeParse(timestamp).success
    ? timestamp
    : undefined;
}

/** Browser storage treats revisions as opaque tokens, not timestamps or dates. */
export function cloudVersionToken(response: { version?: unknown }): string {
  const revision = revisionSchema.safeParse(response.version);
  if (!revision.success)
    throw new HttpError(
      "KnitPlot received an invalid chart revision. Please reload and retry.",
      502,
    );
  return String(revision.data);
}
