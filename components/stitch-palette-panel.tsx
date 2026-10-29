"use client";
import type { Dispatch, SetStateAction } from "react";
import {
  contrastTextColor,
  stitchActionOptions,
  stitchDisplayColor,
  type ChartDocument,
  type StitchAction,
  type StitchPaletteAction,
} from "@/lib/chart";
type Props = {
  document: ChartDocument;
  structureAction: StitchAction | null;
  stitchPickerOpen: boolean;
  stitchPalette: StitchPaletteAction[];
  setStructureAction: Dispatch<SetStateAction<StitchAction | null>>;
  setStitchPickerOpen: Dispatch<SetStateAction<boolean>>;
  addStitchToPalette: (action: StitchPaletteAction) => void;
  selectStitchAction: (action: StitchAction) => void;
  changeStitchColor: (action: StitchPaletteAction, hex: string) => void;
  removeStitchFromPalette: (action: StitchPaletteAction) => void;
  resetStitchColor: (action: StitchPaletteAction) => void;
};
export function StitchPalettePanel({
  document,
  structureAction,
  stitchPickerOpen,
  stitchPalette,
  setStructureAction,
  setStitchPickerOpen,
  addStitchToPalette,
  selectStitchAction,
  changeStitchColor,
  removeStitchFromPalette,
  resetStitchColor,
}: Props) {
  return (
    <details
      className="settings-group stitch-settings"
      data-tour="stitches"
      open
    >
      <summary>
        Stitches <span aria-hidden="true">⌄</span>
      </summary>
      <div className="settings-content">
        <div className="compact-section-action">
          <button
            className={`text-button ${stitchPickerOpen ? "active" : ""}`}
            onClick={() => {
              if (stitchPickerOpen) setStructureAction(null);
              setStitchPickerOpen((open) => !open);
            }}
          >
            + Add stitch
          </button>
        </div>
        {stitchPickerOpen ? (
          <div className="stitch-picker" aria-label="Stitch tools">
            <p>Add a stitch type to this chart’s palette.</p>
            <div>
              {stitchActionOptions
                .filter(
                  (
                    option,
                  ): option is typeof option & {
                    value: StitchPaletteAction;
                  } =>
                    option.value !== "knit" &&
                    !stitchPalette.includes(
                      option.value as StitchPaletteAction,
                    ),
                )
                .map((option) => (
                  <button
                    key={option.value}
                    title={option.help}
                    onClick={() => addStitchToPalette(option.value)}
                  >
                    {option.shortLabel}
                  </button>
                ))}
              {stitchPalette.length ===
              stitchActionOptions.filter((option) => option.value !== "knit")
                .length ? (
                <span>All stitch types have been added.</span>
              ) : null}
            </div>
          </div>
        ) : null}
        <div className="palette-list">
          {stitchPalette.map((action) => {
            const option = stitchActionOptions.find(
              (item) => item.value === action,
            );
            const displayColor = stitchDisplayColor(document, action);
            return (
              <div
                className={`palette-row ${structureAction === action ? "selected" : ""}`}
                key={action}
              >
                <button
                  className="swatch-button"
                  aria-label={`Draw ${option?.label ?? action}`}
                  onClick={() => selectStitchAction(action)}
                >
                  <span
                    className="stitch-swatch"
                    style={{
                      background: displayColor,
                      color: contrastTextColor(displayColor),
                    }}
                  >
                    {action === "no-stitch" ? "—" : option?.shortLabel}
                  </span>
                  <span className="palette-name">
                    <span>{option?.label ?? action}</span>
                    <span className="palette-hex">
                      {document.stitchColors?.[action]
                        ? displayColor.toUpperCase()
                        : action === "no-stitch"
                          ? "No fabric"
                          : "Use yarn colour"}
                    </span>
                  </span>
                </button>
                <input
                  type="color"
                  value={displayColor}
                  aria-label={`Change ${option?.label ?? action} display colour`}
                  onChange={(event) =>
                    changeStitchColor(action, event.target.value)
                  }
                />
                <button
                  className="remove-button"
                  aria-label={`Remove ${option?.label ?? action} from stitch palette`}
                  title="Remove from palette; existing chart symbols will stay"
                  onClick={() => removeStitchFromPalette(action)}
                >
                  ×
                </button>
                {document.stitchColors?.[action] ? (
                  <button
                    className="text-button stitch-color-reset"
                    title="Reset display colour"
                    onClick={() => resetStitchColor(action)}
                  >
                    {action === "no-stitch" ? "Reset" : "Use yarn colour"}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
        {!stitchPalette.length ? (
          <p className="empty-stitch-palette">
            Add purl, cast-on, bind-off, shaping, or no-stitch cells to draw
            them onto your chart.
          </p>
        ) : null}
        <button
          className={`remove-stitch-tool ${structureAction === "knit" ? "selected" : ""}`}
          aria-pressed={structureAction === "knit"}
          onClick={() => selectStitchAction("knit")}
        >
          Remove stitch
        </button>
      </div>
    </details>
  );
}
