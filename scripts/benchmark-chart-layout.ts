import {
  createCells,
  createStitchActions,
  defaultDocument,
  MAX_CHART_ROWS,
  MAX_CHART_STITCHES,
} from "../lib/chart";
import { connectedFabric } from "../lib/connected-preview";

const width = MAX_CHART_STITCHES;
const height = MAX_CHART_ROWS;
const document = {
  ...defaultDocument,
  width,
  height,
  cells: createCells(width, height, defaultDocument.palette[0].id),
};
const tests = [
  ["Knit", document],
  [
    "Purl",
    { ...document, stitchActions: createStitchActions(width, height, "purl") },
  ],
] as const;
for (const [label, input] of tests) {
  const start = performance.now();
  const fabric = connectedFabric(input, 3);
  const elapsed = Math.round(performance.now() - start);
  console.log(
    `${label}: ${elapsed}ms, ${fabric.loops.length} loops, solver pass budget ${fabric.relaxationBudget}`,
  );
}
