"use client";

import { PointerEvent, useMemo, useRef } from "react";
import type { ChartPoint } from "@/lib/yoke-move-increase";
import {
  cellAspectRatio,
  CellSelection,
  ChartDocument,
  contrastTextColor,
  stitchActionAt,
  stitchActionLabel,
  stitchActionSymbol,
  chartCellDisplayColor,
  StitchAction,
  Tool,
} from "@/lib/chart";
import {
  elementSelectionOutline,
  isSelectedCell,
  selectChartElement,
} from "@/lib/chart-element-selection";

type Props = {
  document: ChartDocument;
  tool?: Tool;
  structureAction?: StitchAction | null;
  selectedColor?: string;
  zoom: number;
  selection?: CellSelection | null;
  selectionMode?: "area" | "element";
  extraElementBackgroundColours?: readonly string[];
  onElementBackgroundPick?: (hex: string) => void;
  onYarnPick?: (id: string) => void;
  onSelectionChange?: (selection: CellSelection | null) => void;
  onSelectionMove?: (rows: number, columns: number) => void;
  onStrokeStart?: () => void;
  onPaint?: (row: number, column: number, flood: boolean) => void;
  yarnOnly?: boolean;
  onStrokeEnd?: () => void;
  onCellPick?: (point: ChartPoint) => void;
  onCellPoint?: (point: ChartPoint | null) => void;
  moveTarget?: ChartPoint;
};

export function ChartGrid({
  document,
  tool = "pencil",
  structureAction,
  zoom,
  selection,
  selectionMode = "area",
  extraElementBackgroundColours,
  onElementBackgroundPick,
  onYarnPick,
  onSelectionChange,
  onSelectionMove,
  onStrokeStart,
  onPaint,
  yarnOnly = false,
  onStrokeEnd,
  onCellPick,
  onCellPoint,
  moveTarget,
}: Props) {
  const readOnly = !onPaint && !onCellPick;
  const svgRef = useRef<SVGSVGElement>(null);
  const drawing = useRef(false);
  const strokeActive = useRef(false);
  const selecting = useRef(false);
  const selectionStart = useRef<{ row: number; column: number } | null>(null);
  const selectionDrag = useRef<(ChartPoint & { pointerId: number }) | null>(
    null,
  );
  const selectionOverlay = useRef<SVGGElement>(null);
  const previousCell = useRef("");
  const aspect = cellAspectRatio(document);
  const selectionOutline = useMemo(
    () => selection && elementSelectionOutline(selection, aspect),
    [selection, aspect],
  );
  const palette = new Map(
    document.palette.map((color) => [color.id, color.hex]),
  );
  const columnStep = document.width > 40 ? 10 : 5;
  const showEveryRow = document.height <= 24;

  function cellFromPointer(event: PointerEvent<SVGSVGElement>, limit = false) {
    const svg = svgRef.current;
    if (!svg) return null;
    const screenMatrix = svg.getScreenCTM();
    if (!screenMatrix) return null;
    const pointer = svg.createSVGPoint();
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    const local = pointer.matrixTransform(screenMatrix.inverse());
    const column = Math.floor(local.x / aspect);
    const row = Math.floor(local.y);
    if (limit)
      return {
        row: Math.max(0, Math.min(row, document.height - 1)),
        column: Math.max(0, Math.min(column, document.width - 1)),
      };
    if (
      row < 0 ||
      row >= document.height ||
      column < 0 ||
      column >= document.width
    )
      return null;
    return { row, column };
  }

  function handlePointerDown(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    const cell = cellFromPointer(event);
    if (!cell) return;
    if (onSelectionMove) event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    if (onCellPick) {
      onCellPick(cell);
      return;
    }
    if (onYarnPick) {
      if (stitchActionAt(document, cell.row, cell.column) !== "no-stitch")
        onYarnPick(document.cells[cell.row][cell.column]);
      return;
    }
    if (tool === "select") {
      if (onElementBackgroundPick) {
        const yarn = palette.get(document.cells[cell.row][cell.column]);
        onElementBackgroundPick(
          chartCellDisplayColor(
            document,
            cell.row,
            cell.column,
            yarn,
          ).toLowerCase(),
        );
        return;
      }
      if (
        onSelectionMove &&
        selection &&
        isSelectedCell(selection, cell.row, cell.column)
      ) {
        selectionDrag.current = { ...cell, pointerId: event.pointerId };
        return;
      }
      if (selectionMode === "element") {
        onSelectionChange?.(
          selectChartElement(
            document,
            cell.row,
            cell.column,
            extraElementBackgroundColours,
          ),
        );
        return;
      }
      selecting.current = true;
      drawing.current = false;
      selectionStart.current = cell;
      onSelectionChange?.({
        startRow: cell.row,
        startColumn: cell.column,
        endRow: cell.row,
        endColumn: cell.column,
      });
      return;
    }
    onStrokeStart?.();
    strokeActive.current = true;
    drawing.current = tool !== "fill";
    previousCell.current = `${cell.row}:${cell.column}`;
    onPaint?.(cell.row, cell.column, tool === "fill");
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    if (onCellPick) {
      if (event.pointerType !== "touch") onCellPoint?.(cellFromPointer(event));
      return;
    }
    if (selectionDrag.current) {
      const offset = dragOffset(event);
      if (offset) {
        event.preventDefault();
        selectionOverlay.current?.setAttribute(
          "transform",
          `translate(${offset.columns * aspect},${offset.rows})`,
        );
      }
      return;
    }
    if (drawing.current || selecting.current) event.preventDefault();
    if (selecting.current && selectionStart.current) {
      const cell = cellFromPointer(event);
      if (!cell) return;
      onSelectionChange?.({
        startRow: selectionStart.current.row,
        startColumn: selectionStart.current.column,
        endRow: cell.row,
        endColumn: cell.column,
      });
      return;
    }
    if (!drawing.current) return;
    const cell = cellFromPointer(event);
    if (!cell) return;
    const key = `${cell.row}:${cell.column}`;
    if (key === previousCell.current) return;
    previousCell.current = key;
    onPaint?.(cell.row, cell.column, false);
  }

  function dragOffset(event: PointerEvent<SVGSVGElement>) {
    const origin = selectionDrag.current;
    if (!origin || origin.pointerId !== event.pointerId || !selectionBounds)
      return null;
    const pointer = cellFromPointer(event, true);
    if (!pointer) return null;
    const { row, column, rows, columns } = selectionBounds;
    return {
      rows: Math.max(
        -row,
        Math.min(pointer.row - origin.row, document.height - row - rows),
      ),
      columns: Math.max(
        -column,
        Math.min(
          pointer.column - origin.column,
          document.width - column - columns,
        ),
      ),
    };
  }

  function endPointerAction(event: PointerEvent<SVGSVGElement>) {
    if (selectionDrag.current) {
      if (selectionDrag.current.pointerId !== event.pointerId) return;
      const offset = event.type === "pointerup" ? dragOffset(event) : null;
      selectionDrag.current = null;
      selectionOverlay.current?.removeAttribute("transform");
      if (offset && (offset.rows || offset.columns))
        onSelectionMove?.(offset.rows, offset.columns);
      return;
    }
    const finish = strokeActive.current;
    strokeActive.current = false;
    drawing.current = false;
    selecting.current = false;
    selectionStart.current = null;
    if (finish) onStrokeEnd?.();
  }

  const selectionBounds = selection
    ? {
        row: Math.min(selection.startRow, selection.endRow),
        column: Math.min(selection.startColumn, selection.endColumn),
        rows: Math.abs(selection.endRow - selection.startRow) + 1,
        columns: Math.abs(selection.endColumn - selection.startColumn) + 1,
      }
    : null;

  return (
    <div
      className={`chart-frame${readOnly ? " chart-frame-readonly" : ""}`}
      data-tour={readOnly ? undefined : "chart-canvas"}
    >
      <div
        className="chart-content"
        style={{
          width: readOnly
            ? `min(${zoom}%, calc(29px + var(--readonly-chart-fit-height, 500px) * ${(document.width * aspect * zoom) / (document.height * 100)}))`
            : `${zoom}%`,
        }}
      >
        <div
          className="chart-column-numbers"
          aria-hidden="true"
          style={{ gridTemplateColumns: `repeat(${document.width}, 1fr)` }}
        >
          {Array.from({ length: document.width }, (_, index) => (
            <span key={index}>
              {(index + 1) % columnStep === 0 ? index + 1 : ""}
            </span>
          ))}
        </div>
        <div className="chart-body">
          <div
            className="chart-row-numbers"
            aria-hidden="true"
            style={{
              gridTemplateRows: `repeat(${document.height}, minmax(0, 1fr))`,
            }}
          >
            {Array.from({ length: document.height }, (_, index) => (
              <span key={index}>
                {showEveryRow || (document.height - index) % 5 === 0
                  ? document.height - index
                  : ""}
              </span>
            ))}
          </div>
          <svg
            ref={svgRef}
            className={onCellPick ? "chart-svg chart-svg-move" : "chart-svg"}
            viewBox={`0 0 ${document.width * aspect} ${document.height}`}
            style={{
              aspectRatio: `${document.width * aspect} / ${document.height}`,
            }}
            role="img"
            tabIndex={onSelectionMove ? -1 : undefined}
            aria-label={`${document.width} stitch by ${document.height} row colorwork chart`}
            onPointerDown={readOnly ? undefined : handlePointerDown}
            onPointerMove={readOnly ? undefined : handlePointerMove}
            onPointerUp={readOnly ? undefined : endPointerAction}
            onPointerCancel={readOnly ? undefined : endPointerAction}
            onLostPointerCapture={readOnly ? undefined : endPointerAction}
          >
            <g shapeRendering="crispEdges">
              {document.cells.flatMap((row, rowIndex) =>
                row.map((colorId, columnIndex) => {
                  const action = stitchActionAt(
                    document,
                    rowIndex,
                    columnIndex,
                  );
                  return (
                    <rect
                      key={`${rowIndex}-${columnIndex}`}
                      className={
                        action === "no-stitch" ? "chart-no-stitch" : undefined
                      }
                      x={columnIndex * aspect}
                      y={rowIndex}
                      width={aspect}
                      height="1"
                      fill={chartCellDisplayColor(
                        document,
                        rowIndex,
                        columnIndex,
                        palette.get(colorId),
                      )}
                    />
                  );
                }),
              )}
            </g>
            <g className="chart-action-symbols" pointerEvents="none">
              {document.cells.flatMap((row, rowIndex) =>
                row.map((_, columnIndex) => {
                  const action = stitchActionAt(
                    document,
                    rowIndex,
                    columnIndex,
                  );
                  if (action === "knit") return null;
                  const background = chartCellDisplayColor(
                    document,
                    rowIndex,
                    columnIndex,
                    palette.get(document.cells[rowIndex][columnIndex]),
                  );
                  return (
                    <text
                      key={`${rowIndex}-${columnIndex}`}
                      style={{ fill: contrastTextColor(background) }}
                      x={(columnIndex + 0.5) * aspect}
                      y={rowIndex + 0.69}
                      textAnchor="middle"
                      fontSize={Math.min(0.45, aspect * 0.35)}
                    >
                      {stitchActionSymbol(action)}
                    </text>
                  );
                }),
              )}
            </g>
            <g
              className="grid-lines"
              shapeRendering="crispEdges"
              pointerEvents="none"
            >
              {Array.from({ length: document.width + 1 }, (_, column) => (
                <line
                  key={`column-${column}`}
                  x1={column * aspect}
                  x2={column * aspect}
                  y1="0"
                  y2={document.height}
                  className={
                    column % 5 === 0 ? "grid-line grid-line-major" : "grid-line"
                  }
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {Array.from({ length: document.height + 1 }, (_, row) => (
                <line
                  key={`row-${row}`}
                  x1="0"
                  x2={document.width * aspect}
                  y1={row}
                  y2={row}
                  className={
                    row % 5 === 0 ? "grid-line grid-line-major" : "grid-line"
                  }
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </g>
            {!readOnly && document.guides.symmetry !== "none" ? (
              <g className="symmetry-guide-lines" pointerEvents="none">
                {document.guides.symmetry === "horizontal" ||
                document.guides.symmetry === "both" ? (
                  <line
                    x1={(document.width * aspect) / 2}
                    x2={(document.width * aspect) / 2}
                    y1="0"
                    y2={document.height}
                    vectorEffect="non-scaling-stroke"
                  />
                ) : null}
                {document.guides.symmetry === "vertical" ||
                document.guides.symmetry === "both" ? (
                  <line
                    x1="0"
                    x2={document.width * aspect}
                    y1={document.height / 2}
                    y2={document.height / 2}
                    vectorEffect="non-scaling-stroke"
                  />
                ) : null}
              </g>
            ) : null}
            {selectionBounds ? (
              <g ref={selectionOverlay} pointerEvents="none">
                {selectionOutline ? (
                  <path
                    className="chart-selection chart-element-selection"
                    d={selectionOutline}
                    vectorEffect="non-scaling-stroke"
                  />
                ) : (
                  <rect
                    className="chart-selection"
                    x={selectionBounds.column * aspect}
                    y={selectionBounds.row}
                    width={selectionBounds.columns * aspect}
                    height={selectionBounds.rows}
                    vectorEffect="non-scaling-stroke"
                  />
                )}
              </g>
            ) : null}
            {moveTarget ? (
              <rect
                className="chart-increase-target"
                x={moveTarget.column * aspect}
                y={moveTarget.row}
                width={aspect}
                height={1}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            ) : null}
          </svg>
        </div>
        {!readOnly && !onCellPick ? (
          <p className="chart-hint">
            {tool === "select" && selectionMode === "element"
              ? onElementBackgroundPick
                ? "Click a background shade to leave it out of element selections."
                : "Click a motif to select its connected stitches. Background stays unselected."
              : structureAction === "knit"
                ? "Click and drag to remove stitch symbols, keeping yarn colours. With Fill, click a connected group of symbols to remove them."
                : structureAction
                  ? tool === "fill"
                    ? `Click an area to fill it with ${stitchActionLabel(structureAction)}.`
                    : `Click and drag to mark cells as ${stitchActionLabel(structureAction)}${document.guides.symmetry !== "none" ? " with live symmetry" : ""}.`
                  : tool === "fill"
                    ? "Click an area to fill its yarn colour. Stitch symbols stay in place."
                    : tool === "select"
                      ? yarnOnly
                        ? "Drag a rectangle to fill, copy, cut, paste or move yarn colours."
                        : "Drag a rectangle to fill, copy, cut, paste, move, or apply a stitch action."
                      : `Click and drag to ${tool === "eraser" ? "erase the yarn colour" : "paint"}${document.guides.symmetry !== "none" ? " with live symmetry" : ""}.`}
            {document.stitchActions && !structureAction && !yarnOnly
              ? " Use Remove stitch to erase symbols without changing yarn colours."
              : ""}
          </p>
        ) : null}
      </div>
    </div>
  );
}
