"use client";

import { useEffect, useMemo } from "react";
import { cellAspectRatio, ChartDocument, InstructionSettings } from "@/lib/chart";

export type KnitProgress = {
  row: number;
  stitch: number;
  trimBorder: boolean;
  markerStyle: MarkerStyle;
};

export type MarkerStyle = "none" | "flower" | "heart" | "star" | "yarn";

export const defaultKnitProgress: KnitProgress = {
  row: 1,
  stitch: 0,
  trimBorder: false,
  markerStyle: "flower",
};

const MARKERS: Array<{ id: MarkerStyle; label: string; symbol: string }> = [
  { id: "none", label: "No marker", symbol: "—" },
  { id: "flower", label: "Flower", symbol: "✿" },
  { id: "heart", label: "Heart", symbol: "♥" },
  { id: "star", label: "Star", symbol: "★" },
  { id: "yarn", label: "Yarn ball", symbol: "◎" },
];

type Props = {
  document: ChartDocument;
  progress: KnitProgress;
  onProgressChange: (progress: KnitProgress) => void;
  onSettingsChange: (settings: InstructionSettings) => void;
  onClose: () => void;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function majorColumnBoundary(column: number, width: number) {
  return column > 0 && column < width && column % 10 === 0;
}

function majorRowBoundary(chartRow: number, height: number) {
  const completedRows = height - chartRow;
  return chartRow > 0 && chartRow < height && completedRows % 10 === 0;
}

function isRightToLeft(document: ChartDocument, row: number) {
  if (document.instructions.technique === "duplicate") return false;
  return document.instructions.construction === "round" || row % 2 === 1;
}

function rowSequence(document: ChartDocument, rowNumber: number) {
  const source = document.cells[document.height - rowNumber] ?? [];
  const ordered = isRightToLeft(document, rowNumber) ? [...source].reverse() : source;
  const labels = new Map(document.palette.map((color, index) => [color.id, index === 0 ? "MC" : `CC${index}`]));
  if (document.instructions.technique === "duplicate") labels.set(document.palette[0].id, "Skip");
  return ordered.reduce<Array<{ colorId: string; label: string; count: number }>>((runs, colorId) => {
    const previous = runs[runs.length - 1];
    if (previous?.colorId === colorId) previous.count += 1;
    else runs.push({ colorId, label: labels.get(colorId) ?? "?", count: 1 });
    return runs;
  }, []);
}

function knitRegion(document: ChartDocument, shouldTrim: boolean) {
  if (!shouldTrim) return { document, trimmed: false };
  const backgroundId = document.palette[0]?.id;
  let minimumRow = document.height;
  let maximumRow = -1;
  let minimumColumn = document.width;
  let maximumColumn = -1;

  document.cells.forEach((chartRow, rowIndex) => chartRow.forEach((colorId, columnIndex) => {
    if (colorId === backgroundId) return;
    minimumRow = Math.min(minimumRow, rowIndex);
    maximumRow = Math.max(maximumRow, rowIndex);
    minimumColumn = Math.min(minimumColumn, columnIndex);
    maximumColumn = Math.max(maximumColumn, columnIndex);
  }));

  if (maximumRow < minimumRow || maximumColumn < minimumColumn) return { document, trimmed: false };
  const width = maximumColumn - minimumColumn + 1;
  const height = maximumRow - minimumRow + 1;
  if (width === document.width && height === document.height) return { document, trimmed: false };
  return {
    document: {
      ...document,
      width,
      height,
      cells: document.cells.slice(minimumRow, maximumRow + 1).map((chartRow) => chartRow.slice(minimumColumn, maximumColumn + 1)),
    },
    trimmed: true,
  };
}

export function KnitMode({ document, progress, onProgressChange, onSettingsChange, onClose }: Props) {
  const region = useMemo(() => knitRegion(document, progress.trimBorder), [document, progress.trimBorder]);
  const activeDocument = region.document;
  const aspect = cellAspectRatio(activeDocument);
  const palette = new Map(activeDocument.palette.map((color) => [color.id, color.hex]));
  const row = clamp(progress.row, 1, activeDocument.height);
  const stitch = clamp(progress.stitch, 0, activeDocument.width);
  const rowIndex = activeDocument.height - row;
  const rightToLeft = isRightToLeft(activeDocument, row);
  const markerColumn = stitch > 0 ? (rightToLeft ? activeDocument.width - stitch : stitch - 1) : -1;
  const markerX = (markerColumn + 0.5) * aspect;
  const marker = MARKERS.find((choice) => choice.id === progress.markerStyle) ?? MARKERS[1];
  const sequence = useMemo(() => rowSequence(activeDocument, row), [activeDocument, row]);
  const isDuplicate = activeDocument.instructions.technique === "duplicate";
  const unitName = isDuplicate ? "Row" : activeDocument.instructions.construction === "round" ? "Round" : "Row";
  const chartWidth = activeDocument.width * aspect;
  const labelSize = Math.max(0.5, Math.min(0.9, activeDocument.height / 35));
  const leftMargin = labelSize * 2.5;
  const topMargin = labelSize * 1.8;
  const columnStep = activeDocument.width <= 24 ? 1 : activeDocument.width <= 50 ? 5 : 10;
  const rowStep = activeDocument.height <= 24 ? 1 : 5;

  function update(nextRow: number, nextStitch: number) {
    onProgressChange({
      ...progress,
      row: clamp(nextRow, 1, activeDocument.height),
      stitch: clamp(nextStitch, 0, activeDocument.width),
    });
  }

  function changeRow(amount: number) {
    update(row + amount, 0);
  }

  function changeStitch(amount: number) {
    const next = stitch + amount;
    if (next > activeDocument.width && row < activeDocument.height) update(row + 1, 0);
    else if (next < 0 && row > 1) update(row - 1, activeDocument.width);
    else update(row, next);
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowRight" || event.key === " ") changeStitch(1);
      else if (event.key === "ArrowLeft") changeStitch(-1);
      else if (event.key === "ArrowUp") changeRow(1);
      else if (event.key === "ArrowDown") changeRow(-1);
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  return (
    <section className="knit-mode" role="dialog" aria-modal="true" aria-label="Knit mode">
      <header className="knit-mode-header">
        <div>
          <p className="eyebrow">Knit mode</p>
          <h1>{document.name || "Untitled chart"}</h1>
        </div>
        <div className="knit-mode-status">
          <strong>{unitName} {row} of {activeDocument.height}</strong>
          <span>{stitch > 0
            ? progress.markerStyle === "none" ? `Stitch ${stitch} of ${activeDocument.width} selected` : `Marker on stitch ${stitch} of ${activeDocument.width}`
            : "Click a stitch to mark your place"}</span>
        </div>
        <button className="secondary-button" onClick={onClose}>Exit knit mode</button>
      </header>

      <div className="knit-mode-body">
        <div className="knit-mode-chart-frame">
          <svg
            className="knit-mode-chart"
            viewBox={`${-leftMargin} ${-topMargin} ${chartWidth + leftMargin} ${activeDocument.height + topMargin}`}
            style={{ aspectRatio: `${chartWidth + leftMargin} / ${activeDocument.height + topMargin}` }}
            role="img"
            aria-label={`Chart with row ${row} highlighted${stitch > 0 && progress.markerStyle !== "none" ? ` and a marker on stitch ${stitch}` : ""}`}
          >
            <g shapeRendering="crispEdges">
              {activeDocument.cells.flatMap((chartRow, chartRowIndex) => chartRow.map((colorId, columnIndex) => (
                <rect
                  key={`${chartRowIndex}-${columnIndex}`}
                  x={columnIndex * aspect}
                  y={chartRowIndex}
                  width={aspect}
                  height="1"
                  fill={palette.get(colorId) ?? "#fff"}
                  onClick={() => {
                    const nextRow = activeDocument.height - chartRowIndex;
                    const selectedStitch = isRightToLeft(activeDocument, nextRow)
                      ? activeDocument.width - columnIndex
                      : columnIndex + 1;
                    update(nextRow, selectedStitch);
                  }}
                />
              )))}
            </g>
            <rect className="knit-mode-row-dimmer top" x="0" y="0" width={activeDocument.width * aspect} height={rowIndex} />
            <rect className="knit-mode-row-dimmer bottom" x="0" y={rowIndex + 1} width={activeDocument.width * aspect} height={activeDocument.height - rowIndex - 1} />
            <rect className="knit-mode-current-row" x="0" y={rowIndex} width={activeDocument.width * aspect} height="1" />
            <g className="knit-mode-grid" shapeRendering="crispEdges" pointerEvents="none">
              {Array.from({ length: activeDocument.width + 1 }, (_, column) => (
                <line
                  key={`column-${column}`}
                  className={majorColumnBoundary(column, activeDocument.width) ? "major" : undefined}
                  x1={column * aspect}
                  x2={column * aspect}
                  y1="0"
                  y2={activeDocument.height}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {Array.from({ length: activeDocument.height + 1 }, (_, chartRow) => (
                <line
                  key={`row-${chartRow}`}
                  className={majorRowBoundary(chartRow, activeDocument.height) ? "major" : undefined}
                  x1="0"
                  x2={activeDocument.width * aspect}
                  y1={chartRow}
                  y2={chartRow}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </g>
            {stitch > 0 && progress.markerStyle !== "none" ? (
              <g className={`knit-mode-stitch-marker ${progress.markerStyle}`} pointerEvents="none">
                <circle cx={markerX} cy={rowIndex + 0.5} r={Math.min(0.43, aspect * 0.35)} vectorEffect="non-scaling-stroke" />
                <text x={markerX} y={rowIndex + 0.72} textAnchor="middle" fontSize={Math.min(0.68, aspect * 0.54)}>{marker.symbol}</text>
              </g>
            ) : null}
            <g className="knit-mode-chart-labels" pointerEvents="none">
              {Array.from({ length: activeDocument.width }, (_, columnIndex) => (
                (columnIndex + 1) % columnStep === 0
                  ? <text key={`column-label-${columnIndex}`} x={(columnIndex + 0.5) * aspect} y={-labelSize * 0.45} textAnchor="middle" fontSize={labelSize}>{columnIndex + 1}</text>
                  : null
              ))}
              {Array.from({ length: activeDocument.height }, (_, chartRowIndex) => {
                const rowNumber = activeDocument.height - chartRowIndex;
                return rowNumber % rowStep === 0
                  ? <text key={`row-label-${chartRowIndex}`} x={-labelSize * 0.5} y={chartRowIndex + 0.7} textAnchor="end" fontSize={labelSize}>{rowNumber}</text>
                  : null;
              })}
            </g>
          </svg>
        </div>

        <aside className="knit-mode-controls">
          <div className="knit-mode-options">
            <div className={`knit-mode-settings-grid ${isDuplicate ? "single" : ""}`}>
              <label>Technique
                <select value={document.instructions.technique} onChange={(event) => onSettingsChange({ ...document.instructions, technique: event.target.value as InstructionSettings["technique"] })}>
                  <option value="stranded">Stranded colourwork</option>
                  <option value="intarsia">Intarsia</option>
                  <option value="duplicate">Duplicate stitch</option>
                </select>
              </label>
              {!isDuplicate ? (
                <label>Construction
                  <select value={document.instructions.construction} onChange={(event) => onSettingsChange({ ...document.instructions, construction: event.target.value as InstructionSettings["construction"] })}>
                    <option value="flat">Worked flat</option>
                    <option value="round">In the round</option>
                  </select>
                </label>
              ) : null}
            </div>
            <label className="knit-trim-option"><input type="checkbox" checked={progress.trimBorder} onChange={(event) => onProgressChange({ ...progress, trimBorder: event.target.checked, row: 1, stitch: 0 })} /> Trim empty border</label>
            <div className="marker-picker" aria-label="Stitch marker style">
              <span>Marker</span>
              {MARKERS.map((choice) => (
                <button
                  key={choice.id}
                  className={progress.markerStyle === choice.id ? "selected" : ""}
                  aria-label={`${choice.label} stitch marker`}
                  title={choice.label}
                  onClick={() => onProgressChange({ ...progress, markerStyle: choice.id })}
                >{choice.symbol}</button>
              ))}
            </div>
            {progress.trimBorder && !region.trimmed ? <small>There is no empty outer border to trim.</small> : null}
          </div>
          <p className="knit-direction">{isDuplicate
            ? "Follow each chart row from left to right, or work the duplicate stitches in any order that feels comfortable."
            : `Work this ${activeDocument.instructions.construction === "round" ? "round" : "row"} ${rightToLeft ? "right to left" : "left to right"}.`} Click any stitch to place your marker there.</p>
          <div className="knit-sequence" aria-label="Current row colour sequence">
            {sequence.map((run, index) => (
              <span key={`${run.colorId}-${index}`}><i style={{ background: palette.get(run.colorId) }} />{run.label} {run.count}</span>
            ))}
          </div>
          <div className="knit-row-controls">
            <button onClick={() => changeRow(-1)} disabled={row === 1}>Previous row</button>
            <button className="primary-button" onClick={() => changeRow(1)} disabled={row === activeDocument.height}>Next row</button>
          </div>
          <div className="knit-step-controls">
            <button onClick={() => changeStitch(-1)} disabled={row === 1 && stitch === 0}>Previous stitch</button>
            <button onClick={() => changeStitch(1)} disabled={row === activeDocument.height && stitch === activeDocument.width}>Next stitch</button>
          </div>
          <button className="knit-reset" onClick={() => update(1, 0)}>Start again from row 1</button>
          <p className="knit-keyboard-hint">Use the left and right arrow keys for stitches, the up and down arrow keys for rows, or press Space for the next stitch. Your place is remembered for this chart.</p>
        </aside>
      </div>
    </section>
  );
}
