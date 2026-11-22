"use client";

import { useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import {
  stitchActionOptions,
  stitchActionSymbol,
  type ChartDocument,
  type StitchAction,
} from "@/lib/chart";
import { yokeChart } from "@/lib/yoke-chart";
import type { YokeView } from "@/lib/yoke-layout";
import { yokeRepeatSides } from "@/lib/yoke-repeat-labels";
import { ChartGrid } from "./chart-grid";
import { YokeCanvas } from "./yoke-canvas";

const KnitPreview = dynamic(
  () => import("./connected-knit-preview").then((m) => m.ConnectedKnitPreview),
  { ssr: false },
);
const YokePreview = dynamic(
  () => import("./yoke-knitted-preview").then((m) => m.YokeKnittedPreview),
  { ssr: false },
);
const yokeViews = [
  ["chart", "Standard chart"],
  ["repeat", "One repeat"],
  ["front", "Half yoke"],
  ["whole", "Whole yoke"],
] as const;

export function ClubChartViewer({
  document,
  coverView,
  heart,
}: {
  document: ChartDocument;
  coverView?: string;
  heart?: ReactNode;
}) {
  const yoke = document.yoke;
  const [view, setView] = useState<YokeView>("chart");
  const [zoom, setZoom] = useState(100);
  const [fitRequest, setFitRequest] = useState(1);
  const [sideways, setSideways] = useState(false);
  const [repeat, setRepeat] = useState(() =>
    yoke ? yokeRepeatSides(yoke.measurements.repeats)[0].repeats[0].section : 0,
  );
  const grid = useMemo(
    () =>
      yoke && view === "chart" ? yokeChart(yoke, repeat).document : document,
    [document, yoke, repeat, view],
  );
  const used = useMemo(() => {
    const actions = new Set<StitchAction>();
    for (const row of grid.stitchActions ?? [])
      for (const action of row) actions.add(action);
    return actions;
  }, [grid]);
  const curved = Boolean(yoke && view !== "chart");
  const minZoom = curved ? 1 : 25;
  const maxZoom = curved ? 400 : 800;
  function fit() {
    if (curved) setFitRequest((value) => value + 1);
    else setZoom(100);
  }

  return (
    <div className="club-chart-viewer">
      <section
        className="editor panel club-viewer-chart"
        aria-label="Read-only chart"
      >
        <div className="panel-heading club-viewer-toolbar">
          {yoke ? (
            <div
              className="tool-group"
              role="group"
              aria-label="Yoke chart views"
            >
              {yokeViews.map(([value, label]) => {
                const selected =
                  value === view || (value === "front" && view === "back");
                return (
                  <button
                    key={value}
                    type="button"
                    className={selected ? "active" : ""}
                    aria-pressed={selected}
                    onClick={() => {
                      if (selected) return;
                      setView(value);
                      setZoom(100);
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          ) : (
            <h2>Chart</h2>
          )}
          <div className="zoom-controls">
            <button
              type="button"
              aria-label="Zoom out"
              disabled={zoom <= minZoom}
              onClick={() =>
                setZoom(
                  Math.max(
                    minZoom,
                    Math.min(zoom - 1, Math.round(zoom / 1.25)),
                  ),
                )
              }
            >
              −
            </button>
            <span>{zoom}%</span>
            <button
              type="button"
              aria-label="Zoom in"
              disabled={zoom >= maxZoom}
              onClick={() =>
                setZoom(
                  Math.min(
                    maxZoom,
                    Math.max(zoom + 1, Math.round(zoom * 1.25)),
                  ),
                )
              }
            >
              +
            </button>
            <button type="button" onClick={fit}>
              Fit
            </button>
          </div>
          <div className="club-viewer-heart">{heart}</div>
        </div>
        {yoke && view !== "whole" && (
          <div className="club-viewer-options">
            {view === "front" || view === "back" ? (
              <label>
                Side{" "}
                <select
                  value={view}
                  onChange={(e) =>
                    setView(e.target.value === "back" ? "back" : "front")
                  }
                >
                  <option value="front">Front</option>
                  <option value="back">Back</option>
                </select>
              </label>
            ) : (
              <label>
                Repeat{" "}
                <select
                  value={repeat}
                  onChange={(e) => setRepeat(Number(e.target.value))}
                >
                  {yokeRepeatSides(yoke.measurements.repeats).map(
                    ({ name, repeats }) => (
                      <optgroup key={name} label={name}>
                        {repeats.map(({ number, section }) => (
                          <option key={section} value={section}>
                            {number} · {name}
                          </option>
                        ))}
                      </optgroup>
                    ),
                  )}
                </select>
              </label>
            )}
            {view === "repeat" && (
              <button
                type="button"
                aria-pressed={sideways}
                onClick={() => {
                  setSideways(!sideways);
                  setFitRequest((v) => v + 1);
                }}
              >
                {sideways ? "Upright" : "Sideways"}
              </button>
            )}
          </div>
        )}
        {yoke && curved ? (
          <YokeCanvas
            key={view}
            project={yoke}
            view={view}
            zoom={zoom}
            repeat={repeat}
            sideways={sideways}
            fitRequest={fitRequest}
            onZoomChange={setZoom}
          />
        ) : (
          <ChartGrid document={grid} zoom={zoom} />
        )}
        {!curved && [...used].some((action) => action !== "knit") && (
          <ul className="club-chart-key" aria-label="Stitch key">
            {stitchActionOptions.map(({ value, label }) =>
              value !== "knit" && used.has(value) ? (
                <li key={value}>
                  <strong>{stitchActionSymbol(value)}</strong> {label}
                </li>
              ) : null,
            )}
          </ul>
        )}
      </section>
      {yoke ? (
        <YokePreview
          document={document}
          initialView={
            coverView === "front" || coverView === "back" ? coverView : "whole"
          }
        />
      ) : (
        <ClubRegularPreview
          document={document}
          initialAcross={coverView === "repeat" ? 2 : 1}
        />
      )}
    </div>
  );
}

function ClubRegularPreview({
  document,
  initialAcross,
}: {
  document: ChartDocument;
  initialAcross: number;
}) {
  const [across, setAcross] = useState(initialAcross);
  const [down, setDown] = useState(1);
  const [mirrored, setMirrored] = useState(false);
  const [open, setOpen] = useState(true);
  return (
    <details
      className="preview panel"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="panel-heading collapsible-heading">
        <span>Knitted up</span>
        <span className="collapse-label">
          Show / hide <span aria-hidden="true">⌄</span>
        </span>
      </summary>
      {open && (
        <div className="preview-content">
          <div className="repeat-controls">
            <label>
              Across{" "}
              <select
                value={across}
                onChange={(e) => setAcross(Number(e.target.value))}
              >
                {[1, 2, 3].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <label>
              Down{" "}
              <select
                value={down}
                onChange={(e) => setDown(Number(e.target.value))}
              >
                {[1, 2, 3].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <label className="repeat-style">
              Repeat style{" "}
              <select
                value={mirrored ? "mirrored" : "normal"}
                onChange={(e) => setMirrored(e.target.value === "mirrored")}
              >
                <option value="normal">Normal</option>
                <option value="mirrored">Mirrored</option>
              </select>
            </label>
          </div>
          <KnitPreview
            document={document}
            repeatX={across}
            repeatY={down}
            mirrored={mirrored}
            showDiagnostics={false}
          />
        </div>
      )}
    </details>
  );
}
