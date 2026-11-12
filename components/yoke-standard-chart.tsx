"use client";
import { useMemo } from "react";
import { ChartGrid } from "./chart-grid";
import type { YokeProject } from "@/lib/yoke-project";
import type { CellSelection, Tool } from "@/lib/chart";
import { yokeDrawing } from "@/lib/yoke-editing";

export function YokeStandardChart({
  project,
  zoom,
  selectedColor,
  onPaint,
  onStrokeStart,
  drawing: suppliedDrawing,
  tool = "pencil",
  selection = null,
  onSelectionChange = () => {},
  onStrokeEnd,
  onChartPaint,
}: {
  project: YokeProject;
  zoom: number;
  selectedColor: number;
  onPaint: (row: number, column: number) => void;
  onStrokeStart: () => void;
  drawing?: ReturnType<typeof yokeDrawing>;
  tool?: Tool;
  selection?: CellSelection | null;
  onSelectionChange?: (value: CellSelection | null) => void;
  onStrokeEnd?: () => void;
  onChartPaint?: (row: number, column: number) => void;
}) {
  const fallback = useMemo(
    () => suppliedDrawing ?? yokeDrawing(project, 0),
    [project, suppliedDrawing],
  );
  const drawing = suppliedDrawing ?? fallback;
  return (
    <div className="yoke-standard-chart">
      <ChartGrid
        yarnOnly
        document={drawing.document}
        tool={tool}
        structureAction={null}
        selectedColor={`yarn-${selectedColor}`}
        zoom={zoom}
        selection={selection}
        onSelectionChange={onSelectionChange}
        onStrokeStart={onStrokeStart}
        onStrokeEnd={onStrokeEnd}
        onPaint={(chartRow, chartColumn) => {
          if (onChartPaint) {
            onChartPaint(chartRow, chartColumn);
            return;
          }
          const cell = drawing.yokeCell(chartRow, chartColumn);
          if (cell) onPaint(cell.row, cell.column);
        }}
      />
    </div>
  );
}
