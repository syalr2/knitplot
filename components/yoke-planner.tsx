"use client";
import { useState, type FormEvent } from "react";
import { ZodError } from "zod";
import {
  calculateYokeTargets,
  convertYokeUnits,
  suggestYokeSchedule,
  yokeRoundCounts,
  type YokeMeasurements,
  type IncreaseEvent,
  type YokePlan,
} from "@/lib/yoke-plan";

type NumberKey = Exclude<keyof YokeMeasurements, "unit">;
const fields: { key: NumberKey; label: string; help?: string }[] = [
  { key: "gaugeStitches", label: "Gauge stitches" },
  { key: "gaugeRows", label: "Gauge rows" },
  { key: "gaugeMeasure", label: "Gauge measured over" },
  {
    key: "neck",
    label: "Finished neck opening",
    help: "Circumference at the base of the neckband; neckband not included.",
  },
  { key: "chest", label: "Body chest / bust" },
  { key: "bodyEase", label: "Body ease" },
  { key: "upperArm", label: "Body upper arm" },
  { key: "sleeveEase", label: "Sleeve ease" },
  {
    key: "underarm",
    label: "Each underarm width",
    help: "Width cast on at each underarm when separating sleeves.",
  },
  {
    key: "depth",
    label: "Full-round yoke length",
    help: "Along the fabric from the base of the front neckline to the sleeve split. Not vertical armhole depth; excludes extra back short rows.",
  },
  {
    key: "backRise",
    label: "Extra back-neck height",
    help: "Optional plain-colour short rows before the motif. Enter 0 to omit.",
  },
  { key: "repeats", label: "Repeats around yoke" },
];
function drafts(measurements: YokeMeasurements) {
  return Object.fromEntries(
    fields.map(({ key }) => [key, String(measurements[key])]),
  ) as Record<NumberKey, string>;
}
function read(
  values: Record<NumberKey, string>,
  unit: "cm" | "in",
): YokeMeasurements {
  if (Object.values(values).some((value) => value.trim() === ""))
    throw new Error(
      "Fill in every measurement, using 0 for no ease or no short rows.",
    );
  return {
    ...Object.fromEntries(
      Object.entries(values).map(([key, value]) => [key, Number(value)]),
    ),
    unit,
  } as YokeMeasurements;
}
type Candidate = {
  measurements: YokeMeasurements;
  targets: YokePlan;
  source: string;
};
type Props = {
  measurements: YokeMeasurements;
  events: IncreaseEvent[];
  onApply: (measurements: YokeMeasurements, events: IncreaseEvent[]) => void;
};

export function YokePlanner({ measurements, events, onApply }: Props) {
  const [unit, setUnit] = useState(measurements.unit);
  const [values, setValues] = useState(() => drafts(measurements));
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [schedule, setSchedule] = useState(
    events.map((event) => ({
      round: String(event.round),
      count: String(event.count),
    })),
  );
  const [error, setError] = useState("");
  const source = JSON.stringify({ values, unit });
  const dirty = candidate !== null && candidate.source !== source;
  const number = (value: number) => value.toFixed(1);
  function calculate(event: FormEvent) {
    event.preventDefault();
    try {
      const next = read(values, unit);
      const targets = calculateYokeTargets(next);
      setCandidate({ measurements: next, targets, source });
      setSchedule(
        suggestYokeSchedule(targets, next.repeats).map((entry) => ({
          round: String(entry.round),
          count: String(entry.count),
        })),
      );
      setError("");
    } catch (error) {
      setError(
        error instanceof Error && !(error instanceof ZodError)
          ? error.message
          : "Check the measurements: use finite numbers, positive gauge and lengths, and 2–40 whole repeats.",
      );
    }
  }
  function apply() {
    if (!candidate || dirty) return;
    try {
      const nextEvents = schedule.map((event) => ({
        round: Number(event.round),
        count: Number(event.count),
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
      <form onSubmit={calculate}>
        <label>
          Measurements in{" "}
          <select
            value={unit}
            onChange={(event) => {
              const nextUnit = event.target.value as "cm" | "in";
              try {
                const converted = convertYokeUnits(
                  read(values, unit),
                  nextUnit,
                );
                setValues(drafts(converted));
                setUnit(nextUnit);
                setError("");
              } catch {
                setError("Complete the measurements before changing units.");
              }
            }}
          >
            <option value="cm">cm</option>
            <option value="in">inches</option>
          </select>
        </label>
        <div className="yoke-fields">
          {fields.map(({ key, label, help }) => (
            <label key={key}>
              {label}
              <input
                type="number"
                step="any"
                value={values[key]}
                onChange={(event) =>
                  setValues({ ...values, [key]: event.target.value })
                }
              />
              {help ? <small>{help}</small> : null}
            </label>
          ))}
        </div>
        <button className="primary-button" type="submit">
          Calculate targets
        </button>
      </form>
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
          <h3>Increase schedule</h3>
          <p className="yoke-hint">
            Editable starting spacing, not a tested fitting prescription. Counts
            are after working each increase round.
          </p>
          <div className="yoke-schedule">
            {schedule.map((entry, index) => (
              <div key={index}>
                <label>
                  Round
                  <input
                    aria-label={`Increase ${index + 1} round`}
                    type="number"
                    value={entry.round}
                    onChange={(event) =>
                      setSchedule(
                        schedule.map((old, i) =>
                          i === index
                            ? { ...old, round: event.target.value }
                            : old,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Stitches after
                  <input
                    aria-label={`Increase ${index + 1} stitches`}
                    type="number"
                    value={entry.count}
                    onChange={(event) =>
                      setSchedule(
                        schedule.map((old, i) =>
                          i === index
                            ? { ...old, count: event.target.value }
                            : old,
                        ),
                      )
                    }
                  />
                </label>
                <button
                  onClick={() =>
                    setSchedule(schedule.filter((_, i) => i !== index))
                  }
                  aria-label={`Remove increase ${index + 1}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button
            className="secondary-button"
            onClick={() => setSchedule([...schedule, { round: "", count: "" }])}
          >
            + Increase round
          </button>
          <p>
            {candidate.targets.shortRowPairs
              ? `Short-row planning allowance: ${candidate.targets.shortRowPairs} pairs (${number(candidate.targets.actualBackRise)} ${candidate.measurements.unit} extra at centre back). Turn positions and knitting instructions are not generated yet.`
              : "No neckline short rows."}
          </p>
          {dirty ? (
            <p>
              Measurements changed. Calculate targets again before applying.
            </p>
          ) : null}
          <button className="primary-button" disabled={dirty} onClick={apply}>
            Apply plan to drawing
          </button>
        </div>
      ) : null}
    </section>
  );
}
