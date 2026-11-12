"use client";
import { useState } from "react";
import type { ChartDocument } from "@/lib/chart";
import { readChartDocument } from "@/lib/chart-schema";
import { convertYokeUnits, type YokeMeasurements } from "@/lib/yoke-plan";
import { regaugeYoke, yokeDocument } from "@/lib/yoke-document";

export function YokeGaugePanel({
  document,
  onChange,
  onRecalculate,
}: {
  document: ChartDocument;
  onChange: (document: ChartDocument) => void;
  onRecalculate: (measurements: YokeMeasurements) => void;
}) {
  const project = document.yoke!;
  const m = project.measurements;
  const [draft, setDraft] = useState({
    gaugeStitches: String(m.gaugeStitches),
    gaugeRows: String(m.gaugeRows),
    gaugeMeasure: String(m.gaugeMeasure),
  });
  const [error, setError] = useState("");
  function read() {
    const gauge = Object.fromEntries(
      Object.entries(draft).map(([key, value]) => [
        key,
        value.trim() ? Number(value) : NaN,
      ]),
    ) as Pick<YokeMeasurements, "gaugeStitches" | "gaugeRows" | "gaugeMeasure">;
    const result = regaugeYoke(project, gauge);
    readChartDocument(yokeDocument(result, document.name));
    return { gauge, result };
  }
  return (
    <details className="settings-group gauge-settings yoke-gauge-panel" open>
      <summary>
        Gauge <span aria-hidden="true">⌄</span>
      </summary>
      <div className="settings-content">
        <div className="two-fields">
          {(
            [
              ["gaugeStitches", "Gauge stitches"],
              ["gaugeRows", "Gauge rows"],
            ] as const
          ).map(([key, label]) => (
            <label className="yoke-gauge-field" key={key}>
              {label}
              <input
                type="number"
                step="any"
                value={draft[key]}
                onChange={(event) =>
                  setDraft((old) => ({ ...old, [key]: event.target.value }))
                }
              />
            </label>
          ))}
        </div>
        <div className="two-fields">
          <label className="yoke-gauge-field">
            Measured over
            <input
              type="number"
              step="any"
              value={draft.gaugeMeasure}
              onChange={(event) =>
                setDraft((old) => ({
                  ...old,
                  gaugeMeasure: event.target.value,
                }))
              }
            />
          </label>
          <label className="yoke-gauge-field">
            Units
            <select
              value={m.unit}
              onChange={(event) => {
                try {
                  onChange(
                    readChartDocument(
                      yokeDocument(
                        {
                          ...project,
                          measurements: convertYokeUnits(
                            read().result.measurements,
                            event.target.value as "cm" | "in",
                          ),
                        },
                        document.name,
                      ),
                    ),
                  );
                } catch {
                  setError("The gauge could not be converted.");
                }
              }}
            >
              <option value="cm">cm</option>
              <option value="in">inches</option>
            </select>
          </label>
        </div>
        <p className="yoke-hint">
          Update gauge keeps the stitches and re-measures the yoke.
        </p>
        <button
          className="secondary-button yoke-update-gauge"
          onClick={() => {
            try {
              onChange(yokeDocument(read().result, document.name));
              setError("");
            } catch (error) {
              setError(
                error instanceof Error ? error.message : "Check the gauge.",
              );
            }
          }}
        >
          Update gauge
        </button>
        <button
          className="text-button"
          onClick={() => {
            try {
              onRecalculate({ ...m, ...read().gauge });
              setError("");
            } catch {
              setError("Complete the gauge first.");
            }
          }}
        >
          Recalculate shaping to keep measurements…
        </button>
        {error ? <p role="alert">{error}</p> : null}
      </div>
    </details>
  );
}
