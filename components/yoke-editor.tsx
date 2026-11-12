"use client";
import { useState, type ReactNode } from "react";
import type { ChartDocument } from "@/lib/chart";
import { calculateYokeTargets, type YokeMeasurements } from "@/lib/yoke-plan";
import { type YokeProject } from "@/lib/yoke-project";
import { yokeDocument } from "@/lib/yoke-document";
import type { YokeView } from "@/lib/yoke-layout";
import { ColourPalettePanel } from "./colour-palette-panel";
import { YokeCanvas } from "./yoke-canvas";
import { YokeStandardChart } from "./yoke-standard-chart";
import { YokeGaugePanel } from "./yoke-gauge-panel";
import { YokePlanDialog } from "./yoke-plan-dialog";
import { useYokeTools } from "./use-yoke-tools";
import { YokeDrawingTools } from "./yoke-drawing-tools";
import { YokeRepeatControls } from "./yoke-repeat-controls";
import { StitchPalettePanel } from "./stitch-palette-panel";
import { useYokeStitches, type YokeStitchDraft } from "./use-yoke-stitches";
import { YokeStitchRevisionDialog } from "./yoke-stitch-revision-dialog";
import { withYokeProgram } from "@/lib/yoke-program-state";

export function YokeEditor({
  document,
  onChange,
  onCreate,
  onStrokeStart,
  undo,
  redo,
  canUndo,
  canRedo,
  tabsFull,
  view,
  onViewChange,
  stitchDraft,
  onStitchDraftChange,
  children,
}: {
  stitchDraft: YokeStitchDraft;
  onStitchDraftChange: (next: YokeStitchDraft) => void;
  view: YokeView;
  onViewChange: (view: YokeView) => void;
  document: ChartDocument;
  onChange: (document: ChartDocument) => void;
  onCreate: (document: ChartDocument) => boolean;
  children?: ReactNode;
  onStrokeStart: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  tabsFull: boolean;
}) {
  const project = document.yoke!;
  const target = calculateYokeTargets(project.measurements);
  function setView(next: YokeView) {
    tools.setSelection(null);
    onViewChange(next);
  }
  const [selected, setSelected] = useState("yarn-1");
  const tools = useYokeTools(
    project,
    view,
    change,
    stitchDraft.edits.length > 0,
  );
  const stitches = useYokeStitches(
    document,
    tools.drawing,
    tools.scope,
    onChange,
    onStrokeStart,
    stitchDraft,
    onStitchDraftChange,
  );
  function beginStroke() {
    if (stitches.action) stitches.begin();
    else onStrokeStart();
  }
  function selectStitch(action: import("@/lib/chart").StitchAction) {
    stitches.select(action);
    if (tools.tool === "eraser") tools.setTool("pencil");
  }
  const [zoom, setZoom] = useState(100);
  const [sideways, setSideways] = useState(false);
  const [fitRequest, setFitRequest] = useState(0);
  const visibleZoom = view === "chart" ? Math.max(100, zoom) : zoom;
  const [planning, setPlanning] = useState<{
    measurements?: YokeMeasurements;
  } | null>(null);
  const color = Math.min(
    project.palette.length - 1,
    Number(selected.replace("yarn-", "")) || 0,
  );
  function change(next: YokeProject, remember = true) {
    if (remember) onStrokeStart();
    onChange(yokeDocument(next, document.name));
  }
  return (
    <>
      <aside className="sidebar panel">
        <ColourPalettePanel
          document={document}
          selectedColor={`yarn-${color}`}
          structureAction={stitches.action}
          setSelectedColor={setSelected}
          setStructureAction={stitches.setAction}
          setStitchPickerOpen={stitches.setPicker}
          addColor={() =>
            change({ ...project, palette: [...project.palette, "#c86f52"] })
          }
          changePaletteColor={(id, hex) =>
            change({
              ...project,
              palette: project.palette.map((old, i) =>
                id === `yarn-${i}` ? hex : old,
              ),
            })
          }
          removeColor={(id) => {
            const index = Number(id.replace("yarn-", ""));
            const palette = project.palette.filter((_, i) => i !== index);
            if (project.program) {
              const program = structuredClone(project.program);
              program.rounds.forEach((round) =>
                round.forEach((ops) =>
                  ops.forEach((op) => {
                    op.color =
                      op.color === index
                        ? 0
                        : op.color > index
                          ? op.color - 1
                          : op.color;
                  }),
                ),
              );
              change(withYokeProgram({ ...project, palette }, program));
            } else
              change({
                ...project,
                palette,
                cells: project.cells.map((row) =>
                  row.map((c) => (c === index ? 0 : c > index ? c - 1 : c)),
                ),
              });
          }}
        />
        <StitchPalettePanel
          document={document}
          structureAction={stitches.action}
          stitchPickerOpen={stitches.picker}
          stitchPalette={stitches.palette}
          setStructureAction={stitches.setAction}
          setStitchPickerOpen={stitches.setPicker}
          addStitchToPalette={(action) => {
            stitches.add(action);
            if (tools.tool === "eraser") tools.setTool("pencil");
          }}
          selectStitchAction={selectStitch}
          changeStitchColor={(action, hex) => stitches.changeColor(action, hex)}
          removeStitchFromPalette={stitches.remove}
          resetStitchColor={(action) => stitches.changeColor(action)}
        />
        <details className="settings-group" open>
          <summary>
            Yoke plan <span aria-hidden="true">⌄</span>
          </summary>
          <div className="settings-content yoke-plan-summary">
            <p>
              {project.program
                ? project.program.startingCounts.reduce((a, b) => a + b, 0)
                : target.neck}{" "}
              → {project.cells.at(-1)!.length} stitches
            </p>
            <p>
              {target.rounds} rounds · {project.measurements.repeats} repeats
            </p>
            <p>
              {target.actualDepth.toFixed(1)} {project.measurements.unit} deep ·{" "}
              {target.shortRowPairs} short-row pairs
            </p>
            <button
              className="secondary-button"
              onClick={() => setPlanning({})}
            >
              Edit shaping
            </button>
          </div>
        </details>
        <YokeGaugePanel
          key={JSON.stringify(project.measurements)}
          document={document}
          onChange={(next) => {
            onStrokeStart();
            onChange(next);
          }}
          onRecalculate={(measurements) => setPlanning({ measurements })}
        />
      </aside>
      <div className="chart-stack">
        <section className="editor panel yoke-editor-panel">
          <YokeDrawingTools
            tools={tools}
            color={color}
            zoom={visibleZoom}
            minimumZoom={view === "chart" ? 100 : 1}
            setZoom={setZoom}
            undo={() => {
              tools.setSelection(null);
              undo();
            }}
            redo={() => {
              tools.setSelection(null);
              redo();
            }}
            canUndo={canUndo}
            canRedo={canRedo}
            onErase={() => stitches.setAction(null)}
            selectionLabel={
              stitches.action ? `Apply ${stitches.label}` : undefined
            }
            onFillSelection={
              stitches.action
                ? () => stitches.applySelection(tools.selection)
                : undefined
            }
          />
          <div
            className="yoke-view-tabs"
            role="group"
            aria-label="Yoke drawing view"
          >
            <div className="tool-group" role="group" aria-label="Yoke views">
              {(
                [
                  ["chart", "Standard chart"],
                  ["repeat", "One repeat"],
                  ["front", "Half yoke"],
                  ["whole", "Whole yoke"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  className={
                    view === value || (value === "front" && view === "back")
                      ? "active"
                      : ""
                  }
                  aria-pressed={
                    view === value || (value === "front" && view === "back")
                  }
                  onClick={() => setView(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            {view === "front" || view === "back" ? (
              <select
                aria-label="Half-yoke side"
                value={view}
                onChange={(event) =>
                  setView(event.target.value as "front" | "back")
                }
              >
                <option value="front">Front-facing half</option>
                <option value="back">Back-facing half</option>
              </select>
            ) : null}
            {view === "repeat" ? (
              <div className="yoke-repeat-navigation">
                <div
                  className="tool-group"
                  role="group"
                  aria-label="Repeat orientation"
                >
                  <button
                    className={!sideways ? "active" : ""}
                    aria-pressed={!sideways}
                    onClick={() => {
                      setSideways(false);
                      setFitRequest((value) => value + 1);
                    }}
                  >
                    Upright
                  </button>
                  <button
                    className={sideways ? "active" : ""}
                    aria-pressed={sideways}
                    onClick={() => {
                      setSideways(true);
                      setFitRequest((value) => value + 1);
                    }}
                  >
                    Sideways
                  </button>
                </div>
                <button
                  className="secondary-button"
                  onClick={() => setFitRequest((value) => value + 1)}
                >
                  Fit whole repeat
                </button>
              </div>
            ) : null}
          </div>
          <YokeRepeatControls
            count={project.measurements.repeats}
            tools={tools}
          />
          {stitches.error ? <p role="alert">{stitches.error}</p> : null}
          {tools.error ? (
            <p role="alert" className="error-message">
              {tools.error}
            </p>
          ) : null}
          {stitches.draft.edits.length || stitches.draft.future.length ? (
            <div
              className="yoke-pending-shaping"
              role="region"
              aria-label="Pending shaping changes"
            >
              <span>
                {stitches.draft.edits.length} pending shaping edits · not
                applied yet
              </span>
              <button
                className="secondary-button"
                disabled={!stitches.draft.past.length}
                onClick={stitches.undoDraft}
              >
                Undo shaping edit
              </button>
              <button
                className="secondary-button"
                disabled={!stitches.draft.future.length}
                onClick={stitches.redoDraft}
              >
                Redo shaping edit
              </button>
              <button className="secondary-button" onClick={stitches.discard}>
                Discard shaping edits
              </button>
              <button
                className="primary-button"
                disabled={!stitches.draft.edits.length}
                onClick={stitches.review}
              >
                Review shaping changes
              </button>
            </div>
          ) : null}
          {view === "chart" ? (
            <YokeStandardChart
              project={project}
              zoom={visibleZoom}
              selectedColor={tools.tool === "eraser" ? 0 : color}
              drawing={stitches.markedDrawing}
              tool={tools.tool === "row-fill" ? "fill" : tools.tool}
              selection={tools.selection}
              onSelectionChange={tools.setSelection}
              onPaint={(row, column) => tools.paint(row, column, color)}
              onChartPaint={
                stitches.action
                  ? (row, column) =>
                      stitches.collectChart(
                        row,
                        column,
                        tools.tool === "fill" || tools.tool === "row-fill",
                      )
                  : undefined
              }
              onStrokeStart={beginStroke}
              onStrokeEnd={stitches.action ? stitches.finish : undefined}
            />
          ) : (
            <YokeCanvas
              sideways={sideways}
              fitRequest={fitRequest}
              onZoomChange={setZoom}
              marks={stitches.marks}
              project={project}
              view={view}
              zoom={zoom}
              repeat={tools.repeat}
              select={tools.tool === "select"}
              selection={tools.selection}
              onSelectionChange={tools.setSelection}
              highlight={!tools.allRepeats}
              onPaint={(row, column) =>
                stitches.action
                  ? stitches.paint(
                      row,
                      column,
                      tools.tool === "fill" || tools.tool === "row-fill",
                    )
                  : tools.paint(row, column, color)
              }
              onStrokeStart={beginStroke}
              onStrokeEnd={stitches.action ? stitches.finish : undefined}
            />
          )}
        </section>
        {children}
      </div>
      {stitches.pending ? (
        <YokeStitchRevisionDialog
          base={stitches.pending.base}
          proposal={stitches.pending.document}
          current={document}
          repeat={stitches.pending.repeat}
          tabsFull={tabsFull}
          onApply={(next) => {
            onStrokeStart();
            onChange(next);
            tools.setSelection(null);
            stitches.discard();
          }}
          onCreate={(next) => {
            const created = onCreate(next);
            if (created) stitches.discard();
            return created;
          }}
          onClose={() => stitches.setPending(null)}
        />
      ) : null}
      {planning ? (
        <YokePlanDialog
          document={document}
          initialMeasurements={planning.measurements}
          tabsFull={tabsFull}
          onClose={() => setPlanning(null)}
          onCommit={(next, newTab) => {
            if (newTab) return onCreate(next);
            onStrokeStart();
            onChange(next);
            return true;
          }}
        />
      ) : null}
    </>
  );
}
