"use client";
import type { YokeTools } from "./use-yoke-tools";
const zoomLevels = [1, 5, 10, 15, 25, 50, 75, 100, 150, 200, 300, 400];

export function YokeDrawingTools({
  tools,
  color,
  zoom,
  minimumZoom = 15,
  setZoom,
  undo,
  redo,
  canUndo,
  canRedo,
  onErase,
  onFillSelection,
  selectionLabel,
  moveIncreaseUnavailable,
}: {
  tools: YokeTools;
  color: number;
  zoom: number;
  minimumZoom?: number;
  setZoom: (value: number) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onErase?: () => void;
  onFillSelection?: () => void;
  selectionLabel?: string;
  moveIncreaseUnavailable?: string;
}) {
  const { selection } = tools;
  return (
    <div className="panel-heading editor-heading">
      <h1 className="visually-hidden">Yoke editor</h1>
      <div className="editor-actions">
        <div className="tool-group" aria-label="Drawing tools">
          {(
            [
              ["pencil", "Draw"],
              ["fill", "Fill"],
              ["row-fill", "Fill row section"],
              ["eraser", "Erase"],
              ["select", "Select"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              className={tools.tool === value ? "active" : ""}
              onClick={() => {
                tools.setTool(value);
                if (value === "eraser") onErase?.();
              }}
            >
              {label}
            </button>
          ))}
          <button
            aria-pressed={tools.tool === "move-increase"}
            className={tools.tool === "move-increase" ? "active" : ""}
            disabled={Boolean(moveIncreaseUnavailable)}
            title={
              moveIncreaseUnavailable ??
              "Pick an M1L or M1R, then choose its new cell"
            }
            onClick={() => {
              tools.setSelection(null);
              tools.setTool("move-increase");
              onErase?.();
            }}
          >
            Move increase
          </button>
          <button onClick={tools.clearAll}>Clear</button>
        </div>
        <span className="toolbar-divider" aria-hidden="true" />
        <div
          className="transform-controls"
          aria-label={selection ? "Transform selection" : "Transform design"}
        >
          <button
            aria-label={
              selection
                ? "Mirror selection left to right"
                : "Mirror design left to right"
            }
            onClick={() => tools.transform("horizontal")}
            title={
              selection
                ? "Mirror selection"
                : tools.allRepeats
                  ? "Mirror the whole yoke"
                  : tools.group.length > 1
                    ? "Mirror each repeat in the group"
                    : `Mirror repeat ${tools.repeatNumber} only`
            }
          >
            ↔
          </button>
        </div>
        <span className="toolbar-divider" aria-hidden="true" />
        <div className="undo-controls" aria-label="Edit history">
          <button aria-label="Undo" disabled={!canUndo} onClick={undo}>
            ↺
          </button>
          <button aria-label="Redo" disabled={!canRedo} onClick={redo}>
            ↻
          </button>
        </div>
        <div
          className="zoom-controls yoke-zoom-controls"
          aria-label="Yoke zoom controls"
        >
          <button
            aria-label="Zoom out"
            disabled={zoom <= minimumZoom}
            onClick={() =>
              setZoom(
                zoomLevels
                  .filter((value) => value >= minimumZoom && value < zoom)
                  .at(-1) ?? minimumZoom,
              )
            }
          >
            −
          </button>
          <select
            aria-label="Yoke zoom"
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          >
            {[...new Set([...zoomLevels, zoom])]
              .sort((a, b) => a - b)
              .map((value) => (
                <option
                  key={value}
                  value={value}
                  disabled={value < minimumZoom}
                >
                  {value}%
                </option>
              ))}
          </select>
          <button
            aria-label="Zoom in"
            disabled={zoom >= zoomLevels.at(-1)!}
            onClick={() =>
              setZoom(
                zoomLevels.find((value) => value > zoom) ?? zoomLevels.at(-1)!,
              )
            }
          >
            +
          </button>
        </div>
      </div>

      <div
        className="yoke-selection-tools"
        style={{
          display:
            tools.tool === "select" || selection || tools.clipboard
              ? undefined
              : "none",
        }}
      >
        <button
          disabled={!selection}
          onClick={() =>
            onFillSelection
              ? onFillSelection()
              : tools.edit({ type: "fill-yarn", color: `yarn-${color}` })
          }
        >
          {selectionLabel ?? "Fill selection"}
        </button>
        <button disabled={!selection} onClick={tools.copy}>
          Copy
        </button>
        <button disabled={!selection} onClick={tools.cut}>
          Cut
        </button>
        <button disabled={!tools.clipboard} onClick={tools.paste}>
          Paste
        </button>
        <span className="selection-move-controls" aria-label="Move selection">
          {(
            [
              ["left", 0, -1, "←"],
              ["up", -1, 0, "↑"],
              ["down", 1, 0, "↓"],
              ["right", 0, 1, "→"],
            ] as const
          ).map(([label, rows, columns, icon]) => (
            <button
              key={label}
              disabled={!selection}
              aria-label={`Move selection ${label}`}
              onClick={() => tools.edit({ type: "move", rows, columns })}
            >
              {icon}
            </button>
          ))}
        </span>
        <button disabled={!selection} onClick={() => tools.setSelection(null)}>
          Deselect
        </button>
      </div>
    </div>
  );
}
