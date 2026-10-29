"use client";
import type { Dispatch, SetStateAction } from "react";
import {
  MAX_CHART_ROWS,
  MAX_CHART_STITCHES,
  finishedSize,
  type ChartDocument,
} from "@/lib/chart";
type GaugeDraft = { stitches: string; rows: string; measure: string };
type DimensionDraft = { width: string; height: string };
type Props = {
  document: ChartDocument;
  setDocument: Dispatch<SetStateAction<ChartDocument>>;
  dimensionDraft: DimensionDraft;
  setDimensionDraft: Dispatch<SetStateAction<DimensionDraft>>;
  gaugeDraft: GaugeDraft;
  setGaugeDraft: Dispatch<SetStateAction<GaugeDraft>>;
  applyGaugeDraft: (field: keyof GaugeDraft) => void;
  setResizeDialogOpen: Dispatch<SetStateAction<boolean>>;
  dimensionsValid: boolean;
  dimensionsChanged: boolean;
};
export function ChartMeasurementsPanel({
  document,
  setDocument,
  dimensionDraft,
  setDimensionDraft,
  gaugeDraft,
  setGaugeDraft,
  applyGaugeDraft,
  setResizeDialogOpen,
  dimensionsValid,
  dimensionsChanged,
}: Props) {
  const size = finishedSize(document);
  return (
    <>
      <details className="settings-group" data-tour="chart-size" open>
        <summary>
          Chart size <span aria-hidden="true">⌄</span>
        </summary>
        <div className="settings-content">
          <div className="two-fields">
            <label>
              Stitches
              <input
                type="number"
                min="1"
                max={MAX_CHART_STITCHES}
                value={dimensionDraft.width}
                onChange={(event) =>
                  setDimensionDraft((current) => ({
                    ...current,
                    width: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              Rows
              <input
                type="number"
                min="1"
                max={MAX_CHART_ROWS}
                value={dimensionDraft.height}
                onChange={(event) =>
                  setDimensionDraft((current) => ({
                    ...current,
                    height: event.target.value,
                  }))
                }
              />
            </label>
          </div>
          <button
            className="resize-chart-button"
            onClick={() => setResizeDialogOpen(true)}
            disabled={!dimensionsValid || !dimensionsChanged}
          >
            Resize chart
          </button>
        </div>
      </details>

      <details className="settings-group gauge-settings" open>
        <summary>
          Gauge <span aria-hidden="true">⌄</span>
        </summary>
        <div className="settings-content">
          <div className="two-fields">
            <label>
              Stitches
              <input
                type="number"
                min="1"
                value={gaugeDraft.stitches}
                onChange={(event) =>
                  setGaugeDraft((current) => ({
                    ...current,
                    stitches: event.target.value,
                  }))
                }
                onBlur={() => applyGaugeDraft("stitches")}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
              />
            </label>
            <label>
              Rows
              <input
                type="number"
                min="1"
                value={gaugeDraft.rows}
                onChange={(event) =>
                  setGaugeDraft((current) => ({
                    ...current,
                    rows: event.target.value,
                  }))
                }
                onBlur={() => applyGaugeDraft("rows")}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
              />
            </label>
          </div>
          <div className="measure-field">
            <span>over</span>
            <input
              aria-label="Gauge measurement"
              type="number"
              min="1"
              value={gaugeDraft.measure}
              onChange={(event) =>
                setGaugeDraft((current) => ({
                  ...current,
                  measure: event.target.value,
                }))
              }
              onBlur={() => applyGaugeDraft("measure")}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
            />
            <select
              aria-label="Gauge unit"
              value={document.gaugeUnit}
              onChange={(event) =>
                setDocument((current) => ({
                  ...current,
                  gaugeUnit: event.target.value as "cm" | "in",
                }))
              }
            >
              <option value="cm">cm</option>
              <option value="in">in</option>
            </select>
          </div>
          <p className="measurement">
            Finished size: {size.width.toFixed(1)} × {size.height.toFixed(1)}{" "}
            {document.gaugeUnit}
          </p>
        </div>
      </details>

      <details className="settings-group">
        <summary>
          Pattern guides <span aria-hidden="true">⌄</span>
        </summary>
        <div className="settings-content">
          <label className="stacked-field">
            Live symmetry
            <select
              value={document.guides.symmetry}
              onChange={(event) =>
                setDocument((current) => ({
                  ...current,
                  guides: {
                    ...current.guides,
                    symmetry: event.target
                      .value as ChartDocument["guides"]["symmetry"],
                  },
                }))
              }
            >
              <option value="none">Off</option>
              <option value="horizontal">Mirror left and right</option>
              <option value="vertical">Mirror top and bottom</option>
              <option value="both">Mirror both ways</option>
            </select>
          </label>
          <p className="setting-help">
            Symmetry affects drawing and erasing. Blue dashed lines mark the
            active mirror axes.
          </p>
        </div>
      </details>
    </>
  );
}
