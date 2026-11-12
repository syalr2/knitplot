"use client";
import Link from "next/link";
import { useId, useLayoutEffect, useRef, useState } from "react";
import {
  calculateYokeTargets,
  defaultYokeMeasurements,
  suggestYokeSchedule,
  type YokeMeasurements,
  type IncreaseEvent,
} from "@/lib/yoke-plan";
import {
  createYokeProject,
  paintYoke,
  yokeProjectSchema,
  type YokeProject,
} from "@/lib/yoke-project";
import type { YokeView } from "@/lib/yoke-layout";
import { YokePlanner } from "./yoke-planner";
import { YokeShortRowPlanner } from "./yoke-short-row-planner";
import { YokeCanvas } from "./yoke-canvas";
import { YokeStandardChart } from "./yoke-standard-chart";
import { useYokeDraft } from "./use-yoke-draft";
import { YokeMeasurementHelp } from "./yoke-measurement-help";
import type { YokeField } from "@/lib/yoke-measurement-fields";
import type { YokeMeasurementMode } from "@/lib/yoke-measurement-mode";

const initial = createYokeProject(
  defaultYokeMeasurements,
  suggestYokeSchedule(
    calculateYokeTargets(defaultYokeMeasurements),
    defaultYokeMeasurements.repeats,
  ),
);
export function YokeDesigner() {
  const { project, setProject, ready, error, flush } = useYokeDraft(initial);
  const [view, setView] = useState<YokeView>("repeat");
  const [color, setColor] = useState(1);
  const [allRepeats, setAllRepeats] = useState(true);
  const [zoom, setZoom] = useState(100);
  const [history, setHistory] = useState<YokeProject[]>([]);
  const [future, setFuture] = useState<YokeProject[]>([]);
  const [message, setMessage] = useState("");
  const measurementInputId = useId();
  const [measurementGuide, setMeasurementGuide] = useState<{
    field: YokeField;
    mode: YokeMeasurementMode;
    source: YokeMeasurements;
  } | null>(null);
  const [guideOpen, setGuideOpen] = useState(true);
  const input = useRef<HTMLInputElement>(null);
  const latestProject = useRef(project);
  useLayoutEffect(() => {
    latestProject.current = project;
  }, [project]);
  const plan = calculateYokeTargets(project.measurements);
  // Undo/import can restore a smaller palette than the previously selected index.
  const activeColor = Math.min(color, project.palette.length - 1);
  function remember() {
    setHistory((old) => [...old.slice(-19), project]);
    setFuture([]);
  }
  function replace(next: YokeProject) {
    if (
      project.cells.some((row) => row.some((value) => value !== 0)) &&
      !window.confirm(
        "Replace this drawing with the new plan? Download the current yoke first if you want to keep it. You can also undo this change.",
      )
    )
      return;
    remember();
    setProject(next);
    setColor(1);
    setMessage("");
  }
  function apply(measurements: YokeMeasurements, events: IncreaseEvent[]) {
    const next = {
      ...createYokeProject(measurements, events),
      palette: project.palette,
    };
    if (
      next.cells.length === project.cells.length &&
      next.cells.every(
        (row, index) => row.length === project.cells[index].length,
      )
    ) {
      remember();
      setProject({
        ...next,
        cells: project.cells,
        ...(project.shortRows?.distances.length ===
        calculateYokeTargets(measurements).shortRowPairs
          ? { shortRows: project.shortRows }
          : {}),
      });
    } else replace(next);
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(project)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "my-yoke.knitplot-yoke";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (!ready)
    return (
      <main className="yoke-designer">
        <p>Loading yoke draft…</p>
      </main>
    );
  return (
    <main className="yoke-designer">
      <header className="yoke-header">
        <div>
          <h1>
            <span aria-hidden="true">◎</span> KnitPlot · Yoke designer
          </h1>
          <p>Development preview</p>
        </div>
        <nav>
          <Link
            href="/"
            onClick={(event) => {
              if (
                !flush() &&
                !window.confirm(
                  "Your yoke could not be saved. Stay here and download it to keep your work. Leave without saving?",
                )
              )
                event.preventDefault();
            }}
          >
            Chart maker
          </Link>
          <button className="secondary-button" onClick={download}>
            Download yoke draft
          </button>
          <button
            className="secondary-button"
            onClick={() => input.current?.click()}
          >
            Open yoke draft
          </button>
        </nav>
        <input
          hidden
          ref={input}
          type="file"
          accept=".knitplot-yoke,application/json"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            try {
              if (file.size > 2_000_000)
                throw new Error("That draft is too large.");
              const next = yokeProjectSchema.parse(
                JSON.parse(await file.text()),
              );
              if (latestProject.current !== project) {
                setMessage(
                  "Your drawing changed while the file was opening. Open the file again when you are ready to replace it.",
                );
                return;
              }
              replace(next);
            } catch {
              setMessage(
                "That file is not a valid KnitPlot yoke draft. Your current drawing is unchanged.",
              );
            }
          }}
        />
      </header>
      {error || message ? <p role="alert">{error || message}</p> : null}
      <div className="yoke-workspace">
        <YokePlanner
          key={JSON.stringify([project.measurements, project.events])}
          measurements={project.measurements}
          events={project.events}
          onApply={apply}
          inputId={measurementInputId}
          onMeasurementFocus={(field, mode) => {
            setMeasurementGuide({ field, mode, source: project.measurements });
            setGuideOpen(true);
          }}
          measurementHelp={
            <YokeMeasurementHelp
              active={
                measurementGuide?.source === project.measurements
                  ? measurementGuide.field
                  : "chest"
              }
              mode={
                (measurementGuide?.source === project.measurements
                  ? measurementGuide.mode
                  : undefined) ??
                project.measurements.measurementMode ??
                "body"
              }
              open={guideOpen}
              onOpen={setGuideOpen}
              onSelect={(field) =>
                document
                  .getElementById(`${measurementInputId}-${field}`)
                  ?.focus()
              }
            />
          }
        />
        <YokeShortRowPlanner
          key={JSON.stringify([project.measurements, project.shortRows])}
          measurements={project.measurements}
          setup={project.shortRows}
          onApply={(shortRows) => {
            remember();
            setProject({ ...project, shortRows });
          }}
        />
        <section className="yoke-panel yoke-drawing">
          <div className="yoke-summary">
            <strong>
              {plan.neck} → {plan.end} stitches
            </strong>
            <span>
              {plan.rounds} full rounds · {project.measurements.repeats} repeats
            </span>
          </div>
          <div
            className="yoke-view-tabs"
            role="group"
            aria-label="Yoke drawing view"
          >
            {(
              [
                ["whole", "Whole yoke"],
                ["front", "Half yoke"],
                ["repeat", "One repeat"],
                ["chart", "Standard chart"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                className={
                  view === id || (id === "front" && view === "back")
                    ? "primary-button"
                    : "secondary-button"
                }
                aria-pressed={
                  view === id || (id === "front" && view === "back")
                }
                onClick={() => setView(id)}
              >
                {label}
              </button>
            ))}
            {view === "front" || view === "back" ? (
              <label>
                Show
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
              </label>
            ) : null}
          </div>
          <div className="yoke-toolbar">
            {project.palette.map((hex, index) => (
              <div className="yoke-colour" key={index}>
                <button
                  style={{ backgroundColor: hex }}
                  aria-label={`Paint with yarn colour ${index + 1}`}
                  aria-pressed={activeColor === index}
                  onClick={() => setColor(index)}
                />
                <input
                  type="color"
                  value={hex}
                  aria-label={`Change yarn colour ${index + 1}`}
                  onChange={(event) => {
                    remember();
                    setProject({
                      ...project,
                      palette: project.palette.map((old, i) =>
                        i === index ? event.target.value : old,
                      ),
                    });
                  }}
                />
              </div>
            ))}
            <label>
              <input
                type="checkbox"
                checked={allRepeats}
                onChange={(event) => setAllRepeats(event.target.checked)}
              />
              Edit all repeats
            </label>
            <button
              disabled={!history.length}
              onClick={() => {
                const previous = history[history.length - 1];
                if (!previous) return;
                setFuture((old) => [...old, project]);
                setHistory(history.slice(0, -1));
                setProject(previous);
              }}
            >
              Undo
            </button>
            <button
              disabled={!future.length}
              onClick={() => {
                const next = future[future.length - 1];
                if (!next) return;
                setHistory((old) => [...old, project]);
                setFuture(future.slice(0, -1));
                setProject(next);
              }}
            >
              Redo
            </button>
            <label>
              Zoom
              <select
                aria-label="Yoke zoom"
                value={zoom}
                onChange={(event) => setZoom(Number(event.target.value))}
              >
                <option value={100}>100%</option>
                <option value={150}>150%</option>
                <option value={200}>200%</option>
                <option value={300}>300%</option>
              </select>
            </label>
          </div>
          <p className="yoke-hint">
            Design layout · M1L/M1R cells mark increases. Repeat and standard
            views edit the first repeat; the whole-yoke view can edit any
            repeat.
          </p>
          {view === "front" || view === "back" ? (
            <p className="yoke-hint">
              A stitch-aligned half of the yoke, including parts of the
              sleeves—not just the front or back body panel.
            </p>
          ) : null}
          {view === "chart" ? (
            <YokeStandardChart
              project={project}
              zoom={zoom}
              selectedColor={activeColor}
              onStrokeStart={remember}
              onPaint={(row, column) =>
                setProject((current) =>
                  paintYoke(current, row, column, activeColor, allRepeats),
                )
              }
            />
          ) : (
            <YokeCanvas
              project={project}
              view={view}
              zoom={zoom}
              onStrokeStart={remember}
              onPaint={(row, column) =>
                setProject((current) =>
                  paintYoke(current, row, column, activeColor, allRepeats),
                )
              }
            />
          )}
          <details>
            <summary>Current shaping plan</summary>
            <ul>
              {project.events.map((event, index) => (
                <li key={event.round}>
                  Round {event.round}: increase{" "}
                  {event.count -
                    (index ? project.events[index - 1].count : plan.neck)}{" "}
                  → {event.count} stitches (
                  {event.count / project.measurements.repeats} per repeat).
                </li>
              ))}
            </ul>
            <p>
              Body at split: {plan.bodyFromYoke} stitches. Each sleeve on hold:{" "}
              {plan.sleeveFromYoke}. Cast on {plan.underarm} at each underarm.
            </p>
            <p>
              {plan.shortRowPairs} short-row pairs planned before colourwork;
              shown at the back neckline in Whole yoke view, separately from the
              full chart rounds.
            </p>
          </details>
        </section>
      </div>
    </main>
  );
}
