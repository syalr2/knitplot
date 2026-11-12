"use client";
import { useState } from "react";
import { calculateYokeTargets, type YokeMeasurements } from "@/lib/yoke-plan";
import { planYokeShortRows, type YokeShortRows } from "@/lib/yoke-short-rows";

type Props = {
  measurements: YokeMeasurements;
  setup?: YokeShortRows;
  onApply: (setup: YokeShortRows) => void;
};

function readPlan(measurements: YokeMeasurements, distances?: string[]) {
  try {
    return {
      plan: planYokeShortRows(
        measurements,
        distances
          ? {
              distances: distances.map((value) =>
                value.trim() === "" ? NaN : Number(value),
              ),
            }
          : undefined,
      ),
      error: "",
    };
  } catch (error) {
    return {
      plan: null,
      error:
        error instanceof Error
          ? error.message
          : "Check the short-row turn positions.",
    };
  }
}

export function YokeShortRowPlanner({ measurements, setup, onApply }: Props) {
  const suggested = readPlan(measurements);
  const target = calculateYokeTargets(measurements);
  const initial =
    (setup?.distances ?? suggested.plan?.distances)?.map(String) ??
    Array<string>(Math.min(200, target.shortRowPairs)).fill("");
  const [distances, setDistances] = useState(() => initial);
  const { plan, error } = readPlan(measurements, distances);
  const changed = JSON.stringify(distances) !== JSON.stringify(initial);
  return (
    <section className="yoke-panel yoke-short-rows">
      <h2>Neckline short rows</h2>
      <p>Before the colourwork · German short rows · start at centre back</p>
      <p className="yoke-hint">
        Uses the applied measurements above. Short rows add back-neck height
        without adding stitches or full chart rounds.
      </p>
      {target.shortRowPairs > 200 ? (
        <p role="alert">{suggested.error}</p>
      ) : (
        <>
          <p>
            {target.shortRowPairs} pairs · {target.shortRowPairs * 2} extra rows
            at centre back · {target.actualBackRise.toFixed(1)}{" "}
            {measurements.unit} extra height
          </p>
          {distances.length ? (
            <>
              <p>
                Each distance is measured from centre back and includes the last
                stitch worked before turning. The same distance is used on both
                sides. Suggested turns widen from approximately 60% to 80% of
                the neck stitches. Enter decreasing distances for narrowing
                rows.
              </p>
              {suggested.error ? (
                <p className="yoke-hint">{suggested.error}</p>
              ) : null}
              <div className="yoke-short-row-inputs">
                {distances.map((value, index) => (
                  <label key={index}>
                    Pair {index + 1}: stitches each side
                    <input
                      type="number"
                      step="1"
                      value={value}
                      onChange={(event) => {
                        setDistances((old) =>
                          old.map((previous, i) =>
                            i === index ? event.target.value : previous,
                          ),
                        );
                      }}
                    />
                  </label>
                ))}
              </div>
              {error ? <p role="alert">{error}</p> : null}
              <div className="yoke-short-row-actions">
                <button
                  type="button"
                  className="primary-button"
                  disabled={!plan || (!changed && setup !== undefined)}
                  onClick={() => {
                    if (plan) {
                      onApply({ distances: plan.distances });
                    }
                  }}
                >
                  Save short-row setup
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={!suggested.plan}
                  onClick={() => {
                    if (suggested.plan)
                      setDistances(suggested.plan.distances.map(String));
                  }}
                >
                  Use suggested turns
                </button>
              </div>
            </>
          ) : null}
          {plan ? (
            <>
              {plan.distances.length ? (
                <svg
                  className="yoke-short-row-map"
                  viewBox={`0 0 600 ${70 + plan.distances.length * 24}`}
                  role="img"
                  aria-label={`Short-row turn map, unrolled around centre back. Each line is a pair of rows, ${plan.direction} symmetrically.`}
                >
                  <text x="300" y="18" textAnchor="middle">
                    Centre back / start of round
                  </text>
                  <path
                    d={`M300 30v${plan.distances.length * 24 + 20}`}
                    stroke="#837d6f"
                    strokeDasharray="3 4"
                  />
                  {plan.distances.map((distance, index) => {
                    const half = (distance / plan.neck) * 500;
                    const y = 45 + index * 24;
                    return (
                      <g key={index}>
                        <path
                          d={`M${300 - half} ${y}h${half * 2}`}
                          stroke="#c86f52"
                          strokeWidth="8"
                          strokeLinecap="round"
                        />
                        <text x={285 - half} y={y + 4} textAnchor="end">
                          {distance}
                        </text>
                        <text x={315 + half} y={y + 4}>
                          {distance}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              ) : null}
            </>
          ) : null}
        </>
      )}
      {setup && !changed ? <p role="status">Short-row setup saved.</p> : null}
    </section>
  );
}
