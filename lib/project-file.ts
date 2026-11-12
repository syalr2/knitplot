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
  const document = readChartDocument(value.document);
  if (
    document.yoke ||
    document.palette.every(({ id }) => /^[a-z0-9_-]{1,20}$/i.test(id))
  )
    return document;

  // IDs are internal and repeated in every cell. Compact the whole palette
  // together so large imported charts fit within the cloud request budget.
  const ids = new Map(
    document.palette.map(({ id }, index) => [id, `yarn-${index}`]),
  );
  return {
    ...document,
    palette: document.palette.map((colour) => ({
      ...colour,
      id: ids.get(colour.id)!,
    })),
    cells: document.cells.map((row) => row.map((id) => ids.get(id)!)),
  };
}
