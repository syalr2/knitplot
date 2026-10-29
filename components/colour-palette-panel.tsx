"use client";
import type { Dispatch, SetStateAction } from "react";
import type { ChartDocument, StitchAction } from "@/lib/chart";
type Props = {
  document: ChartDocument;
  selectedColor: string;
  structureAction: StitchAction | null;
  setSelectedColor: Dispatch<SetStateAction<string>>;
  setStructureAction: Dispatch<SetStateAction<StitchAction | null>>;
  setStitchPickerOpen: Dispatch<SetStateAction<boolean>>;
  addColor: () => void;
  changePaletteColor: (id: string, hex: string) => void;
  removeColor: (id: string) => void;
};
export function ColourPalettePanel({
  document,
  selectedColor,
  structureAction,
  setSelectedColor,
  setStructureAction,
  setStitchPickerOpen,
  addColor,
  changePaletteColor,
  removeColor,
}: Props) {
  return (
    <details className="settings-group" data-tour="colours" open>
      <summary>
        Colours <span aria-hidden="true">⌄</span>
      </summary>
      <div className="settings-content">
        <div className="compact-section-action">
          <button
            className="text-button"
            onClick={addColor}
            disabled={document.palette.length >= 8}
          >
            + Add colour
          </button>
        </div>
        <div className="palette-list">
          {document.palette.map((color, index) => (
            <div
              className={`palette-row ${selectedColor === color.id && !structureAction ? "selected" : ""}`}
              key={color.id}
            >
              <button
                className="swatch-button"
                aria-label={`Use colour ${index + 1}`}
                onClick={() => {
                  setSelectedColor(color.id);
                  setStructureAction(null);
                  setStitchPickerOpen(false);
                }}
              >
                <span className="swatch" style={{ background: color.hex }} />
                <span className="palette-name">
                  <span>
                    {index === 0 ? "Background" : `Colour ${index + 1}`}
                  </span>
                  <span className="palette-hex">{color.hex.toUpperCase()}</span>
                </span>
              </button>
              <input
                type="color"
                value={color.hex}
                aria-label={`Change colour ${index + 1}`}
                onChange={(event) =>
                  changePaletteColor(color.id, event.target.value)
                }
              />
              {index > 0 && document.palette.length > 2 ? (
                <button
                  className="remove-button"
                  aria-label={`Remove colour ${index + 1}`}
                  onClick={() => removeColor(color.id)}
                >
                  ×
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}
