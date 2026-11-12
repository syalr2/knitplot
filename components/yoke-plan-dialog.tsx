"use client";
import { useId, useState } from "react";
import type { ChartDocument } from "@/lib/chart";
import { readChartDocument } from "@/lib/chart-schema";
import {
  defaultYokeMeasurements,
  calculateYokeTargets,
  suggestYokeSchedule,
  type YokeMeasurements,
  type IncreaseEvent,
} from "@/lib/yoke-plan";
import { createYokeProject, type YokeProject } from "@/lib/yoke-project";
import {
  reshapeYoke,
  yokeDocument,
  yokeTransferCounts,
} from "@/lib/yoke-document";
import { YokePlanner } from "./yoke-planner";
import { YokeMeasurementHelp } from "./yoke-measurement-help";
import { YokeCanvas } from "./yoke-canvas";
import { YokeShortRowPlanner } from "./yoke-short-row-planner";
import type { YokeField } from "@/lib/yoke-measurement-fields";
import type { YokeMeasurementMode } from "@/lib/yoke-measurement-mode";
import type { YokeShortRows } from "@/lib/yoke-short-rows";

const noEdit = () => {};

function PlanCanvas({
  project,
  view,
  label,
}: {
  project: YokeProject;
  view: "repeat" | "whole";
  label: string;
}) {
  const [zoom, setZoom] = useState(25);
  const [fitRequest, setFitRequest] = useState(1);
  return (
    <figure>
      <figcaption>{label}</figcaption>
      <div
        className="zoom-controls yoke-plan-zoom"
        role="group"
        aria-label={`${label} zoom`}
      >
        <button
          type="button"
          aria-label="Zoom out"
          disabled={zoom <= 1}
          onClick={() => setZoom(Math.max(1, Math.floor(zoom / 1.25)))}
        >
          −
        </button>
        <output aria-label="Preview zoom">{zoom}%</output>
        <button
          type="button"
          aria-label="Zoom in"
          disabled={zoom >= 400}
          onClick={() => setZoom(Math.min(400, Math.ceil(zoom * 1.25)))}
        >
          +
        </button>
        <button
          type="button"
          onClick={() => setFitRequest((request) => request + 1)}
        >
          Fit preview
        </button>
      </div>
      <YokeCanvas
        project={project}
        view={view}
        zoom={zoom}
        fitRequest={fitRequest}
        onZoomChange={setZoom}
        onPaint={noEdit}
        onStrokeStart={noEdit}
      />
    </figure>
  );
}

export function YokePlanDialog({
  document,
  initialMeasurements,
  tabsFull,
  onCommit,
  onClose,
  tourStage,
}: {
  document?: ChartDocument;
  initialMeasurements?: YokeMeasurements;
  tabsFull: boolean;
  onCommit: (document: ChartDocument, newTab: boolean) => boolean;
  onClose: () => void;
  tourStage?: "measurements" | "schedule" | "preview";
}) {
  const [base] = useState(() => document);
  const measurements =
    initialMeasurements ?? base?.yoke?.measurements ?? defaultYokeMeasurements;
  const events =
    base?.yoke?.events ??
    suggestYokeSchedule(
      calculateYokeTargets(measurements),
      measurements.repeats,
    );
  const [draft, setPending] = useState<{
    measurements: YokeMeasurements;
    events: IncreaseEvent[];
  } | null>(null);
  const pending = tourStage === "preview" ? { measurements, events } : draft;
  const [mode, setMode] = useState<"keep" | "scale">("keep");
  const [shortRows, setShortRows] = useState<YokeShortRows>();
  const [error, setError] = useState("");
  const [guide, setGuide] = useState<{
    field: YokeField;
    mode: YokeMeasurementMode;
  }>({ field: "chest", mode: measurements.measurementMode });
  const [guideOpen, setGuideOpen] = useState(false);
  const id = useId();
  const proposal = pending
    ? base?.yoke
      ? reshapeYoke(base.yoke, pending.measurements, pending.events, mode)
      : createYokeProject(pending.measurements, pending.events)
    : null;
  if (proposal && shortRows) proposal.shortRows = shortRows;
  const structural =
    !base?.yoke ||
    !!base.yoke.program ||
    (!!proposal &&
      (proposal.measurements.repeats !== base.yoke.measurements.repeats ||
        JSON.stringify(proposal.cells.map((row) => row.length)) !==
          JSON.stringify(base.yoke.cells.map((row) => row.length))));
  const transfer =
    base?.yoke && proposal ? yokeTransferCounts(base.yoke, proposal) : null;
  function commit() {
    try {
      if (!proposal) return;
      if (base && JSON.stringify(base) !== JSON.stringify(document))
        throw new Error(
          "The chart changed while planning. Close and reopen Edit shaping before applying.",
        );
      const next = readChartDocument(
        yokeDocument(
          proposal,
          base
            ? `${base.name.slice(0, structural ? 192 : 200)}${structural ? " revised" : ""}`
            : "Untitled yoke",
        ),
      );
      if (onCommit(next, structural)) onClose();
      else
        setError(
          "Close a chart tab before creating this yoke. The original is unchanged.",
        );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "The yoke could not be applied.",
      );
    }
  }
  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="import-dialog yoke-plan-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
      >
        <div className="import-dialog-heading">
          <h1 id={`${id}-title`}>
            {base ? "Edit yoke shaping" : "Create circular yoke"}
          </h1>
          <button
            className="close-dialog"
            aria-label="Close yoke planning"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        {error ? <p role="alert">{error}</p> : null}
        {!pending ? (
          <>
            {base?.yoke?.program ? (
              <p>
                Replanning replaces hand-edited stitch instructions in a new
                copy. Your current yoke is kept.
              </p>
            ) : null}
            <YokePlanner
              tourShowSchedule={tourStage === "schedule"}
              measurements={measurements}
              events={events}
              inputId={id}
              onApply={(measurements, events) => {
                setPending({ measurements, events });
                setShortRows(undefined);
                setError("");
              }}
              onMeasurementFocus={(field, mode) => setGuide({ field, mode })}
              measurementHelp={
                <YokeMeasurementHelp
                  active={guide.field}
                  mode={guide.mode}
                  open={guideOpen}
                  onOpen={setGuideOpen}
                  onSelect={(field) =>
                    window.document.getElementById(`${id}-${field}`)?.focus()
                  }
                />
              }
              applyLabel="Preview yoke"
            />
          </>
        ) : proposal ? (
          <>
            {base ? (
              <fieldset className="yoke-transfer-options">
                <legend>Carry over the colourwork</legend>
                <label>
                  <input
                    type="radio"
                    name={`${id}-transfer`}
                    checked={mode === "keep"}
                    onChange={() => setMode("keep")}
                  />
                  Keep stitch size
                </label>
                <label>
                  <input
                    type="radio"
                    name={`${id}-transfer`}
                    checked={mode === "scale"}
                    onChange={() => setMode("scale")}
                  />
                  Scale design to fit
                </label>
                <p>
                  Each repeat stays separate. Keep stitch size centres motifs
                  within their repeat and keeps round 1 at the neck. Added space
                  and extra repeats use the main colour. Shaping stitches come
                  from the new plan.
                </p>
              </fieldset>
            ) : null}
            {base && transfer ? (
              <p>
                {mode === "keep"
                  ? `${transfer.cropped} original stitches outside the new shape; ${transfer.added} new stitches filled with the main colour.`
                  : "Colourwork is resampled per repeat to the new stitch and round counts."}
              </p>
            ) : null}
            <div className="yoke-plan-comparison">
              {base?.yoke ? (
                <PlanCanvas
                  project={base.yoke}
                  view="repeat"
                  label="Original · unchanged"
                />
              ) : null}
              <PlanCanvas
                project={proposal}
                view={base ? "repeat" : "whole"}
                label={base ? "Proposed" : "Your yoke"}
              />
            </div>
            <details open={tourStage === "preview" ? true : undefined}>
              <summary data-tour="yoke-short-rows">Neckline short rows</summary>
              <YokeShortRowPlanner
                key={JSON.stringify([
                  proposal.measurements,
                  proposal.shortRows,
                ])}
                measurements={proposal.measurements}
                setup={proposal.shortRows}
                onApply={setShortRows}
              />
            </details>
            <p>
              {structural && base
                ? "The revised yoke opens in a new tab. Your original stays open."
                : base
                  ? "The colourwork is kept. This change can be undone."
                  : "Your yoke opens in a new chart tab."}
            </p>
            {tabsFull && structural ? (
              <p role="alert">
                All eight chart tabs are in use. Close one before creating a
                yoke.
              </p>
            ) : null}
            <div className="yoke-short-row-actions">
              <button
                className="secondary-button"
                onClick={() => setPending(null)}
              >
                Back to plan
              </button>
              <button
                className="primary-button"
                disabled={tabsFull && structural}
                onClick={commit}
              >
                {base
                  ? structural
                    ? "Create revised yoke"
                    : "Apply shaping"
                  : "Create yoke"}
              </button>
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}
