"use client";

import { PointerEvent, useRef } from "react";
import { cellAspectRatio, CellSelection, ChartDocument, Tool } from "@/lib/chart";

type Props = {
  document: ChartDocument;
  tool: Tool;
  selectedColor: string;
  zoom: number;
  selection: CellSelection | null;
  onSelectionChange: (selection: CellSelection | null) => void;
  onStrokeStart: () => void;
  onPaint: (row: number, column: number, flood: boolean) => void;
};

export function ChartGrid({ document, tool, selectedColor, zoom, selection, onSelectionChange, onStrokeStart, onPaint }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drawing = useRef(false);
  const selecting = useRef(false);
  const selectionStart = useRef<{ row: number; column: number } | null>(null);
  const previousCell = useRef("");
  const aspect = cellAspectRatio(document);
  const palette = new Map(document.palette.map((color) => [color.id, color.hex]));
  const columnStep = document.width > 40 ? 10 : 5;
  const showEveryRow = document.height <= 24;

  function cellFromPointer(event: PointerEvent<SVGSVGElement>) {
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
    if (row < 0 || row >= document.height || column < 0 || column >= document.width) return null;
    return { row, column };
  }

  function handlePointerDown(event: PointerEvent<SVGSVGElement>) {
    const cell = cellFromPointer(event);
    if (!cell) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (tool === "select") {
      selecting.current = true;
      drawing.current = false;
      selectionStart.current = cell;
      onSelectionChange({ startRow: cell.row, startColumn: cell.column, endRow: cell.row, endColumn: cell.column });
      return;
    }
    onStrokeStart();
    drawing.current = tool !== "fill";
    previousCell.current = `${cell.row}:${cell.column}`;
    onPaint(cell.row, cell.column, tool === "fill");
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    if (selecting.current && selectionStart.current) {
      const cell = cellFromPointer(event);
      if (!cell) return;
      onSelectionChange({
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
    onPaint(cell.row, cell.column, false);
  }

  function endPointerAction() {
    drawing.current = false;
    selecting.current = false;
    selectionStart.current = null;
  }

  const selectionBounds = selection ? {
    row: Math.min(selection.startRow, selection.endRow),
    column: Math.min(selection.startColumn, selection.endColumn),
    rows: Math.abs(selection.endRow - selection.startRow) + 1,
    columns: Math.abs(selection.endColumn - selection.startColumn) + 1,
  } : null;

  return (
    <div className="chart-frame" data-tour="chart-canvas">
      <div className="chart-content" style={{ width: `${zoom}%` }}>
        <div
          className="chart-column-numbers"
          aria-hidden="true"
          style={{ gridTemplateColumns: `repeat(${document.width}, 1fr)` }}
        >
          {Array.from({ length: document.width }, (_, index) => (
            <span key={index}>{(index + 1) % columnStep === 0 ? index + 1 : ""}</span>
          ))}
        </div>
        <div className="chart-body">
          <div
            className="chart-row-numbers"
            aria-hidden="true"
            style={{ gridTemplateRows: `repeat(${document.height}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: document.height }, (_, index) => (
              <span key={index}>
                {showEveryRow || (document.height - index) % 5 === 0 ? document.height - index : ""}
              </span>
            ))}
          </div>
          <svg
            ref={svgRef}
            className="chart-svg"
            viewBox={`0 0 ${document.width * aspect} ${document.height}`}
            style={{ aspectRatio: `${document.width * aspect} / ${document.height}` }}
            role="img"
            aria-label={`${document.width} stitch by ${document.height} row colorwork chart`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endPointerAction}
            onPointerCancel={endPointerAction}
          >
            <g shapeRendering="crispEdges">
              {document.cells.flatMap((row, rowIndex) =>
                row.map((colorId, columnIndex) => (
                  <rect
                    key={`${rowIndex}-${columnIndex}`}
                    x={columnIndex * aspect}
                    y={rowIndex}
                    width={aspect}
                    height="1"
                    fill={palette.get(colorId) ?? "#ffffff"}
                  />
                )),
              )}
            </g>
            <g className="grid-lines" shapeRendering="crispEdges" pointerEvents="none">
              {Array.from({ length: document.width + 1 }, (_, column) => (
                <line
                  key={`column-${column}`}
                  x1={column * aspect}
                  x2={column * aspect}
                  y1="0"
                  y2={document.height}
                  className={column % 5 === 0 ? "grid-line grid-line-major" : "grid-line"}
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
                  className={row % 5 === 0 ? "grid-line grid-line-major" : "grid-line"}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </g>
            {document.guides.symmetry !== "none" ? (
              <g className="symmetry-guide-lines" pointerEvents="none">
                {(document.guides.symmetry === "horizontal" || document.guides.symmetry === "both") ? <line x1={(document.width * aspect) / 2} x2={(document.width * aspect) / 2} y1="0" y2={document.height} vectorEffect="non-scaling-stroke" /> : null}
                {(document.guides.symmetry === "vertical" || document.guides.symmetry === "both") ? <line x1="0" x2={document.width * aspect} y1={document.height / 2} y2={document.height / 2} vectorEffect="non-scaling-stroke" /> : null}
              </g>
            ) : null}
            {selectionBounds ? (
              <rect
                className="chart-selection"
                x={selectionBounds.column * aspect}
                y={selectionBounds.row}
                width={selectionBounds.columns * aspect}
                height={selectionBounds.rows}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            ) : null}
          </svg>
        </div>
        <p className="chart-hint">
          {tool === "fill" ? "Click an area to fill it." : tool === "select" ? "Drag a rectangle to fill, copy, cut, paste, or move it." : `Click and drag to ${tool === "eraser" ? "erase" : "paint"}${document.guides.symmetry !== "none" ? " with live symmetry" : ""}.`}
        </p>
      </div>
    </div>
  );
}
