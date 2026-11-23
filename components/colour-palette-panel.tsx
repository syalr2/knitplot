"use client";
import { useId, useRef, type Dispatch, type SetStateAction } from "react";
import type { ChartDocument, StitchAction } from "@/lib/chart";
import {
  MAX_COLOUR_NAME_LENGTH,
  MAX_PALETTE_COLOURS,
} from "@/lib/palette-colours";
type Props = {
  document: ChartDocument;
  selectedColor: string;
  structureAction: StitchAction | null;
  setSelectedColor: Dispatch<SetStateAction<string>>;
  setStructureAction: Dispatch<SetStateAction<StitchAction | null>>;
  setStitchPickerOpen: Dispatch<SetStateAction<boolean>>;
  addColor: () => void;
  changePaletteColor: (id: string, hex: string) => void;
  renameColor: (id: string, name: string | undefined) => void;
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
  renameColor,
  removeColor,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const renameTarget = useRef<string>(null);
  const dialogTitle = useId();
  const defaultName = (index: number) =>
    index === 0 ? "Background" : `Colour ${index + 1}`;
  function openRename(index: number) {
    const color = document.palette[index];
    if (!color || !nameInput.current || !dialog.current || dialog.current.open)
      return;
    renameTarget.current = color.id;
    nameInput.current.value = color.name ?? "";
    nameInput.current.placeholder = defaultName(index);
    dialog.current.showModal();
    nameInput.current.select();
  }
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
            disabled={document.palette.length >= MAX_PALETTE_COLOURS}
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
                aria-label={
                  color.name ? `Use ${color.name}` : `Use colour ${index + 1}`
                }
                aria-keyshortcuts="F2"
                onClick={(event) => {
                  if (event.ctrlKey) {
                    openRename(index);
                    return;
                  }
                  setSelectedColor(color.id);
                  setStructureAction(null);
                  setStitchPickerOpen(false);
                }}
                onDoubleClick={() => openRename(index)}
                onContextMenu={(event) => {
                  // On macOS Control-click can arrive as a context menu event.
                  if (!event.ctrlKey) return;
                  event.preventDefault();
                  openRename(index);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "F2") return;
                  event.preventDefault();
                  openRename(index);
                }}
              >
                <span className="swatch" style={{ background: color.hex }} />
                <span className="palette-name">
                  <span className="palette-colour-name" title={color.name}>
                    {color.name ?? defaultName(index)}
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
        <dialog
          className="share-preview-dialog palette-rename-dialog"
          ref={dialog}
          aria-labelledby={dialogTitle}
        >
          <h2 id={dialogTitle}>Rename colour</h2>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const name = nameInput.current?.value.trim() || undefined;
              const target = document.palette.find(
                ({ id }) => id === renameTarget.current,
              );
              if (target && name !== target.name) renameColor(target.id, name);
              dialog.current?.close();
            }}
          >
            <label>
              Colour name
              <input ref={nameInput} maxLength={MAX_COLOUR_NAME_LENGTH} />
            </label>
            <p>Leave blank to use the default name.</p>
            <div className="draft-link-actions">
              <button type="submit" className="primary-button">
                Save name
              </button>
              <button type="button" onClick={() => dialog.current?.close()}>
                Cancel
              </button>
            </div>
          </form>
        </dialog>
      </div>
    </details>
  );
}
