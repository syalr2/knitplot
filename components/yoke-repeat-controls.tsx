"use client";

import { useId, useRef, useState } from "react";
import {
  yokeRepeatList,
  yokeRepeatNumber,
  yokeRepeatSides,
} from "@/lib/yoke-repeat-labels";
import type { YokeTools } from "./use-yoke-tools";

export function YokeRepeatControls({
  count,
  tools,
}: {
  count: number;
  tools: YokeTools;
}) {
  const [picker, setPicker] = useState<"edit" | "copy" | null>(null);
  const [chosen, setChosen] = useState<number[]>([]);
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  const sides = yokeRepeatSides(count);
  const viewingNumber = yokeRepeatNumber(tools.repeat, count);
  const copy = picker === "copy";
  const destinations = sides.flatMap(({ repeats }) =>
    repeats
      .filter(({ section }) => section !== tools.repeat)
      .map(({ section }) => section),
  );

  function open(kind: "edit" | "copy") {
    setChosen(kind === "edit" ? [...tools.group] : []);
    setPicker(kind);
  }

  function close() {
    dialog.current?.close();
    setPicker(null);
  }

  function apply() {
    if (copy) tools.copyRepeatTo(chosen);
    else tools.setScope(chosen);
    close();
  }

  return (
    <>
      <div className="yoke-editing-scope" data-tour="yoke-editing-scope">
        <label>
          Viewing&nbsp;repeat
          <select
            aria-label="Viewing repeat"
            value={tools.repeat}
            onChange={(event) => tools.setRepeat(Number(event.target.value))}
          >
            {sides.map(({ name, repeats }) => (
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
        <label>
          Edit:
          <select
            aria-label="Edit scope"
            title={
              tools.group.length
                ? `Editing repeats ${yokeRepeatList(tools.group, count)}`
                : undefined
            }
            style={{ maxWidth: "min(320px, 58vw)" }}
            value={
              tools.allRepeats ? "all" : tools.group.length ? "current" : "one"
            }
            onChange={(event) => {
              if (event.target.value === "choose") open("edit");
              else tools.setScope(event.target.value === "all");
            }}
          >
            <option value="one">
              {tools.allRepeats || tools.group.length
                ? "This repeat"
                : `Repeat ${viewingNumber}`}
            </option>
            {tools.group.length ? (
              <option value="current">
                Repeats {yokeRepeatList(tools.group, count)}
              </option>
            ) : null}
            <option value="choose">
              {tools.group.length
                ? "Change selected repeats…"
                : "Selected repeats…"}
            </option>
            <option value="all">All repeats</option>
          </select>
        </label>
        <button
          className="secondary-button"
          aria-haspopup="dialog"
          onClick={() => open("copy")}
        >
          Copy repeat…
        </button>
        {tools.group.length > 0 && !tools.group.includes(tools.repeat) ? (
          <span>Repeat {viewingNumber} is outside the edit group.</span>
        ) : null}
      </div>
      {picker ? (
        <dialog
          className="import-dialog close-tab-dialog"
          role="dialog"
          aria-labelledby={title}
          ref={(node) => {
            dialog.current = node;
            if (node && !node.open) node.showModal();
          }}
          onCancel={(event) => {
            event.preventDefault();
            close();
          }}
        >
          <div className="import-dialog-heading">
            <h1 id={title}>
              {copy
                ? `Copy colours from repeat ${viewingNumber}`
                : "Choose repeats to edit together"}
            </h1>
            <button
              className="close-dialog"
              aria-label="Close repeat picker"
              onClick={close}
            >
              ×
            </button>
          </div>
          <p>
            {copy
              ? "Choose where to copy the colours. This replaces the destination colours, keeps their shaping, and can be undone."
              : "Future edits apply to these repeats. Their existing designs stay as they are."}
          </p>
          {copy ? (
            <button
              className="secondary-button"
              onClick={() => setChosen(destinations)}
            >
              All other repeats
            </button>
          ) : null}
          <div
            role="group"
            aria-label={copy ? "Copy destinations" : "Repeats to edit"}
          >
            {sides.map(({ name, repeats }) => {
              const available = copy
                ? repeats.filter(({ section }) => section !== tools.repeat)
                : repeats;
              if (!available.length) return null;
              return (
                <div key={name} role="group" aria-label={`${name} repeats`}>
                  <strong>{name}</strong>
                  <div className="yoke-editing-scope">
                    {available.map(({ number, section }) => (
                      <button
                        key={section}
                        className={
                          chosen.includes(section)
                            ? "primary-button"
                            : "secondary-button"
                        }
                        aria-label={`Repeat ${number}`}
                        aria-pressed={chosen.includes(section)}
                        onClick={() =>
                          setChosen((current) =>
                            current.includes(section)
                              ? current.filter((entry) => entry !== section)
                              : [...current, section].sort((a, b) => a - b),
                          )
                        }
                      >
                        {number}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="import-actions">
            <button className="secondary-button" onClick={close}>
              Cancel
            </button>
            <button
              className="primary-button"
              disabled={chosen.length < (copy ? 1 : 2)}
              onClick={apply}
            >
              {copy
                ? chosen.length
                  ? `Copy to ${chosen.length} ${chosen.length === 1 ? "repeat" : "repeats"}`
                  : "Copy colours"
                : "Apply edit scope"}
            </button>
          </div>
        </dialog>
      ) : null}
    </>
  );
}
