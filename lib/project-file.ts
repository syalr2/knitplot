import { readChartDocument } from "./chart-schema";
import { HttpError, isRecord } from "./http";
import { yokeProjectSchema } from "./yoke-project";
import { yokeDocument } from "./yoke-document";

export function readProject(value: unknown) {
  if (isRecord(value) && value.format === "knitplot-yoke")
    return readChartDocument(yokeDocument(yokeProjectSchema.parse(value)));
  if (
    !isRecord(value) ||
    value.format !== "colorwork-chart" ||
    ![1, 2].includes(Number(value.version))
  ) {
    throw new HttpError("This is not a KnitPlot file.");
  }
  return readChartDocument(value.document);
}
