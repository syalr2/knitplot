"use client";
import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
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
import { YokeCanvas } from "./yoke-canvas";
import { useYokeDraft } from "./use-yoke-draft";

const initial = createYokeProject(
  defaultYokeMeasurements,
  suggestYokeSchedule(
    calculateYokeTargets(defaultYokeMeasurements),
    defaultYokeMeasurements.repeats,
  ),
);
export function YokeDesigner() {
  const { project, setProject, ready, error } = useYokeDraft(initial);
  const [view, setView] = useState<YokeView>("repeat");
  const [color, setColor] = useState(1);
  const [allRepeats, setAllRepeats] = useState(true);
  const [zoom, setZoom] = useState(100);
  const [history, setHistory] = useState<YokeProject[]>([]);
  const [future, setFuture] = useState<YokeProject[]>([]);
  const [message, setMessage] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const latestProject = useRef(project);
  useLayoutEffect(() => {
    latestProject.current = project;
  }, [project]);
  const plan = calculateYokeTargets(project.measurements);
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
    replace({
      ...createYokeProject(measurements, events),
      palette: project.palette,
    });
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
          <Link href="/">Chart maker</Link>
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
                ["repeat", "One repeat"],
                ["chart", "Standard chart"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                className={view === id ? "primary-button" : "secondary-button"}
                aria-pressed={view === id}
                onClick={() => setView(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="yoke-toolbar">
            {project.palette.map((hex, index) => (
              <div className="yoke-colour" key={index}>
                <button
                  style={{ backgroundColor: hex }}
                  aria-label={`Paint with yarn colour ${index + 1}`}
                  aria-pressed={color === index}
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
            Design layout · warm lines mark increase rounds. Repeat and standard
            views edit the first repeat; the whole-yoke view can edit any
            repeat.
          </p>
          <YokeCanvas
            project={project}
            view={view}
            zoom={zoom}
            onStrokeStart={remember}
            onPaint={(row, column) =>
              setProject((current) =>
                paintYoke(current, row, column, color, allRepeats),
              )
            }
          />
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
              not included in these full-round drawing views.
            </p>
          </details>
        </section>
      </div>
    </main>
  );
}
