"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  cellAspectRatio,
  ChartDocument,
  contrastTextColor,
  hasStructuralStitches,
  InstructionSettings,
  rowStitchMath,
  rowStitchSteps,
  stitchActionAt,
  stitchActionMath,
  stitchActionSymbol,
  chartCellDisplayColor,
  copyStitchCellColors,
} from "@/lib/chart";
import type { KnitProgress } from "@/lib/chart-schema";
import { rowSequence, workedStepLabel } from "@/lib/knit-sequence";
import {
  moveYokeKnitStep,
  moveYokeKnitPage,
  yokeKnitModel,
  yokeKnitPages,
} from "@/lib/yoke-knit";
import { planYokeShortRows, shortRowInstructions } from "@/lib/yoke-short-rows";
export type { KnitProgress } from "@/lib/chart-schema";

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

function majorColumnBoundary(column: number, width: number, offset = 0) {
  return column > 0 && column < width && (column + offset) % 10 === 0;
}

function majorRowBoundary(chartRow: number, height: number) {
  const completedRows = height - chartRow;
  return chartRow > 0 && chartRow < height && completedRows % 10 === 0;
}

function isRightToLeft(document: ChartDocument, row: number) {
  if (document.instructions.technique === "duplicate") return false;
  return document.instructions.construction === "round" || row % 2 === 1;
}

function knitRegion(document: ChartDocument, shouldTrim: boolean) {
  if (!shouldTrim) return { document, trimmed: false };
  const backgroundId = document.palette[0]?.id;
  let minimumRow = document.height;
  let maximumRow = -1;
  let minimumColumn = document.width;
  let maximumColumn = -1;

  document.cells.forEach((chartRow, rowIndex) =>
    chartRow.forEach((colorId, columnIndex) => {
      if (
        colorId === backgroundId &&
        stitchActionAt(document, rowIndex, columnIndex) === "knit"
      )
        return;
      minimumRow = Math.min(minimumRow, rowIndex);
      maximumRow = Math.max(maximumRow, rowIndex);
      minimumColumn = Math.min(minimumColumn, columnIndex);
      maximumColumn = Math.max(maximumColumn, columnIndex);
    }),
  );

  if (maximumRow < minimumRow || maximumColumn < minimumColumn)
    return { document, trimmed: false };
  const width = maximumColumn - minimumColumn + 1;
  const height = maximumRow - minimumRow + 1;
  if (width === document.width && height === document.height)
    return { document, trimmed: false };
  return {
    document: {
      ...document,
      width,
      height,
      cells: document.cells
        .slice(minimumRow, maximumRow + 1)
        .map((chartRow) => chartRow.slice(minimumColumn, maximumColumn + 1)),
      stitchCellColors: copyStitchCellColors(document)
        .slice(minimumRow, maximumRow + 1)
        .map((row) => row.slice(minimumColumn, maximumColumn + 1)),
      stitchActions: document.stitchActions
        ?.slice(minimumRow, maximumRow + 1)
        .map((chartRow) => chartRow.slice(minimumColumn, maximumColumn + 1)),
    },
    trimmed: true,
  };
}

const subscribeToStaticCapability = () => () => {};
const wakeLockAvailable = () => "wakeLock" in navigator;

export function KnitMode({
  document,
  progress,
  onProgressChange,
  onSettingsChange,
  onClose,
}: Props) {
  const [keepScreenAwake, setKeepScreenAwake] = useState(false);
  const wakeLockSupported = useSyncExternalStore(
    subscribeToStaticCapability,
    wakeLockAvailable,
    () => false,
  );
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const yoke = document.yoke;
  const model = useMemo(() => (yoke ? yokeKnitModel(yoke) : null), [yoke]);
  const sectionColumns = progress.sectionColumns ?? 100;
  const pages = useMemo(
    () => (yoke && model ? yokeKnitPages(yoke, model, sectionColumns) : null),
    [yoke, model, sectionColumns],
  );
  const pageRounds = useMemo(
    () =>
      model && pages
        ? model.rounds.map((round, r) => ({
            ...round,
            lengths: pages.map((page) => page.rows[r].steps.length),
          }))
        : null,
    [model, pages],
  );
  const roundNumber = clamp(progress.row, 1, document.height);
  const markerSourceSection = model?.identical ? 0 : (progress.section ?? 0);
  const markerPage =
    pages?.findIndex((page) =>
      page.rows[roundNumber - 1].steps.some(
        (step) =>
          step.sourceSection === markerSourceSection &&
          step.sourceStep === progress.stitch,
      ),
    ) ?? -1;
  const requestedPage = clamp(
    progress.viewSection ?? Math.max(0, markerPage),
    0,
    (pages?.length ?? 1) - 1,
  );
  const section =
    pages && !pages[requestedPage].rows[roundNumber - 1].steps.length
      ? pages.findIndex(
          (page, index) =>
            index > requestedPage && page.rows[roundNumber - 1].steps.length,
        ) >= 0
        ? pages.findIndex(
            (page, index) =>
              index > requestedPage && page.rows[roundNumber - 1].steps.length,
          )
        : Math.max(
            0,
            pages.findIndex((page) => page.rows[roundNumber - 1].steps.length),
          )
      : requestedPage;
  const sectionChart = pages?.[section] ?? null;
  const shortRows = useMemo(() => {
    if (!yoke?.measurements.backRise) return null;
    try {
      const plan = planYokeShortRows(yoke.measurements, yoke.shortRows);
      return plan.extraRows ? shortRowInstructions(plan) : null;
    } catch {
      return [
        "Review the back-neck turns in Edit shaping before starting Round 1.",
      ];
    }
  }, [yoke]);
  const region = useMemo(
    () => knitRegion(document, !document.yoke && progress.trimBorder),
    [document, progress.trimBorder],
  );
  const activeDocument = sectionChart?.document ?? region.document;
  const aspect = cellAspectRatio(activeDocument);
  const palette = new Map(
    activeDocument.palette.map((color) => [color.id, color.hex]),
  );
  const row = clamp(progress.row, 1, activeDocument.height);
  const structural = Boolean(yoke) || hasStructuralStitches(activeDocument);
  const rowSteps = rowStitchSteps(activeDocument, row);
  const rowMath = model?.rounds[row - 1] ?? rowStitchMath(activeDocument, row);
  const rightToLeft = !yoke && isRightToLeft(activeDocument, row);
  const orderedRowSteps =
    sectionChart?.rows[row - 1].steps ??
    (rightToLeft ? [...rowSteps].reverse() : rowSteps);
  const stitch = sectionChart
    ? sectionChart.rows[row - 1].steps.findIndex(
        (step) =>
          step.sourceSection === markerSourceSection &&
          step.sourceStep === progress.stitch,
      ) + 1
    : clamp(progress.stitch, 0, orderedRowSteps.length);
  const activeStep = stitch > 0 ? orderedRowSteps[stitch - 1] : undefined;
  const activeStepLabel = activeStep
    ? workedStepLabel(activeDocument, activeStep, Boolean(yoke))
    : "";
  const activeStepMath = activeStep
    ? stitchActionMath(activeStep.action)
    : undefined;
  const rowIndex = activeDocument.height - row;
  const markerColumn =
    stitch > 0 ? (orderedRowSteps[stitch - 1]?.column ?? -1) : -1;
  const markerX = (markerColumn + 0.5) * aspect;
  const marker =
    MARKERS.find((choice) => choice.id === progress.markerStyle) ?? MARKERS[1];
  const sequence = rowSequence(activeDocument, orderedRowSteps, Boolean(yoke));
  const position = { row, section, stitch };
  const nextYokeStep =
    pageRounds && pages
      ? moveYokeKnitStep(pageRounds, pages.length, position, 1)
      : null;
  const previousYokeStep =
    pageRounds && pages
      ? moveYokeKnitStep(pageRounds, pages.length, position, -1)
      : null;
  const pageLengths = pageRounds?.map((round) => round.lengths);
  const nextPage = pageLengths
    ? moveYokeKnitPage(pageLengths, row, section, 1)
    : null;
  const previousPage = pageLengths
    ? moveYokeKnitPage(pageLengths, row, section, -1)
    : null;
  const isDuplicate = activeDocument.instructions.technique === "duplicate";
  const unitName = isDuplicate
    ? "Row"
    : activeDocument.instructions.construction === "round"
      ? "Round"
      : "Row";
  const chartWidth = activeDocument.width * aspect;
  const labelSize = Math.max(0.5, Math.min(0.9, activeDocument.height / 35));
  const leftMargin = labelSize * 2.5;
  const topMargin = labelSize * 1.8;
  const columnStep =
    activeDocument.width <= 24 ? 1 : activeDocument.width <= 50 ? 5 : 10;
  const rowStep = activeDocument.height <= 24 ? 1 : 5;

  useEffect(() => {
    if (!keepScreenAwake || !wakeLockSupported) return;
    let cancelled = false;

    async function requestWakeLock() {
      if (
        cancelled ||
        window.document.visibilityState !== "visible" ||
        wakeLockRef.current
      )
        return;
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
    window.document.addEventListener(
      "visibilitychange",
      handleVisibilityChange,
    );
    return () => {
      cancelled = true;
      window.document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange,
      );
      const wakeLock = wakeLockRef.current;
      wakeLockRef.current = null;
      if (wakeLock && !wakeLock.released)
        void wakeLock.release().catch(() => undefined);
    };
  }, [keepScreenAwake, wakeLockSupported]);

  function update(nextRow: number, nextStitch: number, nextSection = section) {
    const clampedRow = clamp(nextRow, 1, activeDocument.height);
    const maximumStep =
      pageRounds?.[clampedRow - 1].lengths[nextSection] ??
      rowStitchSteps(activeDocument, clampedRow).length;
    if (pages) {
      const page = pages[nextSection];
      const local = clamp(nextStitch, 0, maximumStep);
      const step = local
        ? page.rows[clampedRow - 1].steps[local - 1]
        : undefined;
      onProgressChange({
        ...progress,
        shortRowNoteSeen: true,
        row: clampedRow,
        viewSection: nextSection,
        section: step?.sourceSection ?? 0,
        stitch: step?.sourceStep ?? 0,
      });
      return;
    }
    onProgressChange({
      ...progress,
      row: clampedRow,
      stitch: clamp(nextStitch, 0, maximumStep),
      ...(yoke ? { section: nextSection } : {}),
    });
  }

  function changeRow(amount: number) {
    const next = amount > 0 ? nextPage : previousPage;
    if (next) {
      navigate(next.row, next.section);
      return;
    }
    update(row + amount, 0, 0);
  }

  function navigate(nextRow: number, nextSection: number) {
    onProgressChange({
      ...progress,
      ...(yoke ? { shortRowNoteSeen: true } : {}),
      row: nextRow,
      viewSection: nextSection,
      ...(nextRow !== row ? { section: 0, stitch: 0 } : {}),
    });
  }

  function changeStitch(amount: number) {
    const yokeStep = amount > 0 ? nextYokeStep : previousYokeStep;
    if (yokeStep) {
      update(yokeStep.row, yokeStep.stitch, yokeStep.section);
      return;
    }
    const next = stitch + amount;
    if (next > orderedRowSteps.length && row < activeDocument.height)
      update(row + 1, 0);
    else if (next < 0 && row > 1)
      update(row - 1, rowStitchSteps(activeDocument, row - 1).length);
    else update(row, next);
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (
        event.target instanceof HTMLElement &&
        (event.target.closest(
          "input, select, textarea, summary, [contenteditable=true]",
        ) ||
          (event.key === " " && event.target.closest("button")))
      )
        return;
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

  const progressionControls = (
    <div className="knit-row-controls">
      <button
        onClick={() => changeRow(-1)}
        disabled={
          previousPage
            ? previousPage.row === row && previousPage.section === section
            : row === 1
        }
      >
        Previous{" "}
        {previousPage?.row === row && previousPage.section !== section
          ? "section"
          : yoke
            ? "round"
            : "row"}
      </button>
      <button
        className="primary-button"
        onClick={() => changeRow(1)}
        disabled={
          nextPage
            ? nextPage.row === row && nextPage.section === section
            : row === activeDocument.height
        }
      >
        Next{" "}
        {nextPage?.row === row && nextPage.section !== section
          ? "section"
          : yoke
            ? "round"
            : "row"}
      </button>
    </div>
  );
  const sectionSizeControl =
    model && pages ? (
      <label className="knit-section-size">
        Max columns per section
        <select
          value={sectionColumns}
          onChange={(event) => {
            const columns = Number(event.target.value);
            const next = yokeKnitPages(yoke!, model, columns);
            const anchor = pages[section];
            const viewSection = next.findIndex(
              (page) => page.start <= anchor.start && page.end > anchor.start,
            );
            onProgressChange({
              ...progress,
              sectionColumns: columns,
              viewSection: Math.max(0, viewSection),
            });
          }}
        >
          {[50, 75, 100, 150, 200].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
    ) : null;
  const jumpControl =
    model && pages ? (
      <details className="knit-jump-control">
        <summary>Jump to…</summary>
        <div className="knit-jump-fields">
          <label>
            Round
            <select
              value={row}
              onChange={(event) => {
                const target = Number(event.target.value);
                const first = pages.findIndex(
                  (page) => page.rows[target - 1].steps.length,
                );
                navigate(target, Math.max(0, first));
              }}
            >
              {Array.from({ length: document.height }, (_, i) => (
                <option key={i} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>
          </label>
          <label>
            Section
            <select
              value={section}
              onChange={(event) => navigate(row, Number(event.target.value))}
            >
              {pages.map((page, i) => (
                <option
                  key={i}
                  value={i}
                  disabled={!page.rows[row - 1].steps.length}
                >
                  {i + 1} / {pages.length}
                </option>
              ))}
            </select>
          </label>
        </div>
      </details>
    ) : null;

  return (
    <section
      className="knit-mode"
      role="dialog"
      aria-modal="true"
      aria-label="Knit mode"
    >
      <header className="knit-mode-header">
        <div>
          <p className="eyebrow">Knit mode</p>
          <h1>{document.name || "Untitled chart"}</h1>
        </div>
        <div className="knit-mode-status">
          <strong>
            {unitName} {row} of {activeDocument.height}
          </strong>
          {pages && pages.length > 1 ? (
            <span>
              Section {section + 1} of {pages.length}
            </span>
          ) : null}
          {markerPage >= 0 && markerPage !== section ? (
            <span>Marker saved in section {markerPage + 1}</span>
          ) : null}
          <span>
            {stitch > 0
              ? progress.markerStyle === "none"
                ? `${structural ? "Step" : "Stitch"} ${stitch} of ${orderedRowSteps.length} selected`
                : `Marker on ${structural ? "step" : "stitch"} ${stitch} of ${orderedRowSteps.length}`
              : `Click a ${structural ? "step" : "stitch"} to mark your place`}
          </span>
        </div>
        <div className="knit-mode-header-actions">
          <button className="secondary-button" onClick={onClose}>
            Exit knit mode
          </button>
        </div>
      </header>

      <div className="knit-mode-body">
        <div className="knit-mode-chart-frame">
          <svg
            className="knit-mode-chart"
            viewBox={`${-leftMargin} ${-topMargin} ${chartWidth + leftMargin} ${activeDocument.height + topMargin}`}
            style={{
              aspectRatio: `${chartWidth + leftMargin} / ${activeDocument.height + topMargin}`,
            }}
            role="img"
            aria-label={`Chart with row ${row} highlighted${stitch > 0 && progress.markerStyle !== "none" ? ` and a marker on stitch ${stitch}` : ""}`}
          >
            <g shapeRendering="crispEdges">
              {activeDocument.cells.flatMap((chartRow, chartRowIndex) =>
                chartRow.map((colorId, columnIndex) => {
                  const action = stitchActionAt(
                    activeDocument,
                    chartRowIndex,
                    columnIndex,
                  );
                  return (
                    <rect
                      key={`${chartRowIndex}-${columnIndex}`}
                      className={
                        action === "no-stitch"
                          ? "knit-mode-no-stitch"
                          : undefined
                      }
                      x={columnIndex * aspect}
                      y={chartRowIndex}
                      width={aspect}
                      height="1"
                      fill={chartCellDisplayColor(
                        activeDocument,
                        chartRowIndex,
                        columnIndex,
                        palette.get(colorId),
                      )}
                      onClick={() => {
                        if (action === "no-stitch") return;
                        const nextRow = activeDocument.height - chartRowIndex;
                        if (sectionChart) {
                          const step =
                            sectionChart.rows[nextRow - 1].atColumn.get(
                              columnIndex,
                            );
                          if (step !== undefined) update(nextRow, step);
                          return;
                        }
                        const steps = rowStitchSteps(activeDocument, nextRow);
                        const orderedSteps = isRightToLeft(
                          activeDocument,
                          nextRow,
                        )
                          ? [...steps].reverse()
                          : steps;
                        const selectedStitch =
                          orderedSteps.findIndex(
                            (step) => step.column === columnIndex,
                          ) + 1;
                        if (selectedStitch > 0) update(nextRow, selectedStitch);
                      }}
                    />
                  );
                }),
              )}
            </g>
            <g className="knit-mode-action-symbols" pointerEvents="none">
              {activeDocument.cells.flatMap((chartRow, chartRowIndex) =>
                chartRow.map((_, columnIndex) => {
                  const action = stitchActionAt(
                    activeDocument,
                    chartRowIndex,
                    columnIndex,
                  );
                  if (action === "knit") return null;
                  const background = chartCellDisplayColor(
                    activeDocument,
                    chartRowIndex,
                    columnIndex,
                    palette.get(
                      activeDocument.cells[chartRowIndex][columnIndex],
                    ),
                  );
                  return (
                    <text
                      key={`${chartRowIndex}-${columnIndex}`}
                      style={{ fill: contrastTextColor(background) }}
                      x={(columnIndex + 0.5) * aspect}
                      y={chartRowIndex + 0.7}
                      textAnchor="middle"
                      fontSize={Math.min(0.48, aspect * 0.38)}
                    >
                      {stitchActionSymbol(action)}
                    </text>
                  );
                }),
              )}
            </g>
            <rect
              className="knit-mode-row-dimmer top"
              x="0"
              y="0"
              width={activeDocument.width * aspect}
              height={rowIndex}
            />
            <rect
              className="knit-mode-row-dimmer bottom"
              x="0"
              y={rowIndex + 1}
              width={activeDocument.width * aspect}
              height={activeDocument.height - rowIndex - 1}
            />
            <rect
              className="knit-mode-current-row"
              x="0"
              y={rowIndex}
              width={activeDocument.width * aspect}
              height="1"
            />
            <g
              className="knit-mode-grid"
              shapeRendering="crispEdges"
              pointerEvents="none"
            >
              {Array.from({ length: activeDocument.width + 1 }, (_, column) => (
                <line
                  key={`column-${column}`}
                  className={
                    majorColumnBoundary(
                      column,
                      activeDocument.width,
                      sectionChart?.start,
                    )
                      ? "major"
                      : undefined
                  }
                  x1={column * aspect}
                  x2={column * aspect}
                  y1="0"
                  y2={activeDocument.height}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {Array.from(
                { length: activeDocument.height + 1 },
                (_, chartRow) => (
                  <line
                    key={`row-${chartRow}`}
                    className={
                      majorRowBoundary(chartRow, activeDocument.height)
                        ? "major"
                        : undefined
                    }
                    x1="0"
                    x2={activeDocument.width * aspect}
                    y1={chartRow}
                    y2={chartRow}
                    vectorEffect="non-scaling-stroke"
                  />
                ),
              )}
            </g>
            {stitch > 0 && progress.markerStyle !== "none" ? (
              <g
                className={`knit-mode-stitch-marker ${progress.markerStyle}`}
                pointerEvents="none"
              >
                <circle
                  cx={markerX}
                  cy={rowIndex + 0.5}
                  r={Math.min(0.43, aspect * 0.35)}
                  vectorEffect="non-scaling-stroke"
                />
                <text
                  x={markerX}
                  y={rowIndex + 0.72}
                  textAnchor="middle"
                  fontSize={Math.min(0.68, aspect * 0.54)}
                >
                  {marker.symbol}
                </text>
              </g>
            ) : null}
            <g className="knit-mode-chart-labels" pointerEvents="none">
              {Array.from({ length: activeDocument.width }, (_, columnIndex) =>
                (columnIndex + 1 + (sectionChart?.start ?? 0)) % columnStep ===
                0 ? (
                  <text
                    key={`column-label-${columnIndex}`}
                    x={(columnIndex + 0.5) * aspect}
                    y={-labelSize * 0.45}
                    textAnchor="middle"
                    fontSize={labelSize}
                  >
                    {columnIndex + 1 + (sectionChart?.start ?? 0)}
                  </text>
                ) : null,
              )}
              {Array.from(
                { length: activeDocument.height },
                (_, chartRowIndex) => {
                  const rowNumber = activeDocument.height - chartRowIndex;
                  return rowNumber % rowStep === 0 ? (
                    <text
                      key={`row-label-${chartRowIndex}`}
                      x={-labelSize * 0.5}
                      y={chartRowIndex + 0.7}
                      textAnchor="end"
                      fontSize={labelSize}
                    >
                      {rowNumber}
                    </text>
                  ) : null;
                },
              )}
            </g>
          </svg>
        </div>

        <aside className="knit-mode-controls">
          {wakeLockSupported ? (
            <div className="knit-wake-row">
              <label className="knit-wake-toggle">
                <span>Keep screen awake</span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={keepScreenAwake}
                  onChange={(event) => setKeepScreenAwake(event.target.checked)}
                />
                <span className="knit-toggle-track" aria-hidden="true" />
              </label>
            </div>
          ) : null}
          {sectionSizeControl}
          {sectionChart ? (
            <div className="knit-section-location">
              <span>
                Columns {sectionChart.start + 1}–{sectionChart.end}
              </span>
              {jumpControl}
            </div>
          ) : null}
          <div className="knit-mode-options">
            {model?.identical ? (
              <p>
                Work{" "}
                {pages && pages.length > 1
                  ? "all sections of this repeat"
                  : "this repeat"}{" "}
                {model.program.startingCounts.length} times per round.
              </p>
            ) : null}
            {model && pages ? (
              <>
                {markerPage >= 0 && markerPage !== section ? (
                  <button onClick={() => navigate(row, markerPage)}>
                    Go to marker
                  </button>
                ) : null}
              </>
            ) : (
              <>
                <div
                  className={`knit-mode-settings-grid ${isDuplicate ? "single" : ""}`}
                >
                  <label>
                    Technique
                    <select
                      value={document.instructions.technique}
                      onChange={(event) =>
                        onSettingsChange({
                          ...document.instructions,
                          technique: event.target
                            .value as InstructionSettings["technique"],
                        })
                      }
                    >
                      <option value="stranded">Stranded colourwork</option>
                      <option value="intarsia">Intarsia</option>
                      <option value="duplicate">Duplicate stitch</option>
                    </select>
                  </label>
                  {!isDuplicate ? (
                    <label>
                      Construction
                      <select
                        value={document.instructions.construction}
                        onChange={(event) =>
                          onSettingsChange({
                            ...document.instructions,
                            construction: event.target
                              .value as InstructionSettings["construction"],
                          })
                        }
                      >
                        <option value="flat">Worked flat</option>
                        <option value="round">In the round</option>
                      </select>
                    </label>
                  ) : null}
                </div>
                <label className="knit-trim-option">
                  <input
                    type="checkbox"
                    checked={progress.trimBorder}
                    onChange={(event) =>
                      onProgressChange({
                        ...progress,
                        trimBorder: event.target.checked,
                        row: 1,
                        stitch: 0,
                      })
                    }
                  />{" "}
                  Trim empty border
                </label>
              </>
            )}
            <div className="marker-picker" aria-label="Stitch marker style">
              <span>Marker</span>
              {MARKERS.map((choice) => (
                <button
                  key={choice.id}
                  className={
                    progress.markerStyle === choice.id ? "selected" : ""
                  }
                  aria-label={`${choice.label} stitch marker`}
                  title={choice.label}
                  onClick={() =>
                    onProgressChange({ ...progress, markerStyle: choice.id })
                  }
                >
                  {choice.symbol}
                </button>
              ))}
            </div>
            {!yoke && progress.trimBorder && !region.trimmed ? (
              <small>There is no empty outer border to trim.</small>
            ) : null}
          </div>
          <p className="knit-direction">
            {yoke
              ? "Start at centre back and follow the chart left to right, in section order."
              : isDuplicate
                ? "Follow each chart row from left to right, or work the duplicate stitches in any order that feels comfortable."
                : `Work this ${activeDocument.instructions.construction === "round" ? "round" : "row"} ${rightToLeft ? "right to left" : "left to right"}.`}{" "}
            {structural
              ? "Skip no-stitch cells and work special stitch actions as shown."
              : "Click any stitch to place your marker there."}
          </p>
          {structural ? (
            <div
              className="knit-row-math"
              aria-label={`${unitName} stitch count`}
            >
              <div>
                <span>Start</span>
                <strong>{rowMath.startingStitches}</strong>
              </div>
              <div
                className={
                  rowMath.change > 0
                    ? "increase"
                    : rowMath.change < 0
                      ? "decrease"
                      : ""
                }
              >
                <span>Change</span>
                <strong>
                  {rowMath.change > 0 ? `+${rowMath.change}` : rowMath.change}
                </strong>
              </div>
              <div>
                <span>End</span>
                <strong>{rowMath.endingStitches}</strong>
              </div>
            </div>
          ) : null}
          {activeStep ? (
            <div
              className={`knit-current-step ${activeStep.action !== "knit" ? "shaping" : ""}`}
            >
              <span>Current {structural ? "step" : "stitch"}</span>
              <strong>
                {activeStep.action === "knit" && activeStepLabel !== "Skip"
                  ? "Work "
                  : ""}
                {activeStepLabel}
              </strong>
              {activeStep.action === "purl" ? (
                <small>Work one purl stitch as marked.</small>
              ) : activeStep.action !== "knit" && activeStepMath ? (
                <small>
                  {activeStepMath.consumes} stitch
                  {activeStepMath.consumes === 1 ? "" : "es"} in →{" "}
                  {activeStepMath.produces} out.
                  {yoke ? "" : " This is not an MC stitch."}
                </small>
              ) : null}
            </div>
          ) : null}
          {shortRows &&
          !progress.shortRowNoteSeen &&
          row === 1 &&
          section === 0 &&
          progress.stitch === 0 ? (
            <div
              className="knit-short-row-prelude"
              aria-label="Before Round 1 instructions"
            >
              <p>First, work the back-neck short rows.</p>
              <details>
                <summary>Written steps</summary>
                {shortRows.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </details>
            </div>
          ) : null}
          <div
            className="knit-sequence"
            aria-label="Current row colour sequence"
          >
            {sequence.map((run, index) => (
              <span
                key={`${run.action}-${run.colorId}-${index}`}
                className={run.action === "knit" ? "" : "stitch-action"}
              >
                {run.action === "knit" ? (
                  <i style={{ background: palette.get(run.colorId) }} />
                ) : null}
                {run.label} {run.showCount ? run.count : ""}
              </span>
            ))}
          </div>
          {progressionControls}
          <div className="knit-step-controls">
            <button
              onClick={() => changeStitch(-1)}
              disabled={
                model
                  ? previousYokeStep === position
                  : row === 1 && stitch === 0
              }
            >
              Previous {structural ? "step" : "stitch"}
            </button>
            <button
              onClick={() => changeStitch(1)}
              disabled={
                model
                  ? nextYokeStep === position
                  : row === activeDocument.height &&
                    stitch === orderedRowSteps.length
              }
            >
              Next {structural ? "step" : "stitch"}
            </button>
          </div>
          <button className="knit-reset" onClick={() => update(1, 0, 0)}>
            Start again from {yoke ? "round" : "row"} 1
          </button>
          <p className="knit-keyboard-hint">
            Use the left and right arrow keys for{" "}
            {structural ? "steps" : "stitches"}, the up and down arrow keys for
            {yoke ? "sections and rounds" : "rows"}, or press Space for the next{" "}
            {structural ? "step" : "stitch"}. Your place is remembered for this
            chart.
          </p>
        </aside>
      </div>
    </section>
  );
}
