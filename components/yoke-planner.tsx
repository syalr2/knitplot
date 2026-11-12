"use client";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { ZodError } from "zod";
import { MAX_GAUGE_VALUE } from "@/lib/gauge-schema";
import {
  calculateYokeTargets,
  convertYokeUnits,
  suggestYokeSchedule,
  parseIncreasePositions,
  yokeRoundCounts,
  type YokeMeasurements,
  type IncreaseEvent,
  type YokePlan,
} from "@/lib/yoke-plan";
import { YokeScheduleEditor, scheduleDrafts } from "./yoke-schedule-editor";
import {
  measurementDrafts as drafts,
  readMeasurementDrafts as read,
  yokeMeasurementFields,
  type YokeField,
} from "@/lib/yoke-measurement-fields";
import {
  switchYokeMeasurementMode,
  type YokeMeasurementMode,
} from "@/lib/yoke-measurement-mode";
import { yokeRoundingReview } from "@/lib/yoke-rounding";
import { YokeRoundingReview } from "./yoke-rounding-review";

type Candidate = {
  measurements: YokeMeasurements;
  targets: YokePlan;
  source: string;
};
type Props = {
  tourShowSchedule?: boolean;
  applyLabel?: string;
  measurements: YokeMeasurements;
  events: IncreaseEvent[];
  onApply: (measurements: YokeMeasurements, events: IncreaseEvent[]) => void;
  inputId: string;
  measurementHelp: ReactNode;
  onMeasurementFocus: (field: YokeField, mode: YokeMeasurementMode) => void;
};

export function YokePlanner({
  tourShowSchedule = false,
  applyLabel = "Apply plan to drawing",
  measurements,
  events,
  onApply,
  inputId,
  measurementHelp,
  onMeasurementFocus,
}: Props) {
  const [unit, setUnit] = useState(measurements.unit);
  const [mode, setMode] = useState<YokeMeasurementMode>(
    measurements.measurementMode ?? "body",
  );
  const [values, setValues] = useState(() => drafts(measurements));
  const [calculated, setCandidate] = useState<Candidate | null>(null);
  const [schedule, setSchedule] = useState(scheduleDrafts(events));
  const [increaseRounds, setIncreaseRounds] = useState(String(events.length));
  const [automatic, setAutomatic] = useState(true);
  const [error, setError] = useState("");
  const [roundingAccepted, setRoundingAccepted] = useState(false);
  const source = JSON.stringify({
    values,
    unit,
    mode,
    automatic,
    increaseRounds,
  });
  const candidate = useMemo(
    () =>
      calculated ??
      (tourShowSchedule
        ? { measurements, targets: calculateYokeTargets(measurements), source }
        : null),
    [calculated, tourShowSchedule, measurements, source],
  );
  const rounding = useMemo(
    () =>
      candidate
        ? yokeRoundingReview(candidate.measurements, candidate.targets)
        : null,
    [candidate],
  );
  const fields = yokeMeasurementFields(mode);
  const dirty = candidate !== null && candidate.source !== source;
  const number = (value: number) => value.toFixed(1);
  function calculate(event: FormEvent) {
    event.preventDefault();
    try {
      const next = read(values, unit, mode);
      const targets = calculateYokeTargets(next);
      const requested = Number(increaseRounds);
      const maximum = Math.min(
        targets.rounds - 1,
        (targets.end - targets.neck) / next.repeats,
      );
      const minimum = Math.ceil(Math.log2(targets.end / targets.neck));
      if (
        !automatic &&
        (!Number.isInteger(requested) ||
          requested < minimum ||
          requested > maximum)
      )
        throw new Error(
          `Choose ${minimum}–${maximum} increase rounds for these targets.`,
        );
      const nextSchedule = scheduleDrafts(
        suggestYokeSchedule(
          targets,
          next.repeats,
          automatic ? undefined : requested,
        ),
      );
      setCandidate({ measurements: next, targets, source });
      setSchedule(nextSchedule);
      setRoundingAccepted(false);
      setError("");
    } catch (error) {
      setCandidate(null);
      setError(
        error instanceof Error && !(error instanceof ZodError)
          ? error.message
          : `Check the measurements: gauge values must be greater than 0 and at most ${MAX_GAUGE_VALUE}, lengths must be positive, and repeats must be 2–40 whole numbers.`,
      );
    }
  }
  function apply() {
    if (!candidate || dirty || (rounding?.changes.length && !roundingAccepted))
      return;
    try {
      const nextEvents = schedule.map((event) => ({
        round: Number(event.round),
        count: Number(event.count),
        stitch: event.stitch,
        ...parseIncreasePositions(event.positions, event.stitch),
      }));
      yokeRoundCounts(
        candidate.targets,
        candidate.measurements.repeats,
        nextEvents,
      );
      onApply(candidate.measurements, nextEvents);
      setError("");
    } catch (error) {
      setError(
        error instanceof Error && !(error instanceof ZodError)
          ? error.message
          : "Enter valid whole rounds and stitch counts.",
      );
    }
  }
  return (
    <section className="yoke-panel">
      <h2>Plan the yoke</h2>
      <p className="yoke-hint">
        Top-down pullover · one consistent blocked gauge
      </p>
      <div className="yoke-planner-measurements">
        <form onSubmit={calculate}>
          <div
            className="yoke-measurement-control"
            data-tour="yoke-measurements"
          >
            <span>Measurement input</span>
            <label className="knit-wake-toggle yoke-measurement-toggle">
              <span>Body + ease</span>
              <input
                type="checkbox"
                role="switch"
                aria-label="Measurement input"
                checked={mode === "finished"}
                onChange={(event) => {
                  const nextMode = event.target.checked ? "finished" : "body";
                  try {
                    const next = switchYokeMeasurementMode(
                      read(values, unit, mode),
                      nextMode,
                    );
                    setValues(drafts(next));
                    setMode(nextMode);
                    setError("");
                    onMeasurementFocus("chest", nextMode);
                  } catch (error) {
                    setError(
                      error instanceof Error
                        ? error.message
                        : "Complete the measurements before changing input mode.",
                    );
                  }
                }}
              />
              <span className="knit-toggle-track" aria-hidden="true" />
              <span>Finished sizes</span>
            </label>
            <small>
              {mode === "body"
                ? "Add ease to your body measurements to choose the finished size."
                : "Enter the desired finished size. No extra ease is added."}
            </small>
          </div>
          <div className="yoke-measurement-control">
            <span>Measurements in</span>
            <label className="knit-wake-toggle yoke-measurement-toggle">
              <span>cm</span>
              <input
                type="checkbox"
                role="switch"
                aria-label="Measurement units"
                checked={unit === "in"}
                onChange={(event) => {
                  const nextUnit = event.target.checked ? "in" : "cm";
                  try {
                    const converted = convertYokeUnits(
                      read(values, unit, mode),
                      nextUnit,
                    );
                    setValues(drafts(converted));
                    setUnit(nextUnit);
                    setError("");
                  } catch {
                    setError(
                      "Complete the measurements before changing units.",
                    );
                  }
                }}
              />
              <span className="knit-toggle-track" aria-hidden="true" />
              <span>inches</span>
            </label>
          </div>
          <div className="yoke-fields">
            {fields.map(({ key, label, help, optional }) => (
              <label key={key}>
                {label}
                {optional ? " (optional)" : ""}
                <input
                  aria-label={`${label}${optional ? " (optional)" : ""}`}
                  aria-describedby={help ? `${inputId}-${key}-help` : undefined}
                  id={`${inputId}-${key}`}
                  onFocus={() => onMeasurementFocus(key, mode)}
                  type="number"
                  step="any"
                  value={values[key]}
                  onChange={(event) =>
                    setValues({ ...values, [key]: event.target.value })
                  }
                />
                {help ? (
                  <small id={`${inputId}-${key}-help`}>{help}</small>
                ) : null}
              </label>
            ))}
          </div>
          <label>
            Increase scheduling
            <select
              value={automatic ? "automatic" : "grouped"}
              onChange={(event) =>
                setAutomatic(event.target.value === "automatic")
              }
            >
              <option value="automatic">Automatic</option>
              <option value="grouped">Choose number of increase rounds</option>
            </select>
            <small>
              Automatic suggests smaller increases as the yoke widens, rounded
              to complete repeats. Shallow yokes may need larger increases.
            </small>
          </label>
          {!automatic ? (
            <label>
              Number of increase rounds
              <input
                type="number"
                step="1"
                value={increaseRounds}
                onChange={(event) => setIncreaseRounds(event.target.value)}
              />
              <small>
                Your choice, not a fit recommendation. More rounds distribute
                the same total increase across smaller steps.
              </small>
            </label>
          ) : null}
          <button className="primary-button" type="submit">
            Calculate targets
          </button>
        </form>
        {measurementHelp}
      </div>
      {error ? <p role="alert">{error}</p> : null}
      {candidate ? (
        <div className="yoke-candidate">
          <h3>Calculated targets</h3>
          <p>
            {candidate.targets.neck} → {candidate.targets.end} stitches ·{" "}
            {candidate.targets.rounds} full rounds
          </p>
          <p>
            Finished neck {number(candidate.targets.actualNeck)}{" "}
            {candidate.measurements.unit} · body{" "}
            {number(candidate.targets.actualBody)} {candidate.measurements.unit}{" "}
            · upper sleeve {number(candidate.targets.actualSleeve)}{" "}
            {candidate.measurements.unit}
          </p>
          <p>
            Full-round fabric length: {number(candidate.targets.actualDepth)}{" "}
            {candidate.measurements.unit}, before extra back-neck short rows.
          </p>
          <p>
            Repeat rounding: neck{" "}
            {candidate.targets.neckAdjustment >= 0 ? "+" : ""}
            {candidate.targets.neckAdjustment} stitches; body{" "}
            {candidate.targets.bodyAdjustment >= 0 ? "+" : ""}
            {candidate.targets.bodyAdjustment} stitches. Sleeve targets
            unchanged.
          </p>
          <p>
            Separate {candidate.targets.bodyFromYoke} body stitches and{" "}
            {candidate.targets.sleeveFromYoke} per sleeve. Add{" "}
            {candidate.targets.underarm} at each underarm.
          </p>
          {rounding ? (
            <YokeRoundingReview
              review={rounding}
              unit={candidate.measurements.unit}
              accepted={roundingAccepted}
              onAccept={setRoundingAccepted}
              onRepeats={(repeats) => {
                setValues((previous) => ({
                  ...previous,
                  repeats: String(repeats),
                }));
                setRoundingAccepted(false);
              }}
            />
          ) : null}
          <h3 data-tour="yoke-increase-schedule">Increase schedule</h3>
          <p>
            {schedule.length} increase rounds calculated.
            {candidate.targets.shoulder
              ? ` Shoulder checkpoint: ${candidate.targets.shoulder.count} stitches on round ${candidate.targets.shoulder.round}.`
              : " Estimated upper-heavy shaping; add a shoulder checkpoint to constrain it to your reference measurements."}
          </p>
          <p className="yoke-hint">
            Counts are after working each increase round. You can move or
            regroup increases for your design; changing the schedule can change
            the fit.
          </p>
          <YokeScheduleEditor
            schedule={schedule}
            onChange={setSchedule}
            neck={candidate.targets.neck}
            repeats={candidate.measurements.repeats}
          />
          <p>
            {candidate.targets.shortRowPairs
              ? `Short-row allowance: ${candidate.targets.shortRowPairs} pairs (${number(candidate.targets.actualBackRise)} ${candidate.measurements.unit} extra at centre back). After applying this plan, edit the turns in Neckline short rows below.`
              : "No neckline short rows."}
          </p>
          {dirty ? (
            <p>
              Measurements changed. Calculate targets again before applying.
            </p>
          ) : null}
          <button
            className="primary-button"
            disabled={
              dirty || Boolean(rounding?.changes.length && !roundingAccepted)
            }
            onClick={apply}
          >
            {applyLabel}
          </button>
        </div>
      ) : null}
    </section>
  );
}
