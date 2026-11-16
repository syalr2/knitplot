import { rowStitchSteps, type ChartDocument } from "./chart";

export function knitRightToLeft(document: ChartDocument, row: number) {
  return (
    document.instructions.technique !== "duplicate" &&
    (document.instructions.construction === "round" || row % 2 === 1)
  );
}

export function knitColumnSections(width: number, columns: number) {
  const count = Math.ceil(
    width / Math.max(25, Math.min(200, Math.round(columns))),
  );
  const size = Math.floor(width / count);
  const remainder = width % count;
  return Array.from({ length: count }, (_, page) => {
    const start = page * size + Math.min(page, remainder);
    return { start, end: start + size + Number(page < remainder) };
  });
}

export function knitChartPages(document: ChartDocument, columns: number) {
  const ranges = knitColumnSections(document.width, columns);
  if (ranges.length === 1) return null;
  const rows = document.cells.map((_, index) => {
    const row = index + 1;
    const steps = rowStitchSteps(document, row);
    if (knitRightToLeft(document, row)) steps.reverse();
    return steps.map((step, i) => ({
      ...step,
      sourceSection: 0,
      sourceStep: i + 1,
    }));
  });
  return ranges.map(({ start, end }) => ({
    start,
    end,
    document: {
      ...document,
      width: end - start,
      cells: document.cells.map((row) => row.slice(start, end)),
      stitchActions: document.stitchActions?.map((row) =>
        row.slice(start, end),
      ),
      stitchCellColors: document.stitchCellColors?.map((row) =>
        row.slice(start, end),
      ),
    },
    rows: rows.map((steps) => {
      const visible = steps
        .filter((step) => step.column >= start && step.column < end)
        .map((step) => ({ ...step, column: step.column - start }));
      return {
        steps: visible,
        atColumn: new Map(visible.map((step, i) => [step.column, i + 1])),
      };
    }),
  }));
}
