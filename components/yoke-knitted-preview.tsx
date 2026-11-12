"use client";
import { useState, type RefObject } from "react";
import type { ChartDocument } from "@/lib/chart";
import type { YokePreviewView, YokeSweaterView } from "@/lib/yoke-preview-view";
import { yokeRepeatSides } from "@/lib/yoke-repeat-labels";
import { ConnectedKnitPreview } from "./connected-knit-preview";
import { YokePhotoSample } from "./yoke-photo-sample";
import {
  fitsSweaterPhoto,
  SWEATER_PREVIEW_TOO_DEEP,
} from "@/lib/yoke-photo-preview";

export function YokeKnittedPreview({
  document,
  canvasRef,
  stale,
  onRefresh,
}: {
  document: ChartDocument;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  stale: boolean;
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [view, setView] = useState<
    Exclude<YokePreviewView, YokeSweaterView> | "sweater"
  >("whole");
  const [repeat, setRepeat] = useState(0);
  const repeatCount = document.yoke?.measurements.repeats ?? 1;
  const selectedRepeat = Math.min(repeat, repeatCount - 1);
  const sweaterUnavailable = view === "sweater" && !fitsSweaterPhoto(document);
  return (
    <details
      className="preview panel"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="panel-heading collapsible-heading">
        <div className="preview-heading-copy">
          <h1>Knitted up</h1>
        </div>
        <span className="collapse-label">
          Show / hide <span aria-hidden="true">⌄</span>
        </span>
      </summary>
      {open ? (
        <div className="preview-content">
          <div className="repeat-controls">
            <label>
              View
              <select
                className="yoke-preview-view-select"
                value={view}
                onChange={(event) => setView(event.target.value as typeof view)}
              >
                <option value="whole">Whole yoke</option>
                <option value="front">Front half</option>
                <option value="back">Back half</option>
                <option value="repeat">One repeat</option>
                <option value="sweater">Sweater</option>
              </select>
            </label>
            {view === "repeat" ? (
              <label>
                Preview repeat
                <select
                  value={selectedRepeat}
                  onChange={(event) => setRepeat(Number(event.target.value))}
                >
                  {yokeRepeatSides(repeatCount).map(({ name, repeats }) => (
                    <optgroup key={name} label={name}>
                      {repeats.map(({ number, section }) => (
                        <option key={section} value={section}>
                          {number} · {name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
            ) : null}
            <button
              className="primary-button refresh-preview-button"
              onClick={onRefresh}
            >
              Refresh preview
            </button>
          </div>
          {stale ? (
            <p className="preview-stale-note" role="status">
              Preview needs a refresh.
            </p>
          ) : null}
          {sweaterUnavailable ? (
            <p role="status">{SWEATER_PREVIEW_TOO_DEEP}</p>
          ) : view === "sweater" ? (
            <YokePhotoSample document={document} canvasRef={canvasRef} />
          ) : (
            <ConnectedKnitPreview
              document={document}
              canvasRef={canvasRef}
              showDiagnostics={false}
              yokeView={view}
              yokeRepeat={view === "repeat" ? selectedRepeat : undefined}
            />
          )}
        </div>
      ) : null}
    </details>
  );
}
