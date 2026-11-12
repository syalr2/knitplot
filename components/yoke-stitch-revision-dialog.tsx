"use client";
import { useId, useState } from "react";
import type { ChartDocument } from "@/lib/chart";
import { YokeCanvas } from "./yoke-canvas";
import { yokeRepeatWidths } from "@/lib/yoke-program-state";
import { yokeRepeatNumber } from "@/lib/yoke-repeat-labels";

export function YokeStitchRevisionDialog({
  base,
  proposal,
  current,
  repeat,
  tabsFull,
  onCreate,
  onApply,
  onClose,
}: {
  base: ChartDocument;
  proposal: ChartDocument;
  current: ChartDocument;
  repeat: number;
  tabsFull: boolean;
  onCreate: (doc: ChartDocument) => boolean;
  onApply: (doc: ChartDocument) => void;
  onClose: () => void;
}) {
  const id = useId(),
    [error, setError] = useState("");
  const before = yokeRepeatWidths(base.yoke!),
    after = yokeRepeatWidths(proposal.yoke!);
  const number = (section: number) =>
    yokeRepeatNumber(section, before[0].length);
  const gauge =
    proposal.yoke!.measurements.gaugeStitches /
    proposal.yoke!.measurements.gaugeMeasure;
  function commit(separateCopy: boolean) {
    if (JSON.stringify(current) !== JSON.stringify(base)) {
      setError(
        "The source chart changed. Close this preview and review your edits again.",
      );
      return;
    }
    if (separateCopy) {
      if (tabsFull) return;
      const next = { ...proposal, name: `${base.name.slice(0, 192)} revised` };
      if (!onCreate(next)) {
        setError(
          "The copy could not be opened. Your current chart is unchanged.",
        );
        return;
      }
    } else onApply(proposal);
    onClose();
  }
  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="import-dialog yoke-plan-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
      >
        <div className="import-dialog-heading">
          <h1 id={id}>Preview stitch shaping</h1>
          <button
            className="close-dialog"
            aria-label="Close stitch shaping preview"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <p>
          Lower edge:{" "}
          {(before.at(-1)!.reduce((a, b) => a + b, 0) / gauge).toFixed(1)} →{" "}
          {(after.at(-1)!.reduce((a, b) => a + b, 0) / gauge).toFixed(1)}{" "}
          {proposal.yoke!.measurements.unit}
        </p>
        <table>
          <thead>
            <tr>
              <th>Repeat</th>
              <th>Final stitches · before → after</th>
            </tr>
          </thead>
          <tbody>
            {after.at(-1)!.map((count, s) => (
              <tr key={s}>
                <td>{number(s)}</td>
                <td>
                  {before.at(-1)![s]} → {count}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="yoke-plan-comparison">
          <figure>
            <figcaption>Original · repeat {number(repeat)}</figcaption>
            <YokeCanvas
              project={base.yoke!}
              repeat={repeat}
              view="repeat"
              zoom={50}
              onPaint={() => {}}
              onStrokeStart={() => {}}
            />
          </figure>
          <figure>
            <figcaption>Proposed · repeat {number(repeat)}</figcaption>
            <YokeCanvas
              project={proposal.yoke!}
              repeat={repeat}
              view="repeat"
              zoom={50}
              onPaint={() => {}}
              onStrokeStart={() => {}}
            />
          </figure>
        </div>
        <p>
          Apply changes to this yoke with undo, or create a separate copy to
          keep the original.
        </p>
        {error ? <p role="alert">{error}</p> : null}
        {tabsFull ? (
          <p>
            All chart tabs are in use. You can still apply changes here; close a
            tab only if you want a separate copy.
          </p>
        ) : null}
        <div className="yoke-short-row-actions">
          <button className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="secondary-button"
            disabled={tabsFull}
            onClick={() => commit(true)}
          >
            Create a separate copy
          </button>
          <button className="primary-button" onClick={() => commit(false)}>
            Apply changes
          </button>
        </div>
      </section>
    </div>
  );
}
