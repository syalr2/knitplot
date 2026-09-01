"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  cellAspectRatio,
  ChartDocument,
  contrastTextColor,
  hasStructuralStitches,
  InstructionSettings,
  rowStitchMath,
  rowStitchSteps,
  stitchActionAt,
  stitchActionLabel,
  stitchActionMath,
  stitchActionSymbol,
  stitchDisplayColor,
} from "@/lib/chart";

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
  const source = rowStitchSteps(document, rowNumber);
  const ordered = isRightToLeft(document, rowNumber) ? [...source].reverse() : source;
  const labels = new Map(document.palette.map((color, index) => [color.id, index === 0 ? "MC" : `CC${index}`]));
  if (document.instructions.technique === "duplicate") labels.set(document.palette[0].id, "Skip");
  return ordered.reduce<Array<{ key: string; colorId: string; label: string; count: number; showCount: boolean }>>((runs, step) => {
    if (step.action !== "knit") {
      const isEdgeAction = step.action === "cast-on" || step.action === "bind-off";
      const previous = runs[runs.length - 1];
      if (isEdgeAction && previous?.key === step.action) previous.count += 1;
      else runs.push({
        key: isEdgeAction ? step.action : `${step.action}-${step.column}`,
        colorId: step.colorId,
        label: stitchActionLabel(step.action),
        count: 1,
        showCount: isEdgeAction,
      });
      return runs;
    }
    const previous = runs[runs.length - 1];
    if (previous?.key === step.colorId) previous.count += 1;
    else runs.push({ key: step.colorId, colorId: step.colorId, label: labels.get(step.colorId) ?? "?", count: 1, showCount: true });
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
    if (colorId === backgroundId && stitchActionAt(document, rowIndex, columnIndex) === "knit") return;
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
      stitchActions: document.stitchActions
        ?.slice(minimumRow, maximumRow + 1)
        .map((chartRow) => chartRow.slice(minimumColumn, maximumColumn + 1)),
    },
    trimmed: true,
  };
}

export function KnitMode({ document, progress, onProgressChange, onSettingsChange, onClose }: Props) {
  const [keepScreenAwake, setKeepScreenAwake] = useState(false);
  const [wakeLockSupported, setWakeLockSupported] = useState(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const region = useMemo(() => knitRegion(document, progress.trimBorder), [document, progress.trimBorder]);
  const activeDocument = region.document;
  const aspect = cellAspectRatio(activeDocument);
  const palette = new Map(activeDocument.palette.map((color) => [color.id, color.hex]));
  const row = clamp(progress.row, 1, activeDocument.height);
  const structural = hasStructuralStitches(activeDocument);
  const rowSteps = rowStitchSteps(activeDocument, row);
  const rowMath = rowStitchMath(activeDocument, row);
  const orderedRowSteps = isRightToLeft(activeDocument, row) ? [...rowSteps].reverse() : rowSteps;
  const stitch = clamp(progress.stitch, 0, orderedRowSteps.length);
  const activeStep = stitch > 0 ? orderedRowSteps[stitch - 1] : undefined;
  const activeStepMath = activeStep ? stitchActionMath(activeStep.action) : undefined;
  const rowIndex = activeDocument.height - row;
  const rightToLeft = isRightToLeft(activeDocument, row);
  const markerColumn = stitch > 0 ? orderedRowSteps[stitch - 1]?.column ?? -1 : -1;
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

  useEffect(() => {
    setWakeLockSupported("wakeLock" in navigator);
  }, []);

  useEffect(() => {
    if (!keepScreenAwake || !wakeLockSupported) return;
    let cancelled = false;

    async function requestWakeLock() {
      if (cancelled || window.document.visibilityState !== "visible" || wakeLockRef.current) return;
      try {
        const wakeLock = await navigator.wakeLock.request("screen");
        if (cancelled) {
          await wakeLock.release();
          return;
        }
        wakeLockRef.current = wakeLock;
        wakeLock.addEventListener("release", () => {
          if (wakeLockRef.current === wakeLock) wakeLockRef.current = null;
        });
      } catch {
        // Wake locks are advisory and the browser may decline a request. Keep
        // the user's preference enabled and try again when the page is active.
      }
    }

    function handleVisibilityChange() {
      if (window.document.visibilityState === "visible") void requestWakeLock();
    }

    void requestWakeLock();
    window.document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      cancelled = true;
      window.document.removeEventListener("visibilitychange", handleVisibilityChange);
      const wakeLock = wakeLockRef.current;
      wakeLockRef.current = null;
      if (wakeLock && !wakeLock.released) void wakeLock.release().catch(() => undefined);
    };
  }, [keepScreenAwake, wakeLockSupported]);

  function update(nextRow: number, nextStitch: number) {
    const clampedRow = clamp(nextRow, 1, activeDocument.height);
    const maximumStep = rowStitchSteps(activeDocument, clampedRow).length;
    onProgressChange({
      ...progress,
      row: clampedRow,
      stitch: clamp(nextStitch, 0, maximumStep),
    });
  }

  function changeRow(amount: number) {
    update(row + amount, 0);
  }

  function changeStitch(amount: number) {
    const next = stitch + amount;
    if (next > orderedRowSteps.length && row < activeDocument.height) update(row + 1, 0);
    else if (next < 0 && row > 1) update(row - 1, rowStitchSteps(activeDocument, row - 1).length);
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
            ? progress.markerStyle === "none"
              ? `${structural ? "Step" : "Stitch"} ${stitch} of ${orderedRowSteps.length} selected`
              : `Marker on ${structural ? "step" : "stitch"} ${stitch} of ${orderedRowSteps.length}`
            : `Click a ${structural ? "step" : "stitch"} to mark your place`}</span>
        </div>
        <div className="knit-mode-header-actions">
          <button className="secondary-button" onClick={onClose}>Exit knit mode</button>
        </div>
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
              {activeDocument.cells.flatMap((chartRow, chartRowIndex) => chartRow.map((colorId, columnIndex) => {
                const action = stitchActionAt(activeDocument, chartRowIndex, columnIndex);
                return (
                  <rect
                    key={`${chartRowIndex}-${columnIndex}`}
                    className={action === "no-stitch" ? "knit-mode-no-stitch" : undefined}
                    x={columnIndex * aspect}
                    y={chartRowIndex}
                    width={aspect}
                    height="1"
                    fill={action === "knit" ? palette.get(colorId) ?? "#fff" : stitchDisplayColor(activeDocument, action)}
                    onClick={() => {
                      if (action === "no-stitch") return;
                      const nextRow = activeDocument.height - chartRowIndex;
                      const steps = rowStitchSteps(activeDocument, nextRow);
                      const orderedSteps = isRightToLeft(activeDocument, nextRow) ? [...steps].reverse() : steps;
                      const selectedStitch = orderedSteps.findIndex((step) => step.column === columnIndex) + 1;
                      if (selectedStitch > 0) update(nextRow, selectedStitch);
                    }}
                  />
                );
              }))}
            </g>
            <g className="knit-mode-action-symbols" pointerEvents="none">
              {activeDocument.cells.flatMap((chartRow, chartRowIndex) => chartRow.map((_, columnIndex) => {
                const action = stitchActionAt(activeDocument, chartRowIndex, columnIndex);
                if (action === "knit") return null;
                const background = stitchDisplayColor(activeDocument, action);
                return <text key={`${chartRowIndex}-${columnIndex}`} style={{ fill: contrastTextColor(background) }} x={(columnIndex + 0.5) * aspect} y={chartRowIndex + 0.7} textAnchor="middle" fontSize={Math.min(0.48, aspect * 0.38)}>{stitchActionSymbol(action)}</text>;
              }))}
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
          {wakeLockSupported ? (
            <div className="knit-wake-row">
              <label className="knit-wake-toggle">
                <span>Keep screen awake</span>
                <input type="checkbox" role="switch" checked={keepScreenAwake} onChange={(event) => setKeepScreenAwake(event.target.checked)} />
                <span className="knit-toggle-track" aria-hidden="true" />
              </label>
            </div>
          ) : null}
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
            : `Work this ${activeDocument.instructions.construction === "round" ? "round" : "row"} ${rightToLeft ? "right to left" : "left to right"}.`} {structural ? "Skip no-stitch cells and work special stitch actions as shown." : "Click any stitch to place your marker there."}</p>
          {structural ? (
            <div className="knit-row-math" aria-label={`${unitName} stitch count`}>
              <div><span>Start</span><strong>{rowMath.startingStitches}</strong></div>
              <div className={rowMath.change > 0 ? "increase" : rowMath.change < 0 ? "decrease" : ""}><span>Change</span><strong>{rowMath.change > 0 ? `+${rowMath.change}` : rowMath.change}</strong></div>
              <div><span>End</span><strong>{rowMath.endingStitches}</strong></div>
            </div>
          ) : null}
          {activeStep ? (
            <div className={`knit-current-step ${activeStep.action !== "knit" ? "shaping" : ""}`}>
              <span>Current {structural ? "step" : "stitch"}</span>
              <strong>{activeStep.action === "knit"
                ? `Work ${activeDocument.palette.findIndex((color) => color.id === activeStep.colorId) === 0 ? "MC" : `CC${activeDocument.palette.findIndex((color) => color.id === activeStep.colorId)}`}`
                : stitchActionLabel(activeStep.action)}</strong>
              {activeStep.action === "purl"
                ? <small>Work one purl stitch as marked.</small>
                : activeStep.action !== "knit" && activeStepMath
                  ? <small>{activeStepMath.consumes} stitch{activeStepMath.consumes === 1 ? "" : "es"} in → {activeStepMath.produces} out. This is not an MC stitch.</small>
                  : null}
            </div>
          ) : null}
          <div className="knit-sequence" aria-label="Current row colour sequence">
            {sequence.map((run, index) => (
              <span key={`${run.key}-${index}`} className={run.key === run.colorId ? "" : "stitch-action"}>{run.key === run.colorId ? <i style={{ background: palette.get(run.colorId) }} /> : null}{run.label} {run.showCount ? run.count : ""}</span>
            ))}
          </div>
          <div className="knit-row-controls">
            <button onClick={() => changeRow(-1)} disabled={row === 1}>Previous row</button>
            <button className="primary-button" onClick={() => changeRow(1)} disabled={row === activeDocument.height}>Next row</button>
          </div>
          <div className="knit-step-controls">
            <button onClick={() => changeStitch(-1)} disabled={row === 1 && stitch === 0}>Previous {structural ? "step" : "stitch"}</button>
            <button onClick={() => changeStitch(1)} disabled={row === activeDocument.height && stitch === orderedRowSteps.length}>Next {structural ? "step" : "stitch"}</button>
          </div>
          <button className="knit-reset" onClick={() => update(1, 0)}>Start again from row 1</button>
          <p className="knit-keyboard-hint">Use the left and right arrow keys for {structural ? "steps" : "stitches"}, the up and down arrow keys for rows, or press Space for the next {structural ? "step" : "stitch"}. Your place is remembered for this chart.</p>
        </aside>
      </div>
    </section>
  );
}
